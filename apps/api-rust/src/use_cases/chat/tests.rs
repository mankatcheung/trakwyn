//! Prompt assembly, tool-result shaping and the history query. Mirrors
//! `chatAssembly.test.ts`, `chatToolProjection.test.ts` and
//! `GetChatHistoryUseCase.test.ts`.

use std::sync::Arc;

use chrono::{DateTime, TimeZone, Utc};

use super::chat_assembly::*;
use super::chat_tool_projection::*;
use super::tool_json::ToolJson as J;
use super::*;
use crate::domain::application::Application;
use crate::domain::conversation::Conversation;
use crate::domain::message::{Message, MessageRole};
use crate::use_cases::constants::chat;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::ports::llm_provider::{LlmRole, LlmToolCall};
use crate::use_cases::test_support::{
    application_owned_by, user_with_email, FakeConversationRepository, FakeMessageRepository,
};

fn at(y: i32, m: u32, d: u32, h: u32, min: u32, s: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(y, m, d, h, min, s).unwrap()
}

fn message(role: MessageRole, content: &str, trace: Option<&str>) -> Message {
    Message {
        id: format!("m-{content}"),
        conversation_id: "c1".into(),
        role,
        content: content.into(),
        tool_trace: trace.map(str::to_string),
        created_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

fn call(name: &str, arguments: serde_json::Value) -> LlmToolCall {
    LlmToolCall { id: "c".into(), name: name.into(), arguments }
}

mod compact {
    use super::*;

    #[test]
    fn drops_null_fields_recursively() {
        let value = J::object(vec![
            ("id", J::str("a")),
            ("salaryRange", J::Null),
            (
                "nested",
                J::object(vec![("keep", J::int(1)), ("deeper", J::object(vec![("x", J::Null)]))]),
            ),
        ]);
        assert_eq!(
            compact_for_model(&value).unwrap().stringify(),
            r#"{"id":"a","nested":{"keep":1,"deeper":{}}}"#
        );
    }

    #[test]
    fn shortens_dates_to_day_or_minute_precision() {
        let midnight = J::object(vec![("appliedAt", J::Date(at(2026, 9, 6, 0, 0, 0)))]);
        let moment = J::object(vec![("scheduledAt", J::Date(at(2026, 9, 6, 14, 30, 15)))]);
        assert_eq!(
            compact_for_model(&midnight).unwrap().stringify(),
            r#"{"appliedAt":"2026-09-06"}"#
        );
        assert_eq!(
            compact_for_model(&moment).unwrap().stringify(),
            r#"{"scheduledAt":"2026-09-06T14:30Z"}"#
        );
        assert_eq!(format_date_for_model(at(2026, 1, 2, 0, 0, 0)), "2026-01-02");
    }

    #[test]
    fn clips_long_strings_with_an_ellipsis() {
        let long = "x".repeat(chat::TOOL_RESULT_STRING_MAX_CHARS + 500);
        let out = compact_for_model(&J::object(vec![("description", J::Str(long))])).unwrap();
        let text = out.get("description").and_then(J::as_str).unwrap().to_string();
        assert_eq!(text.chars().count(), chat::TOOL_RESULT_STRING_MAX_CHARS + 1);
        assert!(text.ends_with('…'));
    }

    #[test]
    fn clipping_trims_trailing_whitespace_before_the_ellipsis() {
        assert_eq!(clip_for_model("ab  cd", 4), "ab…");
        assert_eq!(clip_for_model("short", 10), "short");
    }

    #[test]
    fn keeps_array_positions_so_a_null_element_stays_null() {
        let value =
            J::array([J::object(vec![("a", J::Null), ("b", J::int(1))]), J::Null, J::str("x")]);
        assert_eq!(compact_for_model(&value).unwrap().stringify(), r#"[{"b":1},null,"x"]"#);
    }

    #[test]
    fn passes_primitives_through() {
        assert_eq!(compact_for_model(&J::int(42)), Some(J::int(42)));
        assert_eq!(compact_for_model(&J::Bool(true)), Some(J::Bool(true)));
        assert_eq!(compact_for_model(&J::Null), None);
    }
}

mod projection {
    use super::*;

    fn application(description: Option<String>) -> Application {
        Application {
            company: "Acme".into(),
            role: "Engineer".into(),
            description,
            tags: vec!["remote".into()],
            starred: true,
            job_url: Some("https://acme.test/jobs/1".into()),
            salary_range: Some("100k".into()),
            applied_at: Some(at(2026, 1, 2, 0, 0, 0)),
            ..application_owned_by("app-1", "u1")
        }
    }

    #[test]
    fn a_list_row_has_a_short_preview_and_no_workflow_columns() {
        let row = project_application_summary(&application(Some("d".repeat(1000))));
        let description = row.get("description").and_then(J::as_str).unwrap();
        assert_eq!(description.chars().count(), chat::LIST_DESCRIPTION_MAX_CHARS + 1);
        for absent in
            ["userId", "boardPosition", "reminderSentAt", "deletedAt", "createdAt", "jobUrl"]
        {
            assert!(row.get(absent).is_none(), "{absent}");
        }
        assert_eq!(row.get("starred"), Some(&J::Bool(true)));
    }

    #[test]
    fn an_unstarred_untagged_row_omits_both() {
        let mut app = application(None);
        app.starred = false;
        app.tags.clear();
        let row = project_application_summary(&app);
        assert!(row.get("starred").is_none());
        assert!(row.get("tags").is_none());
        assert!(row.get("description").is_none());
    }

    #[test]
    fn the_detail_view_has_the_bounded_full_text_plus_url_and_salary() {
        let detail = project_application_detail(&application(Some("d".repeat(5000))));
        let description = detail.get("description").and_then(J::as_str).unwrap();
        assert_eq!(description.chars().count(), chat::DETAIL_DESCRIPTION_MAX_CHARS + 1);
        assert_eq!(detail.get("jobUrl").and_then(J::as_str), Some("https://acme.test/jobs/1"));
        assert_eq!(detail.get("salaryRange").and_then(J::as_str), Some("100k"));
        assert!(detail.get("createdAt").is_some());
    }

    #[test]
    fn a_twenty_row_page_of_postings_shrinks_by_an_order_of_magnitude() {
        let apps: Vec<Application> = (0..20).map(|_| application(Some("d".repeat(8000)))).collect();
        let full = entities_json(&apps);
        let page = crate::use_cases::jobs::GetApplicationsPageOutput {
            items: apps,
            next_cursor: None,
            has_next_page: false,
        };
        let projected = page_json(&page, project_application_summary).stringify();
        assert!(projected.len() * 10 < full.len());
    }

    fn entities_json(apps: &[Application]) -> String {
        crate::use_cases::chat::tool_entities::applications(apps).stringify()
    }
}

mod history_assembly {
    use super::*;

    #[test]
    fn marks_the_last_system_block_so_prompt_and_custom_prompt_cache_together() {
        let mut user = user_with_email("u1", "a@b.test");
        user.custom_ai_prompt = Some("Be brief.".into());
        let messages = build_chat_messages(&[], "hi", Some(&user));
        assert_eq!(messages.len(), 3);
        assert!(!messages[0].cache_breakpoint);
        assert!(messages[1].cache_breakpoint);
        assert_eq!(messages[1].content, "Be brief.");
        assert!(!messages[2].cache_breakpoint);
    }

    #[test]
    fn marks_the_fixed_prompt_when_there_is_no_custom_prompt() {
        let messages = build_chat_messages(&[], "hi", None);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].content, CHAT_SYSTEM_PROMPT);
        assert!(messages[0].cache_breakpoint);
    }

    #[test]
    fn marks_the_last_stored_message_and_leaves_the_new_one_unmarked() {
        let history =
            [message(MessageRole::User, "one", None), message(MessageRole::Assistant, "two", None)];
        let messages = build_chat_messages(&history, "three", None);
        let flags: Vec<bool> = messages.iter().map(|m| m.cache_breakpoint).collect();
        assert_eq!(flags, [true, false, true, false]);
        assert_eq!(messages.last().unwrap().role, LlmRole::User);
    }

    #[test]
    fn uses_at_most_two_markers_leaving_room_for_the_tool_loops() {
        let history = [message(MessageRole::User, "one", None)];
        let user = {
            let mut user = user_with_email("u1", "a@b.test");
            user.custom_ai_prompt = Some("x".into());
            user
        };
        let count = build_chat_messages(&history, "two", Some(&user))
            .iter()
            .filter(|m| m.cache_breakpoint)
            .count();
        assert_eq!(count, 2);
    }

    fn sized(sizes: &[usize]) -> Vec<Message> {
        sizes
            .iter()
            .enumerate()
            .map(|(i, n)| {
                let mut m = message(MessageRole::User, &"x".repeat(*n), None);
                m.id = format!("m{i}");
                m
            })
            .collect()
    }

    #[test]
    fn trimming_keeps_everything_that_fits() {
        let history = sized(&[10, 10, 10]);
        assert_eq!(trim_history_to_budget(&history, 100).len(), 3);
    }

    #[test]
    fn trimming_drops_the_oldest_first() {
        let history = sized(&[50, 40, 30]);
        let kept = trim_history_to_budget(&history, 75);
        assert_eq!(kept.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), ["m1", "m2"]);
    }

    #[test]
    fn trimming_keeps_the_newest_alone_when_even_it_is_over_budget() {
        let history = sized(&[10, 500]);
        assert_eq!(trim_history_to_budget(&history, 100)[0].id, "m1");
        assert!(trim_history_to_budget(&[], 10).is_empty());
    }

    #[test]
    fn a_stored_trace_renders_back_into_the_assistant_turn_only() {
        let history = [
            message(MessageRole::User, "which apps?", Some("ignored on a user turn")),
            message(MessageRole::Assistant, "You have two.", Some("list_applications → 2 results")),
            message(MessageRole::Assistant, "plain", None),
        ];
        let contents: Vec<String> =
            history_to_prompt_messages(&history).into_iter().map(|m| m.content).collect();
        assert_eq!(
            contents,
            [
                "which apps?",
                "You have two.\n\n[Looked up for this reply: list_applications → 2 results]",
                "plain"
            ]
        );
    }

    #[test]
    fn derives_a_title_from_the_first_message() {
        assert_eq!(derive_chat_title("  hello  "), "hello");
        let long = format!("{} tail", "word ".repeat(20));
        let title = derive_chat_title(&long);
        assert!(title.ends_with('…'));
        assert!(title.chars().count() <= chat::TITLE_MAX_LENGTH + 1);
        assert!(!title.contains("  "));
    }

    #[test]
    fn fences_a_tool_result_as_data() {
        let text = format_tool_result_for_model("list_notes", &J::array([J::int(1)]));
        assert_eq!(text, "<tool_result name=\"list_notes\">\n[1]\n</tool_result>");
    }
}

