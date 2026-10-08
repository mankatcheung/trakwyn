use super::js_string::{js_trim, utf16_prefix};
use crate::domain::document_draft::DocumentDraft;
use crate::domain::note::Note;
use crate::use_cases::constants::ai_prompt_input;

/// Opt-in context (JEF-249) drawn from the user's *other* applications
/// (recent notes and cover letter drafts), used to help cover letter and
/// resume generation match the user's voice and avoid repeating the same
/// phrasing across applications.
///
/// Deliberately anonymized: only `content` and `plain_text` are read, never
/// a company or role, and nothing here surfaces one. That is the actual
/// safeguard against a Company-A detail leaking into a Company-B document.
/// An instruction alone ("don't mention other employers") is easy for a
/// model to slip on if the other employer's name is sitting right there in
/// the prompt; not having the name in the prompt at all is a stronger
/// boundary than reminding the model not to use it. Resume generation has a
/// structural backstop this has no part in: its grounding check refuses to
/// save a resume naming any employer or institution the user did not enter.
pub fn format_cross_application_context(notes: &[Note], cover_letters: &[DocumentDraft]) -> String {
    let entries: Vec<String> = notes
        .iter()
        .map(|note| format!("- (note from a previous application) {}", note.content))
        .chain(
            cover_letters
                .iter()
                .map(|draft| js_trim(&draft.plain_text))
                .filter(|plain_text| !plain_text.is_empty())
                .map(|plain_text| {
                    format!("- (cover letter written for a previous application) {plain_text}")
                }),
        )
        .collect();

    if entries.is_empty() {
        return String::new();
    }

    let joined = entries.join("\n");
    let body = utf16_prefix(&joined, ai_prompt_input::CROSS_APPLICATION_CONTEXT_MAX_CHARS);

    [
        "Notes and cover letters from my other job applications, with the employer deliberately left out — use them only to match my usual voice, tone, and phrasing, and to avoid repeating the same wording again. Do not state or imply anything about another employer, another role, or another application in what you write, even if it seems relevant:",
        "---",
        body,
        "---",
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};

    use super::*;
    use crate::domain::document_draft::DocumentDraftType;

    fn note(content: &str) -> Note {
        let epoch = DateTime::<Utc>::UNIX_EPOCH;
        Note {
            id: "n".to_string(),
            application_id: "other-app".to_string(),
            content: content.to_string(),
            created_at: epoch,
            updated_at: epoch,
        }
    }

    fn cover_letter(plain_text: &str) -> DocumentDraft {
        let epoch = DateTime::<Utc>::UNIX_EPOCH;
        DocumentDraft {
            id: "d".to_string(),
            application_id: "other-app".to_string(),
            draft_type: DocumentDraftType::CoverLetter,
            title: "Globex — Staff Engineer".to_string(),
            content_json: "{}".to_string(),
            plain_text: plain_text.to_string(),
            source_document_id: None,
            created_at: epoch,
            updated_at: epoch,
        }
    }

    #[test]
    fn returns_an_empty_string_when_there_is_neither_a_note_nor_a_cover_letter() {
        assert_eq!(format_cross_application_context(&[], &[]), "");
    }

    #[test]
    fn includes_note_content() {
        let text = format_cross_application_context(&[note("I prefer short sentences")], &[]);

        assert!(text.contains("- (note from a previous application) I prefer short sentences"));
    }

    #[test]
    fn includes_cover_letter_plain_text_trimmed() {
        let text = format_cross_application_context(&[], &[cover_letter("  Dear team, hello.  ")]);

        assert!(text.contains(
            "- (cover letter written for a previous application) Dear team, hello.\n---"
        ));
    }

    #[test]
    fn skips_a_cover_letter_draft_with_empty_plain_text() {
        assert_eq!(format_cross_application_context(&[], &[cover_letter("   ")]), "");
    }

    #[test]
    fn never_includes_a_company_or_title_only_the_content() {
        let text = format_cross_application_context(&[note("x")], &[cover_letter("y")]);

        assert!(!text.contains("Globex"));
        assert!(!text.contains("Staff Engineer"));
    }

    #[test]
    fn instructs_the_model_not_to_name_another_employer_or_application() {
        let text = format_cross_application_context(&[note("x")], &[]);

        assert!(text.starts_with("Notes and cover letters from my other job applications, with the employer deliberately left out — use them only to match my usual voice, tone, and phrasing, and to avoid repeating the same wording again. Do not state or imply anything about another employer, another role, or another application in what you write, even if it seems relevant:\n---\n"));
        assert!(text.ends_with("\n---"));
    }

    #[test]
    fn caps_the_combined_content_instead_of_sending_it_whole() {
        let text = format_cross_application_context(&[note(&"Z".repeat(5000))], &[]);

        let prefix = "- (note from a previous application) ";
        let kept = 2000 - prefix.len();
        assert!(text.contains(&format!("---\n{prefix}{}\n---", "Z".repeat(kept))));
    }

    #[test]
    fn lists_notes_before_cover_letters() {
        let text = format_cross_application_context(&[note("first")], &[cover_letter("second")]);

        assert!(text.find("first").unwrap() < text.find("second").unwrap());
    }
}
