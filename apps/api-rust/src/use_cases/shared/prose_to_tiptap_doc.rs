use serde::Serialize;

use super::js_string::js_trim;

/// One ProseMirror node. Field order is the key order `apps/api` writes, so
/// the stored JSON is the same text whichever implementation produced it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TiptapNode {
    #[serde(rename = "type")]
    pub node_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attrs: Option<TiptapAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<TiptapNode>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TiptapAttrs {
    pub level: u8,
}

impl TiptapNode {
    fn of(node_type: &'static str) -> Self {
        Self { node_type, text: None, attrs: None, content: None }
    }

    pub fn text(value: &str) -> Self {
        Self { text: Some(value.to_string()), ..Self::of("text") }
    }

    /// A paragraph holding `value`, or an empty one (no `content` array at
    /// all) when `value` is blank: an empty text node is invalid in
    /// ProseMirror and makes the editor throw on load.
    pub fn paragraph(value: &str) -> Self {
        if js_trim(value).is_empty() {
            Self::of("paragraph")
        } else {
            Self { content: Some(vec![Self::text(value)]), ..Self::of("paragraph") }
        }
    }

    pub fn heading(level: u8, value: &str) -> Self {
        Self {
            attrs: Some(TiptapAttrs { level }),
            content: Some(vec![Self::text(value)]),
            ..Self::of("heading")
        }
    }

    pub fn with_children(node_type: &'static str, content: Vec<Self>) -> Self {
        Self { content: Some(content), ..Self::of(node_type) }
    }
}

/// `{"type":"doc","content":[…]}` as stored in `DocumentDraft.contentJson`.
pub fn doc_json(content: Vec<TiptapNode>) -> String {
    // Serialising these plain structs cannot fail.
    serde_json::to_string(&TiptapNode::with_children("doc", content)).unwrap_or_default()
}

/// Editor content and its plain-text rendering, as a draft stores them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TiptapDoc {
    pub content_json: String,
    pub plain_text: String,
}

/// Converts plain prose into the ProseMirror/Tiptap document JSON that
/// `DocumentDraft.contentJson` stores, so anything creating a draft
/// server-side produces content the editor can open.
///
/// A blank line becomes an empty paragraph with **no** content array.
pub fn prose_to_tiptap_doc(text: &str) -> TiptapDoc {
    let plain_text = js_trim(text);
    TiptapDoc {
        content_json: doc_json(plain_text.split('\n').map(TiptapNode::paragraph).collect()),
        plain_text: plain_text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;

    fn parsed(doc: &TiptapDoc) -> Value {
        serde_json::from_str(&doc.content_json).unwrap()
    }

    #[test]
    fn makes_one_paragraph_per_line() {
        let doc = prose_to_tiptap_doc("Dear team,\nI am applying.");

        assert_eq!(
            doc.content_json,
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dear team,"}]},{"type":"paragraph","content":[{"type":"text","text":"I am applying."}]}]}"#
        );
    }

    #[test]
    fn emits_a_blank_line_as_a_paragraph_with_no_content_array() {
        let doc = prose_to_tiptap_doc("First.\n\nSecond.");

        assert_eq!(parsed(&doc)["content"][1], json!({ "type": "paragraph" }));
    }

    #[test]
    fn never_emits_an_empty_text_node_anywhere() {
        let doc = prose_to_tiptap_doc("One.\n\n   \n\nTwo.");

        assert!(!doc.content_json.contains(r#""text":"""#));
        assert_eq!(parsed(&doc)["content"].as_array().unwrap().len(), 5);
    }

    #[test]
    fn keeps_the_plain_text_alongside_trimmed() {
        assert_eq!(prose_to_tiptap_doc("  Hello.\nBye.  \n").plain_text, "Hello.\nBye.");
    }

    #[test]
    fn produces_a_valid_empty_document_for_empty_input() {
        let doc = prose_to_tiptap_doc("   ");

        assert_eq!(doc.content_json, r#"{"type":"doc","content":[{"type":"paragraph"}]}"#);
        assert_eq!(doc.plain_text, "");
    }

    #[test]
    fn a_line_keeps_its_own_inner_whitespace() {
        let doc = prose_to_tiptap_doc("a\n  indented  \nb");

        assert_eq!(parsed(&doc)["content"][1]["content"][0]["text"], "  indented  ");
    }
}