mod trace {
    use super::*;
    use serde_json::json;

    fn row(id: &str, company: &str, role: &str) -> J {
        J::object(vec![("id", J::str(id)), ("company", J::str(company)), ("role", J::str(role))])
    }

    #[test]
    fn summarises_a_page_as_ids_and_names_never_the_payload() {
        let page = J::object(vec![
            (
                "items",
                J::array([
                    J::object(vec![
                        ("id", J::str("app-1")),
                        ("company", J::str("Acme")),
                        ("role", J::str("Engineer")),
                        ("description", J::str("x".repeat(500))),
                    ]),
                    row("app-2", "Globex", "Staff"),
                ]),
            ),
            ("hasNextPage", J::Bool(false)),
        ]);
        let line =
            summarize_tool_result(&call("list_applications", json!({"status": "applied"})), &page);
        assert_eq!(
            line,
            r#"list_applications({"status":"applied"}) → 2 results: app-1 Acme/Engineer, app-2 Globex/Staff"#
        );
    }

    #[test]
    fn caps_the_rows_it_names_and_counts_the_rest() {
        let items = J::array((0..14).map(|i| {
            J::object(vec![("id", J::str(format!("s{i}"))), ("name", J::str(format!("Skill {i}")))])
        }));
        let line = summarize_tool_result(&call("list_skills", json!({})), &items);
        assert!(line.starts_with("list_skills → 14 results: s0 Skill 0, "));
        assert!(line.ends_with(", +4 more"));
    }

