use super::js_string::js_trim;
use super::prose_to_tiptap_doc::{doc_json, TiptapDoc, TiptapNode};
use crate::domain::resume::ResumeContent;

const SEPARATOR: &str = " — ";

fn is_present(value: &str) -> bool {
    !js_trim(value).is_empty()
}

/// A bullet list of the non-blank items, or nothing when there are none.
fn bullets(items: &[String]) -> Option<TiptapNode> {
    let list_items: Vec<TiptapNode> = items
        .iter()
        .filter(|item| is_present(item))
        .map(|item| TiptapNode::with_children("listItem", vec![TiptapNode::paragraph(item)]))
        .collect();
    (!list_items.is_empty()).then(|| TiptapNode::with_children("bulletList", list_items))
}

/// Renders a generated resume as the ProseMirror document the draft editor
/// stores in `DocumentDraft.contentJson`.
///
/// Headings and bullet lists rather than flat paragraphs: the editor runs
/// Tiptap's StarterKit, which supports both, and a resume flattened to prose
/// loses the structure that makes it a resume (JEF-199).
///
/// Empty paragraphs carry no `content` array: an empty ProseMirror text node
/// is invalid and makes the editor throw when it loads the draft.
pub fn resume_to_tiptap_doc(resume: &ResumeContent) -> TiptapDoc {
    let mut nodes: Vec<TiptapNode> = Vec::new();
    let mut lines: Vec<String> = Vec::new();

    if let Some(summary) = resume.summary.as_deref().filter(|summary| is_present(summary)) {
        nodes.push(TiptapNode::heading(1, "Summary"));
        nodes.push(TiptapNode::paragraph(summary));
        lines.push("Summary".to_string());
        lines.push(summary.to_string());
    }

    if !resume.experience.is_empty() {
        nodes.push(TiptapNode::heading(1, "Experience"));
        lines.push(String::new());
        lines.push("Experience".to_string());
        for role in &resume.experience {
            let title = match role.period.as_deref().filter(|period| !period.is_empty()) {
                Some(period) => format!("{}{SEPARATOR}{} ({period})", role.title, role.company),
                None => format!("{}{SEPARATOR}{}", role.title, role.company),
            };
            nodes.push(TiptapNode::heading(2, &title));
            nodes.extend(bullets(&role.bullets));
            lines.push(title);
            lines.extend(role.bullets.iter().map(|bullet| format!("- {bullet}")));
        }
    }

    if !resume.education.is_empty() {
        nodes.push(TiptapNode::heading(1, "Education"));
        lines.push(String::new());
        lines.push("Education".to_string());
        for entry in &resume.education {
            let line = [
                entry.qualification.as_deref(),
                Some(entry.institution.as_str()),
                entry.period.as_deref(),
            ]
            .into_iter()
            .flatten()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(SEPARATOR);
            nodes.push(TiptapNode::paragraph(&line));
            lines.push(line);
        }
    }

    if !resume.skills.is_empty() {
        nodes.push(TiptapNode::heading(1, "Skills"));
        lines.push(String::new());
        lines.push("Skills".to_string());
        for group in &resume.skills {
            let line = format!("{}: {}", group.category, group.items.join(", "));
            nodes.push(TiptapNode::paragraph(&line));
            lines.push(line);
        }
    }

    // A ProseMirror doc may not be empty.
    if nodes.is_empty() {
        nodes.push(TiptapNode::paragraph(""));
    }

    TiptapDoc { content_json: doc_json(nodes), plain_text: js_trim(&lines.join("\n")).to_string() }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;
    use crate::domain::resume::{ResumeEducationEntry, ResumeExperienceEntry, ResumeSkillGroup};

    fn resume() -> ResumeContent {
        ResumeContent {
            summary: Some("Backend engineer.".to_string()),
            experience: vec![ResumeExperienceEntry {
                company: "Acme".to_string(),
                title: "Senior Engineer".to_string(),
                period: Some("2020 - Present".to_string()),
                bullets: vec!["Built the API.".to_string(), "Led a team.".to_string()],
            }],
            education: vec![ResumeEducationEntry {
                institution: "State University".to_string(),
                qualification: Some("BSc Computer Science".to_string()),
                period: Some("2012 - 2016".to_string()),
            }],
            skills: vec![ResumeSkillGroup {
                category: "Languages".to_string(),
                items: vec!["Rust".to_string(), "TypeScript".to_string()],
            }],
        }
    }

    fn nodes(resume: &ResumeContent) -> Vec<Value> {
        let doc: Value = serde_json::from_str(&resume_to_tiptap_doc(resume).content_json).unwrap();
        doc["content"].as_array().unwrap().clone()
    }

    #[test]
    fn renders_headings_and_bullet_lists_not_flat_paragraphs() {
        let nodes = nodes(&resume());
        let types: Vec<&str> = nodes.iter().map(|node| node["type"].as_str().unwrap()).collect();

        assert_eq!(
            types,
            vec![
                "heading",
                "paragraph",
                "heading",
                "heading",
                "bulletList",
                "heading",
                "paragraph",
                "heading",
                "paragraph"
            ]
        );
        assert_eq!(
            nodes[0],
            json!({ "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Summary" }] })
        );
    }

    #[test]
    fn puts_the_role_employer_and_period_in_one_heading() {
        let nodes = nodes(&resume());

        assert_eq!(nodes[3]["attrs"]["level"], 2);
        assert_eq!(nodes[3]["content"][0]["text"], "Senior Engineer — Acme (2020 - Present)");
    }

    #[test]
    fn leaves_the_period_out_of_the_heading_when_there_is_none() {
        let mut resume = resume();
        resume.experience[0].period = None;

        assert_eq!(nodes(&resume)[3]["content"][0]["text"], "Senior Engineer — Acme");
    }

    #[test]
    fn writes_a_bullet_per_achievement() {
        let nodes = nodes(&resume());
        let items = nodes[4]["content"].as_array().unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(
            items[0],
            json!({ "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Built the API." }] }] })
        );
    }

    #[test]
    fn omits_a_bullet_list_for_a_role_with_no_bullets() {
        let mut resume = resume();
        resume.experience[0].bullets = vec![];

        let nodes = nodes(&resume);

        assert!(nodes.iter().all(|node| node["type"] != "bulletList"));
    }

    #[test]
    fn never_emits_an_empty_text_node_which_the_editor_rejects_on_load() {
        let mut resume = resume();
        resume.experience[0].bullets = vec!["  ".to_string(), "Real.".to_string()];
        resume.education[0] = ResumeEducationEntry::default();

        let doc = resume_to_tiptap_doc(&resume);

        assert!(!doc.content_json.contains(r#""text":"""#));
        assert!(!doc.content_json.contains(r#""text":"  ""#));
    }

    #[test]
    fn produces_a_valid_document_even_when_the_resume_is_entirely_empty() {
        let doc = resume_to_tiptap_doc(&ResumeContent::default());

        assert_eq!(doc.content_json, r#"{"type":"doc","content":[{"type":"paragraph"}]}"#);
        assert_eq!(doc.plain_text, "");
    }

    #[test]
    fn keeps_a_plain_text_rendering_alongside_for_search_and_the_match_scorer() {
        assert_eq!(
            resume_to_tiptap_doc(&resume()).plain_text,
            "Summary\nBackend engineer.\n\nExperience\nSenior Engineer — Acme (2020 - Present)\n- Built the API.\n- Led a team.\n\nEducation\nBSc Computer Science — State University — 2012 - 2016\n\nSkills\nLanguages: Rust, TypeScript"
        );
    }

    #[test]
    fn the_stored_json_keeps_apps_apis_key_order() {
        let resume = ResumeContent { summary: Some("Hi.".to_string()), ..ResumeContent::default() };

        assert_eq!(
            resume_to_tiptap_doc(&resume).content_json,
            r#"{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Summary"}]},{"type":"paragraph","content":[{"type":"text","text":"Hi."}]}]}"#
        );
    }
}
