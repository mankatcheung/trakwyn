use pdf_extract::{Document as ParsedPdf, Object};
use serde_json::{json, Value};

use super::*;
use crate::infrastructure::documents::DocumentTextExtractor;
use crate::use_cases::constants::mime_type;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::ports::DocumentTextExtractor as _;

async fn render(title: &str, content: &Value) -> Vec<u8> {
    render_json(title, &content.to_string()).await.unwrap()
}

async fn render_json(title: &str, content_json: &str) -> DomainResult<Vec<u8>> {
    let data = PdfRenderData { title: title.to_string(), content_json: content_json.to_string() };
    PdfDocumentRenderer::new().render(data).await
}

/// The PDF's text, read back with the service's own extractor.
async fn text_of(pdf: &[u8]) -> String {
    DocumentTextExtractor::new().extract(pdf.to_vec(), mime_type::PDF).await.unwrap()
}

/// Line breaks and runs of spaces are layout; the words and their order are content.
fn words(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn page_count(pdf: &[u8]) -> usize {
    ParsedPdf::load_mem(pdf).unwrap().get_pages().len()
}

fn number(object: &Object) -> f64 {
    match object {
        Object::Integer(value) => *value as f64,
        Object::Real(value) => f64::from(*value),
        other => panic!("not a number: {other:?}"),
    }
}

/// The `BaseFont` names of the fonts embedded in the file, subset tags removed.
fn embedded_fonts(pdf: &[u8]) -> Vec<String> {
    let parsed = ParsedPdf::load_mem(pdf).unwrap();
    let mut names: Vec<String> = parsed
        .objects
        .values()
        .filter_map(|object| object.as_dict().ok())
        .filter(|dict| dict.get(b"Subtype").and_then(Object::as_name).ok() == Some(&b"Type0"[..]))
        .filter_map(|dict| dict.get(b"BaseFont").and_then(Object::as_name).ok())
        .map(|name| String::from_utf8_lossy(name).into_owned())
        .map(|name| name.split_once('+').map_or(name.clone(), |(_, base)| base.to_string()))
        .collect();
    names.sort();
    names.dedup();
    names
}

fn text(value: &str) -> Value {
    json!({ "type": "text", "text": value })
}

fn marked(value: &str, marks: &[&str]) -> Value {
    let marks: Vec<Value> = marks.iter().map(|mark| json!({ "type": mark })).collect();
    json!({ "type": "text", "text": value, "marks": marks })
}

fn paragraph(content: Vec<Value>) -> Value {
    json!({ "type": "paragraph", "content": content })
}

fn heading(level: u8, value: &str) -> Value {
    json!({ "type": "heading", "attrs": { "level": level }, "content": [text(value)] })
}

fn list(kind: &str, items: &[&str]) -> Value {
    let items: Vec<Value> = items
        .iter()
        .map(|item| json!({ "type": "listItem", "content": [paragraph(vec![text(item)])] }))
        .collect();
    json!({ "type": kind, "content": items })
}

/// A draft using every node and mark the editor can produce.
fn every_node_and_mark() -> Value {
    json!({ "type": "doc", "content": [
        heading(1, "Professional Summary"),
        paragraph(vec![
            text("Engineer with "),
            marked("ten years", &["bold"]),
            text(" of "),
            marked("backend", &["italic"]),
            text(" and "),
            marked("platform", &["bold", "italic"]),
            text(" work, "),
            marked("underlined", &["underline"]),
            text(" too. See "),
            json!({
                "type": "text",
                "text": "my site",
                "marks": [{ "type": "link", "attrs": { "href": "https://example.com" } }],
            }),
            text("."),
        ]),
        heading(2, "Skills"),
        list("bulletList", &["Rust and TypeScript", "PostgreSQL"]),
        heading(3, "Career"),
        list("orderedList", &["Joined Acme", "Led the platform team"]),
        paragraph(vec![text("First line"), json!({ "type": "hardBreak" }), text("second line")]),
        json!({ "type": "blockquote", "content": [paragraph(vec![text("Quoted words")])] }),
        json!({ "type": "horizontalRule" }),
        paragraph(vec![]),
        paragraph(vec![text("References on request.")]),
    ]})
}

#[tokio::test]
async fn renders_a_pdf_file() {
    let pdf = render("Jane Doe", &every_node_and_mark()).await;

    assert!(pdf.starts_with(b"%PDF-"));
    let tail = String::from_utf8_lossy(&pdf[pdf.len() - 16..]).into_owned();
    assert!(tail.trim_end().ends_with("%%EOF"), "{tail:?}");
    assert_eq!(page_count(&pdf), 1);
}

#[tokio::test]
async fn the_content_is_all_there_in_reading_order() {
    let pdf = render("Jane Doe", &every_node_and_mark()).await;

    assert_eq!(
        words(&text_of(&pdf).await),
        "Jane Doe \
         Professional Summary \
         Engineer with ten years of backend and platform work, underlined too. See my site. \
         Skills \
         \u{2022} Rust and TypeScript \
         \u{2022} PostgreSQL \
         Career \
         \u{2022} Joined Acme \
         \u{2022} Led the platform team \
         First linesecond line \
         References on request."
    );
}

#[tokio::test]
async fn each_block_starts_its_own_line() {
    let pdf = render("Jane Doe", &every_node_and_mark()).await;
    let extracted = text_of(&pdf).await;
    let lines: Vec<&str> = extracted.lines().filter(|line| !line.is_empty()).collect();

    assert_eq!(
        lines,
        vec![
            "Jane Doe",
            "Professional Summary",
            "Engineer with ten years of backend and platform work, underlined too. See my site.",
            "Skills",
            "\u{2022} Rust and TypeScript",
            "\u{2022} PostgreSQL",
            "Career",
            "\u{2022} Joined Acme",
            "\u{2022} Led the platform team",
            "First linesecond line",
            "References on request.",
        ]
    );
}

#[tokio::test]
async fn pages_are_a4() {
    let pdf = render("Jane Doe", &every_node_and_mark()).await;
    let parsed = ParsedPdf::load_mem(&pdf).unwrap();
    let page_id = *parsed.get_pages().get(&1).unwrap();
    let page = parsed.get_dictionary(page_id).unwrap();

    let media_box: Vec<f64> =
        page.get(b"MediaBox").unwrap().as_array().unwrap().iter().map(number).collect();
    assert_eq!(media_box.len(), 4);
    for (actual, expected) in media_box.iter().zip([0.0, 0.0, 595.28, 841.89]) {
        assert!((actual - expected).abs() < 0.01, "{media_box:?}");
    }
}

#[tokio::test]
async fn bold_and_italic_text_use_their_own_fonts() {
    let plain = json!({ "type": "doc", "content": [paragraph(vec![text("plain only")])] });
    // The title is always bold.
    assert_eq!(
        embedded_fonts(&render("Title", &plain).await),
        vec!["LiberationSans", "LiberationSans-Bold"]
    );

    assert_eq!(
        embedded_fonts(&render("Title", &every_node_and_mark()).await),
        vec!["LiberationSans", "LiberationSans-Bold", "LiberationSans-Italic"]
    );
}

#[tokio::test]
async fn fonts_are_subset_not_embedded_whole() {
    let pdf = render("Jane Doe", &every_node_and_mark()).await;
    // Each bundled font is about 400 KB.
    assert!(pdf.len() < 100_000, "{} bytes", pdf.len());
}

#[tokio::test]
async fn non_ascii_text_is_rendered_as_written() {
    let samples = [
        "Zo\u{eb} Fran\u{e7}ois \u{2014} na\u{ef}ve caf\u{e9}, \u{153}uvre, Stra\u{df}e, \u{a3}5 \u{20ac}9",
        "\u{141}\u{f3}d\u{17a}, \u{10c}esk\u{e1} republika, \u{15e}i\u{15f}li, Gy\u{151}r",
        "\u{395}\u{3bb}\u{3bb}\u{3b7}\u{3bd}\u{3b9}\u{3ba}\u{3ac} \u{3ba}\u{3b1}\u{3b9} \u{3bc}\u{3b1}\u{3b8}\u{3b7}\u{3bc}\u{3b1}\u{3c4}\u{3b9}\u{3ba}\u{3ac}",
        "\u{418}\u{43d}\u{436}\u{435}\u{43d}\u{435}\u{440} \u{43f}\u{43e} \u{440}\u{430}\u{437}\u{440}\u{430}\u{431}\u{43e}\u{442}\u{43a}\u{435}",
        "\u{201c}Quoted\u{201d} \u{2018}single\u{2019} \u{2026} 10\u{b0} \u{b1}2 \u{d7}3 \u{2122} \u{a9}",
    ];
    let content = json!({
        "type": "doc",
        "content": samples.iter().map(|sample| paragraph(vec![text(sample)])).collect::<Vec<_>>(),
    });

    let pdf = render("R\u{e9}sum\u{e9} \u{2014} \u{c5}sa \u{d8}stergaard", &content).await;

    let extracted = text_of(&pdf).await;
    let lines: Vec<&str> = extracted.lines().filter(|line| !line.is_empty()).collect();
    let mut expected = vec!["R\u{e9}sum\u{e9} \u{2014} \u{c5}sa \u{d8}stergaard"];
    expected.extend(samples);
    assert_eq!(lines, expected);
}

#[tokio::test]
async fn text_the_font_has_no_glyph_for_does_not_disturb_the_rest() {
    // Liberation Sans has no CJK or emoji glyphs: such characters are drawn
    // as the font's "missing glyph" box and carry no text of their own.
    let content = json!({ "type": "doc", "content": [
        paragraph(vec![text("Tokyo \u{6771}\u{4eac} office \u{1f389}")]),
        paragraph(vec![text("Next paragraph")]),
    ]});
    let pdf = render("Title", &content).await;
    assert_eq!(words(&text_of(&pdf).await), "Title Tokyo office Next paragraph");
}

#[tokio::test]
async fn a_long_paragraph_wraps_inside_the_margins() {
    let sentence = "The quick brown fox jumps over the lazy dog near the riverbank.";
    let body = [sentence; 12].join(" ");
    let content = json!({ "type": "doc", "content": [paragraph(vec![text(&body)])] });

    let pdf = render("Wrapping", &content).await;

    let extracted = text_of(&pdf).await;
    assert_eq!(words(&extracted), format!("Wrapping {body}"));
    let lines: Vec<&str> = extracted.lines().filter(|line| !line.is_empty()).collect();
    // 515pt of 11pt Helvetica-metric text holds roughly 100 characters.
    assert!((8..=12).contains(&lines.len()), "{} lines", lines.len());
    for line in &lines[1..] {
        assert!(line.len() <= 115, "{line:?}");
    }
    assert_eq!(page_count(&pdf), 1);
}

#[tokio::test]
async fn a_long_document_runs_onto_more_pages_in_order() {
    let paragraphs: Vec<Value> = (1..=120)
        .map(|n| paragraph(vec![text(&format!("Paragraph number {n} of the long document."))]))
        .collect();
    let content = json!({ "type": "doc", "content": paragraphs });

    let pdf = render("Long", &content).await;

    // Title: 27 + 16. Each paragraph: 16.5 + 8. The page holds 761.89pt.
    assert_eq!(page_count(&pdf), 4);
    let expected: Vec<String> = std::iter::once("Long".to_string())
        .chain((1..=120).map(|n| format!("Paragraph number {n} of the long document.")))
        .collect();
    assert_eq!(words(&text_of(&pdf).await), expected.join(" "));
}

#[tokio::test]
async fn one_very_long_paragraph_is_split_across_pages() {
    let body = vec!["word"; 6000].join(" ");
    let content = json!({ "type": "doc", "content": [paragraph(vec![text(&body)])] });

    let pdf = render("Long", &content).await;

    assert!(page_count(&pdf) >= 3, "{} pages", page_count(&pdf));
    assert_eq!(words(&text_of(&pdf).await), format!("Long {body}"));
}

#[tokio::test]
async fn content_that_is_not_json_renders_the_title_alone() {
    let pdf = render_json("Only the title", "{not json").await.unwrap();
    assert_eq!(text_of(&pdf).await, "Only the title");
    assert_eq!(page_count(&pdf), 1);
}

#[tokio::test]
async fn an_empty_document_renders_the_title_alone() {
    let pdf = render("Empty", &json!({ "type": "doc", "content": [] })).await;
    assert_eq!(text_of(&pdf).await, "Empty");
}

#[tokio::test]
async fn an_empty_title_and_document_is_still_a_one_page_pdf() {
    let pdf = render("", &json!({ "type": "doc" })).await;
    assert!(pdf.starts_with(b"%PDF-"));
    assert_eq!(page_count(&pdf), 1);
    assert_eq!(text_of(&pdf).await, "");
}

#[tokio::test]
async fn json_null_content_fails_as_it_does_in_the_original() {
    let err = render_json("Title", "null").await.unwrap_err();
    assert_eq!(err.code(), ErrorCode::InternalError);
}

#[test]
fn the_bundled_fonts_load_and_have_helveticas_metrics() {
    let fonts = Fonts::load().unwrap();
    // Helvetica's AFM widths, in thousandths of an em.
    for (face, ch, width) in [
        (FontFace::Regular, 'a', 556.0),
        (FontFace::Regular, ' ', 278.0),
        (FontFace::Regular, 'W', 944.0),
        (FontFace::Bold, 'a', 556.0),
        (FontFace::Bold, 'r', 389.0),
        (FontFace::Italic, 'k', 500.0),
        (FontFace::Regular, '\u{2022}', 350.0),
    ] {
        let advance = fonts.advance(face, ch) * 1000.0;
        assert!((advance - width).abs() < 1.0, "{face:?} {ch:?}: {advance}");
    }
    assert!(fonts.ascent(FontFace::Regular) > 0.7 && fonts.ascent(FontFace::Regular) < 1.0);
    assert!(fonts.descent(FontFace::Regular) > 0.15 && fonts.descent(FontFace::Regular) < 0.3);
}