    #[test]
    fn records_a_failed_call_and_a_single_record_by_its_label() {
        let failed = J::object(vec![("error", J::str("Application not found"))]);
        assert_eq!(
            summarize_tool_result(
                &call("get_application", json!({"applicationId": "nope"})),
                &failed
            ),
            r#"get_application({"applicationId":"nope"}) → error: Application not found"#
        );
        assert_eq!(
            summarize_tool_result(
                &call("get_application", json!({})),
                &row("app-1", "Acme", "Engineer")
            ),
            "get_application → app-1 Acme/Engineer"
        );
    }

    #[test]
    fn an_empty_or_unlabelled_result_is_ok_or_zero() {
        assert_eq!(
            summarize_tool_result(&call("list_notes", json!({})), &J::Array(vec![])),
            "list_notes → 0 results"
        );
        assert_eq!(
            summarize_tool_result(
                &call("get_analytics", json!({})),
                &J::object(vec![("a", J::int(1))])
            ),
            "get_analytics → ok"
        );
    }

    #[test]
    fn one_result_is_singular() {
        let line =
            summarize_tool_result(&call("list_notes", json!({})), &J::array([row("n1", "A", "B")]));
        assert_eq!(line, "list_notes → 1 result: n1 A/B");
    }
}

mod get_chat_history {
    use super::*;

