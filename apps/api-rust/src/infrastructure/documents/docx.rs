//! The raw text of a `.docx` file.
//!
//! This reproduces what mammoth's `extractRawText` returns, which is what
//! `apps/api` feeds its prompts: the text of every paragraph in the main
//! document part, each followed by a blank line, with a tab for each
//! `w:tab`. Line breaks inside a paragraph contribute nothing, deleted
//! (tracked-change) text is left out, and headers, footers, footnotes and
//! comments are not part of the body. Only the elements mammoth reads are
//! descended into; anything else is skipped with its content.

use std::io::{Cursor, Read, Seek};

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::attributes::Attributes;
use quick_xml::events::{BytesStart, Event};
use quick_xml::name::ResolveResult;
use quick_xml::NsReader;
use zip::ZipArchive;

const PACKAGE_RELATIONSHIPS_PATH: &str = "_rels/.rels";
const FALLBACK_DOCUMENT_PATH: &str = "word/document.xml";
const OFFICE_DOCUMENT_RELATIONSHIP_TYPES: [&str; 2] = [
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
];

/// Namespace URI → the prefix element names are matched under, whatever
/// prefix the file itself declares. Transitional and strict OOXML both map.
const NAMESPACE_PREFIXES: [(&str, &str); 9] = [
    ("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w"),
    ("http://purl.oclc.org/ooxml/wordprocessingml/main", "w"),
    ("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "wp"),
    ("http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing", "wp"),
    ("http://schemas.openxmlformats.org/package/2006/relationships", "relationships"),
    ("http://schemas.openxmlformats.org/markup-compatibility/2006", "mc"),
    ("urn:schemas-microsoft-com:vml", "v"),
    ("urn:schemas-microsoft-com:office:word", "office-word"),
    ("http://schemas.microsoft.com/office/word/2010/wordml", "wordml"),
];

const NO_BREAK_HYPHEN: &str = "\u{2011}";
const SOFT_HYPHEN: &str = "\u{00AD}";
const PARAGRAPH_END: &str = "\n\n";

#[derive(Debug, thiserror::Error)]
pub enum DocxError {
    #[error("the file is not a zip archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("a part of the archive could not be read: {0}")]
    Io(#[from] std::io::Error),
    #[error("a part of the archive is not well-formed XML: {0}")]
    Xml(String),
    #[error("Could not find main document part. Are you sure this is a valid .docx file?")]
    NoMainDocument,
    #[error("Could not find the body element: are you sure this is a docx file?")]
    NoBody,
}

#[derive(Debug)]
enum Node {
    Element(Element),
    Text(String),
}

#[derive(Debug, Default)]
struct Element {
    /// `prefix:local` under the canonical prefix, or the bare local name.
    name: String,
    attributes: Vec<(String, String)>,
    children: Vec<Node>,
}

impl Element {
    fn elements(&self) -> impl Iterator<Item = &Element> {
        self.children.iter().filter_map(|node| match node {
            Node::Element(element) => Some(element),
            Node::Text(_) => None,
        })
    }

    fn first(&self, name: &str) -> Option<&Element> {
        self.elements().find(|element| element.name == name)
    }

    fn attribute(&self, name: &str) -> Option<&str> {
        self.attributes.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }

    /// The element's own text: its direct text nodes, not its descendants'.
    fn text(&self) -> String {
        self.children
            .iter()
            .filter_map(|node| match node {
                Node::Text(text) => Some(text.as_str()),
                Node::Element(_) => None,
            })
            .collect()
    }
}

fn xml_error(err: impl std::fmt::Display) -> DocxError {
    DocxError::Xml(err.to_string())
}

fn qualified(namespace: ResolveResult<'_>, local: &[u8]) -> String {
    let local = String::from_utf8_lossy(local);
    let prefix = match namespace {
        ResolveResult::Bound(namespace) => NAMESPACE_PREFIXES
            .iter()
            .find(|(uri, _)| uri.as_bytes() == namespace.0)
            .map(|(_, prefix)| *prefix),
        _ => None,
    };
    match (prefix, namespace) {
        (Some(prefix), _) => format!("{prefix}:{local}"),
        // An unmapped namespace keeps its URI, so it can never be mistaken
        // for an element this reader knows.
        (None, ResolveResult::Bound(namespace)) => {
            format!("{{{}}}{local}", String::from_utf8_lossy(namespace.0))
        }
        (None, _) => local.into_owned(),
    }
}

fn read_attributes(
    reader: &NsReader<&[u8]>,
    attributes: Attributes<'_>,
) -> Result<Vec<(String, String)>, DocxError> {
    let mut result = Vec::new();
    for attribute in attributes {
        let attribute = attribute.map_err(xml_error)?;
        if attribute.key.as_namespace_binding().is_some() {
            continue;
        }
        let (namespace, local) = reader.resolve_attribute(attribute.key);
        let name = qualified(namespace, local.as_ref());
        let value = attribute.unescape_value().map_err(xml_error)?.into_owned();
        result.push((name, value));
    }
    Ok(result)
}

fn start_element(reader: &NsReader<&[u8]>, start: &BytesStart<'_>) -> Result<Element, DocxError> {
    let (namespace, local) = reader.resolve_element(start.name());
    Ok(Element {
        name: qualified(namespace, local.as_ref()),
        attributes: read_attributes(reader, start.attributes())?,
        children: Vec::new(),
    })
}

/// Parses a part into a tree. Whitespace is kept exactly: `w:t` text is
/// significant to the last space.
fn parse_xml(xml: &str) -> Result<Element, DocxError> {
    let xml = xml.strip_prefix('\u{FEFF}').unwrap_or(xml);
    let mut reader = NsReader::from_reader(xml.as_bytes());
    // The root's parent: whatever is at the top level ends up as its child.
    let mut stack = vec![Element::default()];

    fn append(stack: &mut [Element], node: Node) {
        if let Some(parent) = stack.last_mut() {
            parent.children.push(node);
        }
    }

    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        match reader.read_event_into(&mut buffer).map_err(xml_error)? {
            Event::Start(start) => stack.push(start_element(&reader, &start)?),
            Event::Empty(start) => {
                let element = start_element(&reader, &start)?;
                append(&mut stack, Node::Element(element));
            }
            Event::End(_) => {
                if stack.len() > 1 {
                    if let Some(element) = stack.pop() {
                        append(&mut stack, Node::Element(element));
                    }
                }
            }
            Event::Text(text) => {
                let text = text.decode().map_err(xml_error)?.into_owned();
                append(&mut stack, Node::Text(text));
            }
            Event::GeneralRef(reference) => {
                let resolved = match reference.resolve_char_ref().map_err(xml_error)? {
                    Some(ch) => ch.to_string(),
                    None => {
                        let name = reference.decode().map_err(xml_error)?;
                        resolve_predefined_entity(&name)
                            .ok_or_else(|| xml_error(format!("unknown entity &{name};")))?
                            .to_string()
                    }
                };
                append(&mut stack, Node::Text(resolved));
            }
            Event::Eof => break,
            // CDATA, comments, declarations and processing instructions
            // carry no body text.
            _ => {}
        }
    }

    let root = stack.into_iter().next().unwrap_or_default();
    let document_element = root.children.into_iter().find_map(|node| match node {
        Node::Element(element) => Some(element),
        Node::Text(_) => None,
    });
    document_element.ok_or_else(|| xml_error("the part has no root element"))
}

/// Replaces every `mc:AlternateContent`, at any depth, with the content of
/// its `mc:Fallback`.
fn collapse_alternate_content(element: &mut Element) {
    let children = std::mem::take(&mut element.children);
    for child in children {
        match child {
            Node::Element(mut child) if child.name == "mc:AlternateContent" => {
                let fallback = child.children.drain(..).find_map(|node| match node {
                    Node::Element(element) if element.name == "mc:Fallback" => Some(element),
                    _ => None,
                });
                if let Some(mut fallback) = fallback {
                    collapse_alternate_content(&mut fallback);
                    element.children.extend(fallback.children);
                }
            }
            Node::Element(mut child) => {
                collapse_alternate_content(&mut child);
                element.children.push(Node::Element(child));
            }
            text @ Node::Text(_) => element.children.push(text),
        }
    }
}

/// What reading an element produced: its text in place, and "extra" text
/// that belongs after the enclosing paragraph (the content of a `w:pict`,
/// typically a text box).
#[derive(Debug, Default)]
struct Fragment {
    text: String,
    extra: String,
}

impl Fragment {
    fn text(text: impl Into<String>) -> Self {
        Self { text: text.into(), extra: String::new() }
    }
}

#[derive(Default)]
struct BodyReader<'a> {
    /// The content of paragraphs whose paragraph mark was deleted: it joins
    /// the next surviving paragraph.
    deleted_paragraph_contents: Vec<&'a Node>,
    /// Set while reading a checkbox content control: its first non-empty
    /// text is the checkbox glyph, which is not text.
    checkbox_pending: bool,
}

