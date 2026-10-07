//! Reading a draft's TipTap/ProseMirror JSON: into the styled blocks the PDF
//! is laid out from, and into plain text.
//!
//! The node set is exactly what `apps/api`'s renderer understands: `doc`,
//! `heading`, `paragraph`, `bulletList`, `orderedList`, `listItem` and
//! `text`, with the `bold` and `italic` marks. Anything else (a hard break,
//! a blockquote, a link or underline mark) contributes nothing of its own:
//! an unknown node is dropped *with its children*, and an unknown mark
//! leaves the text as it was.

use serde_json::Value;

/// The style sheet, in PDF points. The values are `apps/api`'s.
mod style {
    pub const BASE_FONT_SIZE: f32 = 11.0;

    pub const TITLE_FONT_SIZE: f32 = 18.0;
    pub const TITLE_MARGIN_BOTTOM: f32 = 16.0;

    /// Font size, top margin and bottom margin for heading levels 1, 2 and
    /// "anything else".
    pub const HEADING_1: (f32, f32, f32) = (16.0, 16.0, 8.0);
    pub const HEADING_2: (f32, f32, f32) = (14.0, 12.0, 6.0);
    pub const HEADING_3: (f32, f32, f32) = (12.0, 10.0, 4.0);

    pub const PARAGRAPH_MARGIN_BOTTOM: f32 = 8.0;