    fn conversation(user_id: &str) -> Conversation {
        Conversation {
            id: "c1".into(),
            user_id: user_id.into(),
            title: None,
            llm_provider: None,
            llm_model: None,
            created_at: DateTime::<Utc>::UNIX_EPOCH,
            updated_at: DateTime::<Utc>::UNIX_EPOCH,
        }
    }

    fn use_case(owner: Option<&str>, messages: Vec<Message>) -> GetChatHistoryUseCase {
        let messages = Arc::new(FakeMessageRepository::with(messages));
        let conversations =
            FakeConversationRepository::with(owner.map(conversation).into_iter().collect())
                .with_messages(&messages);
        GetChatHistoryUseCase {
            message_repository: messages,
            conversation_repository: Arc::new(conversations),
        }
    }

    fn input(user_id: &str) -> GetChatHistoryInput {
        GetChatHistoryInput { user_id: user_id.into(), conversation_id: "c1".into() }
    }

    #[tokio::test]
    async fn returns_the_messages_of_the_users_conversation() {
        let stored = vec![message(MessageRole::User, "hi", None)];
        let got = use_case(Some("u1"), stored.clone()).execute(input("u1")).await.unwrap();
        assert_eq!(got, stored);
    }

    #[tokio::test]
    async fn returns_nothing_for_a_conversation_without_messages() {
        assert!(use_case(Some("u1"), vec![]).execute(input("u1")).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_missing_conversation_is_not_found() {
        let err = use_case(None, vec![]).execute(input("u1")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Conversation not found");
    }

    #[tokio::test]
    async fn another_users_conversation_is_forbidden() {
        let err = use_case(Some("u2"), vec![]).execute(input("u1")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}