impl<'a> BodyReader<'a> {
    fn read_nodes(&mut self, nodes: impl IntoIterator<Item = &'a Node>) -> Fragment {
        let mut result = Fragment::default();
        for node in nodes {
            if let Node::Element(element) = node {
                let read = self.read_element(element);
                result.text.push_str(&read.text);
                result.extra.push_str(&read.extra);
            }
        }
        result
    }

    fn read_children(&mut self, element: &'a Element) -> Fragment {
        self.read_nodes(&element.children)
    }

    fn emit_text(&mut self, text: String) -> Fragment {
        if self.checkbox_pending && !text.is_empty() {
            self.checkbox_pending = false;
            return Fragment::default();
        }
        Fragment::text(text)
    }

    fn read_element(&mut self, element: &'a Element) -> Fragment {
        match element.name.as_str() {
            "w:p" => self.read_paragraph(element),
            "w:t" => self.emit_text(element.text()),
            "w:tab" => Fragment::text("\t"),
            "w:noBreakHyphen" => self.emit_text(NO_BREAK_HYPHEN.to_string()),
            "w:softHyphen" => self.emit_text(SOFT_HYPHEN.to_string()),
            "w:tbl" => self.read_table(element),
            "w:tr" => self.read_table_row(element),
            "w:sdt" => self.read_content_control(element),
            "w:pict" => {
                let read = self.read_children(element);
                Fragment { text: String::new(), extra: read.extra + &read.text }
            }
            "w:r" | "w:hyperlink" | "w:tc" | "w:ins" | "w:object" | "w:smartTag" | "w:drawing"
            | "v:roundrect" | "v:shape" | "v:textbox" | "w:txbxContent" | "v:group" | "v:rect" => {
                self.read_children(element)
            }
            // Properties, deletions, breaks, images, note references, field
            // codes and everything unrecognised: no text.
            _ => Fragment::default(),
        }
    }