    pub const LIST_ITEM_MARGIN_BOTTOM: f32 = 4.0;
    pub const LIST_ITEM_PADDING_LEFT: f32 = 16.0;
    pub const LIST_ITEM_MARKER: &str = "\u{2022} ";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FontFace {
    Regular,
    Bold,
    Italic,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TextStyle {
    pub face: FontFace,
    pub size: f32,
}

const BODY: TextStyle = TextStyle { face: FontFace::Regular, size: style::BASE_FONT_SIZE };

/// A run of text in one style.
#[derive(Debug, Clone, PartialEq)]
pub struct Span {
    pub text: String,
    pub style: TextStyle,
}

/// One block of flowing text: the title, a heading, a paragraph or a list item.
#[derive(Debug, Clone, PartialEq)]
pub struct Block {
    pub spans: Vec<Span>,
    pub margin_top: f32,
    pub margin_bottom: f32,
    pub padding_left: f32,
}

/// The draft's content could not be turned into blocks.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ContentError {
    /// `apps/api` fails the export for this one input (it dereferences the
    /// parsed `null`), so this does too.
    #[error("the draft content is JSON null, not a document")]
    NullDocument,
}

/// The blocks of the whole PDF, in reading order: the title, then the content.
pub fn document_blocks(title: &str, content_json: &str) -> Result<Vec<Block>, ContentError> {
    let mut blocks = vec![Block {
        spans: vec![Span {
            text: title.to_string(),
            style: TextStyle { face: FontFace::Bold, size: style::TITLE_FONT_SIZE },
        }],
        margin_top: 0.0,
        margin_bottom: style::TITLE_MARGIN_BOTTOM,
        padding_left: 0.0,
    }];

    match serde_json::from_str::<Value>(content_json) {
        Ok(Value::Null) => return Err(ContentError::NullDocument),
        Ok(content) => push_blocks(&content, &mut blocks),
        // Content that does not parse renders as one empty paragraph.
        Err(_) => blocks.push(paragraph(Vec::new())),
    }
    Ok(blocks)
}

fn node_type(node: &Value) -> Option<&str> {
    node.get("type").and_then(Value::as_str)
}

fn children(node: &Value) -> &[Value] {
    node.get("content").and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

fn paragraph(spans: Vec<Span>) -> Block {
    Block {
        spans,
        margin_top: 0.0,
        margin_bottom: style::PARAGRAPH_MARGIN_BOTTOM,
        padding_left: 0.0,
    }
}

/// Levels 1 and 2 have their own style; a missing level is 1; every other
/// value (3 to 6, or something that is not the number 1 or 2) is level 3.
fn heading_style(node: &Value) -> (f32, f32, f32) {
    let level = node.get("attrs").and_then(|attrs| attrs.get("level"));
    match level {
        None | Some(Value::Null) => style::HEADING_1,
        Some(level) if level.as_f64() == Some(1.0) => style::HEADING_1,
        Some(level) if level.as_f64() == Some(2.0) => style::HEADING_2,
        Some(_) => style::HEADING_3,
    }
}

/// A node met at block level: directly under the document or a list.
fn push_blocks(node: &Value, blocks: &mut Vec<Block>) {
    match node_type(node) {
        Some("doc" | "bulletList" | "orderedList") => {
            for child in children(node) {
                push_blocks(child, blocks);
            }
        }
        Some("heading") => {
            let (size, margin_top, margin_bottom) = heading_style(node);
            let style = TextStyle { face: FontFace::Bold, size };
            let mut spans = Vec::new();
            push_inline_children(node, style, &mut spans);
            blocks.push(Block { spans, margin_top, margin_bottom, padding_left: 0.0 });
        }
        Some("paragraph") => {
            let mut spans = Vec::new();
            push_inline_children(node, BODY, &mut spans);
            blocks.push(paragraph(spans));
        }
        Some("listItem") => {
            let mut spans = Vec::new();
            push_list_item(node, BODY, &mut spans);
            blocks.push(Block {
                spans,
                margin_top: 0.0,
                margin_bottom: style::LIST_ITEM_MARGIN_BOTTOM,
                padding_left: style::LIST_ITEM_PADDING_LEFT,
            });
        }
        Some("text") => {
            let mut spans = Vec::new();
            push_text(node, BODY, &mut spans);
            blocks.push(Block { spans, margin_top: 0.0, margin_bottom: 0.0, padding_left: 0.0 });
        }
        _ => {}
    }
}

fn push_inline_children(node: &Value, inherited: TextStyle, spans: &mut Vec<Span>) {
    for child in children(node) {
        push_inline(child, inherited, spans);
    }
}

/// A node met inside a block's text. The original nests text elements here,
/// and a nested text element flows inline: it keeps its font but loses its
/// margins and padding. So a list item's paragraphs run together on one
/// line, and a list nested in a list item continues the same line with its
/// own bullet.
fn push_inline(node: &Value, inherited: TextStyle, spans: &mut Vec<Span>) {
    match node_type(node) {
        Some("doc" | "bulletList" | "orderedList" | "paragraph") => {
            push_inline_children(node, inherited, spans);
        }
        Some("heading") => {
            let (size, _, _) = heading_style(node);
            push_inline_children(node, TextStyle { face: FontFace::Bold, size }, spans);
        }
        Some("listItem") => push_list_item(node, inherited, spans),
        Some("text") => push_text(node, inherited, spans),
        _ => {}
    }
}

/// Ordered and bulleted lists both get a bullet: the original does not
/// number an ordered list.
fn push_list_item(node: &Value, inherited: TextStyle, spans: &mut Vec<Span>) {
    spans.push(Span { text: style::LIST_ITEM_MARKER.to_string(), style: inherited });
    push_inline_children(node, inherited, spans);
}

/// Bold and italic each *replace* the font, so on text carrying both the
/// later mark wins; there is no bold-italic.
fn push_text(node: &Value, inherited: TextStyle, spans: &mut Vec<Span>) {
    let mut face = inherited.face;
    let marks = node.get("marks").and_then(Value::as_array).map_or(&[][..], Vec::as_slice);
    for mark in marks {
        match node_type(mark) {
            Some("bold") => face = FontFace::Bold,
            Some("italic") => face = FontFace::Italic,
            _ => {}
        }
    }
    let text = node.get("text").and_then(Value::as_str).unwrap_or_default();
    spans.push(Span { text: text.to_string(), style: TextStyle { face, ..inherited } });
}

fn extract_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str).filter(|text| !text.is_empty()) {
        return text.to_string();
    }

    let mut text: String = children(node).iter().map(extract_text).collect();
    match node_type(node) {
        Some("paragraph" | "heading" | "bulletList" | "orderedList") => text.push('\n'),
        Some("listItem") => text.insert_str(0, "- "),
        _ => {}
    }
    text
}

