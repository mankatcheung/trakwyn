use super::js_string::utf16_prefix;
use crate::domain::company_briefing::CompanyBriefing;
use crate::domain::note::Note;
use crate::use_cases::constants::ai_prompt_input;

/// What the user has recorded *about this application*, as prompt text.
///
/// Deliberately not "every column on JobApplication". Most of it is workflow
/// state with nothing to write from, and `salaryRange` must never reach a
/// document the user sends to an employer: a letter that raises compensation
/// unprompted does real damage (JEF-205).
pub struct ApplicationContext<'a> {
    pub notes: &'a [Note],
    /// Cover letters only. A resume is about the candidate, not the company.
    pub briefing: Option<&'a CompanyBriefing>,
}

pub fn format_application_context(context: &ApplicationContext<'_>) -> String {
    let mut sections: Vec<String> = Vec::new();

    if !context.notes.is_empty() {
        let joined = context
            .notes
            .iter()
            .map(|note| format!("- {}", note.content))
            .collect::<Vec<_>>()
            .join("\n");
        let body = utf16_prefix(&joined, ai_prompt_input::APPLICATION_NOTES_MAX_CHARS);
        sections.push(
            [
                "My notes on this application — things I have learned that are not in the job posting. Use them where they help:",
                "---",
                body,
                "---",
            ]
            .join("\n"),
        );
    }

    if let Some(briefing) = context.briefing {
        let body = utf16_prefix(&briefing.content, ai_prompt_input::APPLICATION_BRIEFING_MAX_CHARS);
        // Explicitly framed as unverified. The briefing is itself
        // model-generated, and its own prompt acknowledges it may lack
        // reliable knowledge of the company and should hedge rather than
        // guess. Passing it through unlabelled would launder that hedge into
        // a confident claim, in a letter sent to the very company it might be
        // wrong about.
        let opening = format!(
            "<unverified_company_background generated=\"{}\">",
            briefing.generated_at.format("%Y-%m-%d")
        );
        sections.push(
            [
                opening.as_str(),
                "Background notes about this company, written by an AI that may be mistaken or out of date. Use them to judge tone and which of my experience to emphasise. Do NOT state anything from here as a fact about the company, and never reference recent events, funding, growth or news.",
                "---",
                body,
                "---",
                "</unverified_company_background>",
            ]
            .join("\n"),
        );
    }

    sections.join("\n\n")
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};

    use super::*;

    fn note(content: &str) -> Note {
        let epoch = DateTime::<Utc>::UNIX_EPOCH;
        Note {
            id: "n".to_string(),
            application_id: "app-1".to_string(),
            content: content.to_string(),
            created_at: epoch,
            updated_at: epoch,
        }
    }

    fn briefing(content: &str) -> CompanyBriefing {
        CompanyBriefing {
            id: "b".to_string(),
            application_id: "app-1".to_string(),
            content: content.to_string(),
            generated_at: DateTime::parse_from_rfc3339("2026-03-09T23:59:59.999Z")
                .unwrap()
                .with_timezone(&Utc),
        }
    }

    #[test]
    fn is_empty_when_there_is_neither_a_note_nor_a_briefing() {
        assert_eq!(
            format_application_context(&ApplicationContext { notes: &[], briefing: None }),
            ""
        );
    }

    #[test]
    fn lists_the_notes_under_their_heading() {
        let notes = [note("Recruiter is Sam"), note("They use Rust")];

        assert_eq!(
            format_application_context(&ApplicationContext { notes: &notes, briefing: None }),
            "My notes on this application — things I have learned that are not in the job posting. Use them where they help:\n---\n- Recruiter is Sam\n- They use Rust\n---"
        );
    }

    #[test]
    fn frames_the_briefing_as_unverified_and_dates_it() {
        let briefing = briefing("Acme makes anvils.");

        assert_eq!(
            format_application_context(&ApplicationContext { notes: &[], briefing: Some(&briefing) }),
            "<unverified_company_background generated=\"2026-03-09\">\nBackground notes about this company, written by an AI that may be mistaken or out of date. Use them to judge tone and which of my experience to emphasise. Do NOT state anything from here as a fact about the company, and never reference recent events, funding, growth or news.\n---\nAcme makes anvils.\n---\n</unverified_company_background>"
        );
    }

    #[test]
    fn separates_the_two_sections_with_a_blank_line() {
        let notes = [note("x")];
        let briefing = briefing("y");

        let text = format_application_context(&ApplicationContext {
            notes: &notes,
            briefing: Some(&briefing),
        });

        assert!(text.contains("- x\n---\n\n<unverified_company_background"));
    }

    #[test]
    fn caps_very_long_notes_and_briefings_instead_of_sending_them_whole() {
        let notes = [note(&"Z".repeat(5000))];
        let briefing = briefing(&"Q".repeat(5000));

        let text = format_application_context(&ApplicationContext {
            notes: &notes,
            briefing: Some(&briefing),
        });

        // The cap covers the "- " prefix too: it is applied to the joined list.
        assert!(text.contains(&format!("---\n- {}\n---", "Z".repeat(1998))));
        assert!(text.contains(&format!("---\n{}\n---\n</unverified", "Q".repeat(2000))));
    }
}