    fn read_paragraph(&mut self, element: &'a Element) -> Fragment {
        let is_deleted = element
            .first("w:pPr")
            .and_then(|properties| properties.first("w:rPr"))
            .and_then(|run_properties| run_properties.first("w:del"))
            .is_some();
        if is_deleted {
            self.deleted_paragraph_contents.extend(&element.children);
            return Fragment::default();
        }

        let carried = std::mem::take(&mut self.deleted_paragraph_contents);
        let read = self.read_nodes(carried.into_iter().chain(&element.children));
        Fragment::text(read.text + PARAGRAPH_END + &read.extra)
    }

    fn read_table_row(&mut self, element: &'a Element) -> Fragment {
        let is_deleted =
            element.first("w:trPr").and_then(|properties| properties.first("w:del")).is_some();
        if is_deleted {
            return Fragment::default();
        }
        self.read_children(element)
    }

    /// A cell that continues a vertical merge is dropped, content and all,
    /// when a cell above it in the same column started one.
    fn read_table(&mut self, element: &'a Element) -> Fragment {
        let is_plain_grid = element
            .elements()
            .filter(|child| !matches!(child.name.as_str(), "w:tblPr" | "w:tblGrid"))
            .all(|row| {
                row.name == "w:tr"
                    && row
                        .elements()
                        .all(|cell| matches!(cell.name.as_str(), "w:tc" | "w:trPr" | "w:tblPrEx"))
            });
        if !is_plain_grid {
            return self.read_children(element);
        }

        let mut merge_open_in_column = std::collections::HashSet::new();
        let mut result = Fragment::default();
        for row in element.elements().filter(|child| child.name == "w:tr") {
            let is_deleted =
                row.first("w:trPr").and_then(|properties| properties.first("w:del")).is_some();
            if is_deleted {
                continue;
            }
            let mut column = 0usize;
            for cell in row.elements().filter(|child| child.name == "w:tc") {
                let properties = cell.first("w:tcPr");
                let continues_merge = properties
                    .and_then(|properties| properties.first("w:vMerge"))
                    .is_some_and(|merge| merge.attribute("w:val").is_none_or(|v| v == "continue"));
                let span = properties
                    .and_then(|properties| properties.first("w:gridSpan"))
                    .and_then(|span| span.attribute("w:val"))
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(1);

                if !(continues_merge && merge_open_in_column.contains(&column)) {
                    merge_open_in_column.insert(column);
                    let read = self.read_children(cell);
                    result.text.push_str(&read.text);
                    result.extra.push_str(&read.extra);
                }
                column += span;
            }
        }
        result
    }