/// A draft's content as plain text: a line per paragraph or heading, `- `
/// before each list item, runs of blank lines collapsed to one. Content that
/// is not a JSON document is the empty string.
pub fn prosemirror_to_plain_text(json: &str) -> String {
    let Ok(content) = serde_json::from_str::<Value>(json) else {
        return String::new();
    };
    if !content.is_object() {
        return String::new();
    }

    let text = extract_text(&content);
    let mut collapsed = String::with_capacity(text.len());
    let mut newlines = 0;
    for ch in text.chars() {
        newlines = if ch == '\n' { newlines + 1 } else { 0 };
        if newlines <= 2 {
            collapsed.push(ch);
        }
    }
    collapsed.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn content_blocks(content: Value) -> Vec<Block> {
        let mut blocks = document_blocks("Title", &content.to_string()).unwrap();
        blocks.remove(0);
        blocks
    }

    fn text_of(block: &Block) -> String {
        block.spans.iter().map(|span| span.text.as_str()).collect()
    }

    fn text(value: &str) -> Value {
        json!({ "type": "text", "text": value })
    }

    fn marked(value: &str, marks: &[&str]) -> Value {
        let marks: Vec<Value> = marks.iter().map(|mark| json!({ "type": mark })).collect();
        json!({ "type": "text", "text": value, "marks": marks })
    }

    #[test]
    fn the_title_comes_first_in_bold_18pt() {
        let blocks = document_blocks("My Resume", r#"{"type":"doc","content":[]}"#).unwrap();
        assert_eq!(blocks.len(), 1);
        assert_eq!(text_of(&blocks[0]), "My Resume");
        assert_eq!(blocks[0].spans[0].style, TextStyle { face: FontFace::Bold, size: 18.0 });
        assert_eq!((blocks[0].margin_top, blocks[0].margin_bottom), (0.0, 16.0));
    }

    #[test]
    fn headings_take_their_levels_style() {
        let heading =
            |attrs: Value| json!({ "type": "heading", "attrs": attrs, "content": [text("H")] });
        let blocks = content_blocks(json!({ "type": "doc", "content": [
            heading(json!({ "level": 1 })),
            heading(json!({ "level": 2 })),
            heading(json!({ "level": 3 })),
            heading(json!({ "level": 6 })),
            heading(json!({})),
            heading(json!({ "level": "2" })),
        ]}));

        let summary: Vec<(f32, f32, f32)> = blocks
            .iter()
            .map(|block| (block.spans[0].style.size, block.margin_top, block.margin_bottom))
            .collect();
        assert_eq!(
            summary,
            vec![
                (16.0, 16.0, 8.0),
                (14.0, 12.0, 6.0),
                (12.0, 10.0, 4.0),
                (12.0, 10.0, 4.0),
                (16.0, 16.0, 8.0),
                // A level that is not the number 1 or 2 falls through to level 3.
                (12.0, 10.0, 4.0),
            ]
        );
        assert!(blocks.iter().all(|block| block.spans[0].style.face == FontFace::Bold));
    }

    #[test]
    fn a_heading_without_attrs_is_level_one() {
        let blocks = content_blocks(
            json!({ "type": "doc", "content": [{ "type": "heading", "content": [text("H")] }] }),
        );
        assert_eq!(blocks[0].spans[0].style.size, 16.0);
    }

    #[test]
    fn paragraphs_are_body_text_with_marks_applied() {
        let blocks = content_blocks(json!({ "type": "doc", "content": [{
            "type": "paragraph",
            "content": [
                text("plain "),
                marked("bold ", &["bold"]),
                marked("italic ", &["italic"]),
                marked("underlined", &["underline"]),
            ],
        }]}));

        assert_eq!(blocks.len(), 1);
        assert_eq!(
            (blocks[0].margin_top, blocks[0].margin_bottom, blocks[0].padding_left),
            (0.0, 8.0, 0.0)
        );
        let faces: Vec<FontFace> = blocks[0].spans.iter().map(|span| span.style.face).collect();
        assert_eq!(
            faces,
            vec![FontFace::Regular, FontFace::Bold, FontFace::Italic, FontFace::Regular]
        );
        assert!(blocks[0].spans.iter().all(|span| span.style.size == 11.0));
    }

    #[test]
    fn the_later_of_bold_and_italic_wins() {
        let blocks = content_blocks(json!({ "type": "doc", "content": [{
            "type": "paragraph",
            "content": [marked("a", &["bold", "italic"]), marked("b", &["italic", "bold"])],
        }]}));
        assert_eq!(blocks[0].spans[0].style.face, FontFace::Italic);
        assert_eq!(blocks[0].spans[1].style.face, FontFace::Bold);
    }

    #[test]
    fn unmarked_heading_text_inherits_bold_and_italic_replaces_it() {
        let blocks = content_blocks(json!({ "type": "doc", "content": [{
            "type": "heading",
            "attrs": { "level": 2 },
            "content": [text("Bold "), marked("oblique", &["italic"])],
        }]}));
        assert_eq!(blocks[0].spans[0].style, TextStyle { face: FontFace::Bold, size: 14.0 });
        assert_eq!(blocks[0].spans[1].style, TextStyle { face: FontFace::Italic, size: 14.0 });
    }

    #[test]
    fn both_list_kinds_are_bulleted_and_indented() {
        let item = |value: &str| json!({ "type": "listItem", "content": [{ "type": "paragraph", "content": [text(value)] }] });
        let blocks = content_blocks(json!({ "type": "doc", "content": [
            { "type": "bulletList", "content": [item("one"), item("two")] },
            { "type": "orderedList", "content": [item("first"), item("second")] },
        ]}));

        let texts: Vec<String> = blocks.iter().map(text_of).collect();
        assert_eq!(
            texts,
            vec!["\u{2022} one", "\u{2022} two", "\u{2022} first", "\u{2022} second"]
        );
        for block in &blocks {
            assert_eq!((block.margin_bottom, block.padding_left), (4.0, 16.0));
        }
    }

    #[test]
    fn a_list_items_children_run_together_inline() {
        let blocks = content_blocks(
            json!({ "type": "doc", "content": [{ "type": "bulletList", "content": [{
                "type": "listItem",
                "content": [
                    { "type": "paragraph", "content": [text("Parent")] },
                    { "type": "paragraph", "content": [text("again")] },
                    { "type": "bulletList", "content": [{
                        "type": "listItem",
                        "content": [{ "type": "paragraph", "content": [text("child")] }],
                    }]},
                ],
            }]}]}),
        );

        assert_eq!(blocks.len(), 1);
        assert_eq!(text_of(&blocks[0]), "\u{2022} Parentagain\u{2022} child");
    }

    #[test]
    fn unknown_nodes_are_dropped_with_their_children() {
        let blocks = content_blocks(json!({ "type": "doc", "content": [
            { "type": "blockquote", "content": [{ "type": "paragraph", "content": [text("quoted")] }] },
            { "type": "paragraph", "content": [text("a"), { "type": "hardBreak" }, text("b")] },
            { "type": "horizontalRule" },
        ]}));

        assert_eq!(blocks.len(), 1);
        assert_eq!(text_of(&blocks[0]), "ab");
    }

    #[test]
    fn a_link_mark_leaves_the_text_plain() {
        let blocks = content_blocks(json!({ "type": "doc", "content": [{
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": "trakwyn.com",
                "marks": [{ "type": "link", "attrs": { "href": "https://trakwyn.com" } }],
            }],
        }]}));
        assert_eq!(blocks[0].spans, vec![Span { text: "trakwyn.com".to_string(), style: BODY }]);
    }

    #[test]
    fn an_empty_paragraph_is_a_block_with_no_text() {
        let blocks = content_blocks(json!({ "type": "doc", "content": [{ "type": "paragraph" }] }));
        assert_eq!(blocks, vec![paragraph(Vec::new())]);
    }

    #[test]
    fn content_that_is_not_json_becomes_one_empty_paragraph() {
        let blocks = document_blocks("Title", "not json").unwrap();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[1], paragraph(Vec::new()));
    }

    #[test]
    fn json_null_content_is_an_error() {
        assert_eq!(document_blocks("Title", "null"), Err(ContentError::NullDocument));
    }

    #[test]
    fn json_that_is_not_a_node_renders_only_the_title() {
        for content in ["42", "\"text\"", "[]", "{}", "true"] {
            assert_eq!(document_blocks("Title", content).unwrap().len(), 1, "{content}");
        }
    }

    #[test]
    fn plain_text_puts_each_block_on_a_line() {
        let content = json!({ "type": "doc", "content": [
            { "type": "heading", "attrs": { "level": 1 }, "content": [text("Summary")] },
            { "type": "paragraph", "content": [text("Hello "), marked("world", &["bold"])] },
            { "type": "bulletList", "content": [
                { "type": "listItem", "content": [{ "type": "paragraph", "content": [text("one")] }] },
                { "type": "listItem", "content": [{ "type": "paragraph", "content": [text("two")] }] },
            ]},
            { "type": "paragraph", "content": [text("Bye")] },
        ]});

        assert_eq!(
            prosemirror_to_plain_text(&content.to_string()),
            "Summary\nHello world\n- one\n- two\n\nBye"
        );
    }

    #[test]
    fn plain_text_collapses_runs_of_blank_lines_and_trims() {
        let content = json!({ "type": "doc", "content": [
            { "type": "paragraph" },
            { "type": "paragraph", "content": [text("a")] },
            { "type": "paragraph" },
            { "type": "paragraph" },
            { "type": "paragraph" },
            { "type": "paragraph", "content": [text("b")] },
            { "type": "paragraph" },
        ]});
        assert_eq!(prosemirror_to_plain_text(&content.to_string()), "a\n\nb");
    }

    #[test]
    fn plain_text_of_invalid_content_is_empty() {
        assert_eq!(prosemirror_to_plain_text("not json"), "");
        assert_eq!(prosemirror_to_plain_text("null"), "");
        assert_eq!(prosemirror_to_plain_text("42"), "");
    }
}