    fn read_content_control(&mut self, element: &'a Element) -> Fragment {
        let Some(content) = element.first("w:sdtContent") else {
            return Fragment::default();
        };
        let is_checkbox = element
            .first("w:sdtPr")
            .and_then(|properties| properties.first("wordml:checkbox"))
            .is_some();
        if !is_checkbox {
            return self.read_children(content);
        }

        let outer = std::mem::replace(&mut self.checkbox_pending, true);
        let read = self.read_children(content);
        self.checkbox_pending = outer;
        read
    }
}

fn read_part<R: Read + Seek>(archive: &mut ZipArchive<R>, path: &str) -> Result<String, DocxError> {
    let mut bytes = Vec::new();
    archive.by_name(path)?.read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// The main document part: the package relationship of type
/// `officeDocument` if it points at a file that exists, else
/// `word/document.xml`.
fn main_document_path<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<String, DocxError> {
    let mut path = FALLBACK_DOCUMENT_PATH.to_string();
    if archive.index_for_name(PACKAGE_RELATIONSHIPS_PATH).is_some() {
        let relationships = parse_xml(&read_part(archive, PACKAGE_RELATIONSHIPS_PATH)?)?;
        let target = relationships
            .elements()
            .filter(|relationship| relationship.name == "relationships:Relationship")
            .filter(|relationship| {
                relationship
                    .attribute("Type")
                    .is_some_and(|kind| OFFICE_DOCUMENT_RELATIONSHIP_TYPES.contains(&kind))
            })
            .filter_map(|relationship| relationship.attribute("Target"))
            .map(|target| target.trim_start_matches('/').to_string())
            .find(|target| archive.index_for_name(target).is_some());
        if let Some(target) = target {
            path = target;
        }
    }

    if archive.index_for_name(&path).is_none() {
        return Err(DocxError::NoMainDocument);
    }
    Ok(path)
}

pub fn extract_raw_text(bytes: &[u8]) -> Result<String, DocxError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))?;
    let path = main_document_path(&mut archive)?;
    let mut document = parse_xml(&read_part(&mut archive, &path)?)?;
    collapse_alternate_content(&mut document);

    let body = document.first("w:body").ok_or(DocxError::NoBody)?;
    // Extra text with no paragraph to follow is dropped, as mammoth drops it.
    Ok(BodyReader::default().read_children(body).text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const W: &str = r#"xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main""#;

    fn docx_with(parts: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (path, content) in parts {
            writer.start_file(*path, SimpleFileOptions::default()).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn body_text(body: &str) -> String {
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?><w:document {W} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>{body}</w:body></w:document>"#
        );
        extract_raw_text(&docx_with(&[("word/document.xml", &xml)])).unwrap()
    }

    #[test]
    fn each_paragraph_ends_with_a_blank_line() {
        let text = body_text(
            "<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>Two</w:t></w:r></w:p>",
        );
        assert_eq!(text, "One\n\n\n\nTwo\n\n");
    }

    #[test]
    fn runs_join_without_a_separator_and_keep_their_spaces() {
        let text = body_text(
            r#"<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t> world </w:t></w:r></w:p>"#,
        );
        assert_eq!(text, "Hello  world \n\n");
    }

    #[test]
    fn tabs_become_tabs_and_line_breaks_vanish() {
        let text = body_text(
            "<w:p><w:r><w:t>Acme</w:t><w:tab/><w:t>2020</w:t><w:br/><w:t>Engineer</w:t><w:cr/></w:r></w:p>",
        );
        assert_eq!(text, "Acme\t2020Engineer\n\n");
    }

    #[test]
    fn a_tab_stop_definition_is_not_a_tab() {
        let text = body_text(
            r#"<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9000"/></w:tabs></w:pPr><w:r><w:t>x</w:t></w:r></w:p>"#,
        );
        assert_eq!(text, "x\n\n");
    }

    #[test]
    fn entities_and_non_ascii_text_are_decoded() {
        let text = body_text(
            "<w:p><w:r><w:t>R&amp;D &lt;caf&#233;&gt; &#x65E5;本 — naïve</w:t></w:r></w:p>",
        );
        assert_eq!(text, "R&D <café> 日本 — naïve\n\n");
    }

    #[test]
    fn special_hyphens_are_text() {
        let text = body_text(
            "<w:p><w:r><w:t>co</w:t><w:noBreakHyphen/><w:t>op</w:t><w:softHyphen/></w:r></w:p>",
        );
        assert_eq!(text, "co\u{2011}op\u{00AD}\n\n");
    }

    #[test]
    fn hyperlinks_and_insertions_are_read_and_deletions_are_not() {
        let text = body_text(
            "<w:p><w:hyperlink><w:r><w:t>link</w:t></w:r></w:hyperlink>\
             <w:ins><w:r><w:t> added</w:t></w:r></w:ins>\
             <w:del><w:r><w:delText> removed</w:delText></w:r></w:del>\
             <w:r><w:delText>gone</w:delText><w:instrText>PAGE</w:instrText></w:r></w:p>",
        );
        assert_eq!(text, "link added\n\n");
    }

    #[test]
    fn table_cells_are_read_row_by_row() {
        let cell =
            |text: &str| format!("<w:tc><w:tcPr/><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:tc>");
        let text = body_text(&format!(
            "<w:tbl><w:tblPr/><w:tblGrid/><w:tr>{}{}</w:tr><w:tr>{}{}</w:tr></w:tbl>",
            cell("a1"),
            cell("b1"),
            cell("a2"),
            cell("b2")
        ));
        assert_eq!(text, "a1\n\nb1\n\na2\n\nb2\n\n");
    }

    #[test]
    fn a_deleted_row_and_a_merged_away_cell_are_dropped() {
        let text = body_text(
            r#"<w:tbl>
                <w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>tall</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b1</w:t></w:r></w:p></w:tc></w:tr>
                <w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc><w:tc><w:p><w:r><w:t>b2</w:t></w:r></w:p></w:tc></w:tr>
                <w:tr><w:trPr><w:del/></w:trPr><w:tc><w:p><w:r><w:t>deleted</w:t></w:r></w:p></w:tc></w:tr>
            </w:tbl>"#,
        );
        assert_eq!(text, "tall\n\nb1\n\nb2\n\n");
    }

    #[test]
    fn a_deleted_paragraph_mark_joins_the_next_paragraph() {
        let text = body_text(
            "<w:p><w:pPr><w:rPr><w:del/></w:rPr></w:pPr><w:r><w:t>first </w:t></w:r></w:p>\
             <w:p><w:r><w:t>second</w:t></w:r></w:p>",
        );
        assert_eq!(text, "first second\n\n");
    }

    #[test]
    fn alternate_content_uses_its_fallback() {
        let text = body_text(
            "<w:p><w:r><mc:AlternateContent><mc:Choice><w:t>choice</w:t></mc:Choice>\
             <mc:Fallback><w:t>fallback</w:t></mc:Fallback></mc:AlternateContent></w:r></w:p>",
        );
        assert_eq!(text, "fallback\n\n");
    }

    #[test]
    fn a_text_box_follows_the_paragraph_it_is_anchored_in() {
        let text = body_text(
            "<w:p><w:r><w:t>before </w:t></w:r><w:r><w:pict><v:shape><v:textbox><w:txbxContent>\
             <w:p><w:r><w:t>boxed</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>\
             <w:r><w:t>after</w:t></w:r></w:p>",
        );
        assert_eq!(text, "before after\n\nboxed\n\n");
    }

    #[test]
    fn content_controls_are_read_and_a_checkbox_glyph_is_not() {
        let text = body_text(
            "<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>inside</w:t></w:r></w:p></w:sdtContent></w:sdt>\
             <w:p><w:sdt><w:sdtPr><w14:checkbox/></w:sdtPr><w:sdtContent><w:r><w:t>\u{2612}</w:t></w:r></w:sdtContent></w:sdt>\
             <w:r><w:t> Remote</w:t></w:r></w:p>",
        );
        assert_eq!(text, "inside\n\n Remote\n\n");
    }

    #[test]
    fn unrecognised_elements_are_skipped_with_their_content() {
        let text = body_text(
            r#"<w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>7</w:t></w:r></w:fldSimple><w:r><w:t>kept</w:t></w:r></w:p><w:sectPr/>"#,
        );
        assert_eq!(text, "kept\n\n");
    }

    #[test]
    fn element_names_are_matched_by_namespace_not_prefix() {
        let xml = r#"<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body><x:p><x:r><x:t>renamed</x:t></x:r></x:p></x:body></x:document>"#;
        let text = extract_raw_text(&docx_with(&[("word/document.xml", xml)])).unwrap();
        assert_eq!(text, "renamed\n\n");
    }

    #[test]
    fn the_package_relationship_names_the_main_document() {
        let rels = r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/custom/main.xml"/></Relationships>"#;
        let main = format!(
            "<w:document {W}><w:body><w:p><w:r><w:t>custom</w:t></w:r></w:p></w:body></w:document>"
        );
        let decoy = format!(
            "<w:document {W}><w:body><w:p><w:r><w:t>decoy</w:t></w:r></w:p></w:body></w:document>"
        );
        let bytes = docx_with(&[
            ("_rels/.rels", rels),
            ("custom/main.xml", &main),
            ("word/document.xml", &decoy),
        ]);
        assert_eq!(extract_raw_text(&bytes).unwrap(), "custom\n\n");
    }

    #[test]
    fn bytes_that_are_not_a_zip_are_rejected() {
        assert!(matches!(extract_raw_text(b"not a docx"), Err(DocxError::Zip(_))));
    }

    #[test]
    fn a_zip_without_a_document_part_is_rejected() {
        let err = extract_raw_text(&docx_with(&[("other.txt", "hi")])).unwrap_err();
        assert_eq!(
            err.to_string(),
            "Could not find main document part. Are you sure this is a valid .docx file?"
        );
    }

    #[test]
    fn a_document_without_a_body_is_rejected() {
        let xml = format!("<w:document {W}/>");
        let err = extract_raw_text(&docx_with(&[("word/document.xml", &xml)])).unwrap_err();
        assert!(matches!(err, DocxError::NoBody));
    }

    #[test]
    fn malformed_xml_is_rejected() {
        let xml = format!("<w:document {W}><w:body><w:p></w:body>");
        let err = extract_raw_text(&docx_with(&[("word/document.xml", &xml)])).unwrap_err();
        assert!(matches!(err, DocxError::Xml(_)));
    }
}
