//! `McpController` and the tool catalogue. Mirrors `McpController.test.ts`
//! and `toolCatalogue.test.ts`, including the two parity tests: every
//! catalogue tool is advertised AND handled, and every call is observed.

use std::sync::Arc;

use serde_json::{json, Value};

use super::controller::{McpController, McpResult};
use super::tool_catalogue::*;
use super::write_tools::WriteToolDeps;
use crate::domain::api_token::ApiTokenScope;
use crate::use_cases::education::{CreateEducationUseCase, UpdateEducationUseCase};
use crate::use_cases::interview_rounds::CreateInterviewRoundUseCase;
use crate::use_cases::jobs::{CreateApplicationUseCase, UpdateApplicationUseCase};
use crate::use_cases::notes::CreateNoteUseCase;
use crate::use_cases::ports::tool_call_observer::{ToolCallOutcome, ToolSurface};
use crate::use_cases::skills::{CreateSkillUseCase, UpdateSkillUseCase};
use crate::use_cases::test_support::{
    application_owned_by, fake_chat_tool_deps, sequential_ids, FakeActivityLogRepository,
    FakeApplicationRepository, FakeEducationRepository, FakeInterviewRoundRepository,
    FakeNoteRepository, FakeSkillRepository, FakeTransactionManager, FakeWorkExperienceRepository,
    RecordingToolCallObserver,
};
use crate::use_cases::work_experience::{CreateWorkExperienceUseCase, UpdateWorkExperienceUseCase};

const USER: &str = "u1";

struct Fixture {
    controller: McpController,
    observer: Arc<RecordingToolCallObserver>,
    written_applications: Arc<FakeApplicationRepository>,
    written_notes: Arc<FakeNoteRepository>,
    written_skills: Arc<FakeSkillRepository>,
}

fn fixture() -> Fixture {
    let observer = Arc::new(RecordingToolCallObserver::default());
    let reads = fake_chat_tool_deps(vec![application_owned_by("app-1", USER)], observer.clone());

    let applications = Arc::new(FakeApplicationRepository::with(vec![application_owned_by("app-1", USER)]));
    let notes = Arc::new(FakeNoteRepository::default());
    let skills = Arc::new(FakeSkillRepository::default());
    let educations = Arc::new(FakeEducationRepository::default());
    let work = Arc::new(FakeWorkExperienceRepository::default());
    let activity = Arc::new(FakeActivityLogRepository::default());
    let ids = || sequential_ids("id");

    let writes = WriteToolDeps {
        create_application_use_case: CreateApplicationUseCase {
            application_repository: applications.clone(),
            generate_id: ids(),
        },
        update_application_use_case: UpdateApplicationUseCase {
            application_repository: applications.clone(),
            activity_log_repository: activity.clone(),
            generate_id: ids(),
            transaction_manager: Arc::new(FakeTransactionManager::default()),
        },
        create_note_use_case: CreateNoteUseCase {
            application_repository: applications.clone(),
            note_repository: notes.clone(),
            activity_log_repository: activity.clone(),
            generate_id: ids(),
        },
        create_interview_round_use_case: CreateInterviewRoundUseCase {
            application_repository: applications.clone(),
            interview_round_repository: Arc::new(FakeInterviewRoundRepository::default()),
            activity_log_repository: Some(activity),
            generate_id: ids(),
        },
        create_skill_use_case: CreateSkillUseCase { skill_repository: skills.clone(), generate_id: ids() },
        update_skill_use_case: UpdateSkillUseCase { skill_repository: skills.clone() },
        create_education_use_case: CreateEducationUseCase {
            education_repository: educations.clone(),
            generate_id: ids(),
        },
        update_education_use_case: UpdateEducationUseCase { education_repository: educations },
        create_work_experience_use_case: CreateWorkExperienceUseCase {
            work_experience_repository: work.clone(),
            generate_id: ids(),
        },
        update_work_experience_use_case: UpdateWorkExperienceUseCase { work_experience_repository: work },
    };
    Fixture {
        controller: McpController { reads, writes },
        observer,
        written_applications: applications,
        written_notes: notes,
        written_skills: skills,
    }
}

async fn send(f: &Fixture, body: Value, scope: ApiTokenScope) -> McpResult {
    f.controller.handle(&body, USER, scope).await
}

fn rpc(method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
}

fn call(name: &str, arguments: Value) -> Value {
    rpc("tools/call", json!({ "name": name, "arguments": arguments }))
}

fn error_of(result: &McpResult) -> (i64, String) {
    let error = &result.body["error"];
    (error["code"].as_i64().expect("an error"), error["message"].as_str().unwrap().to_string())
}

/// The `text` of a successful tools/call, parsed.
fn payload(result: &McpResult) -> Value {
    let text = result.body["result"]["content"][0]["text"].as_str().unwrap_or_else(|| {
        panic!("expected a result, got {}", result.body)
    });
    serde_json::from_str(text).unwrap()
}

mod envelope {
    use super::*;

    #[tokio::test]
    async fn rejects_a_malformed_envelope_with_400_and_invalid_request() {
        let f = fixture();
        for body in [
            json!(null),
            json!("x"),
            json!([1]),
            json!({ "id": 7, "method": "tools/list" }),
            json!({ "jsonrpc": "1.0", "id": 7, "method": "tools/list" }),
            json!({ "jsonrpc": "2.0", "id": 7 }),
            json!({ "jsonrpc": "2.0", "id": 7, "method": "" }),
        ] {
            let result = send(&f, body.clone(), ApiTokenScope::Full).await;
            assert_eq!(result.status, 400, "{body}");
            assert_eq!(error_of(&result), (-32600, "Invalid Request".to_string()));
        }
        let with_id = send(&f, json!({ "id": 7 }), ApiTokenScope::Full).await;
        assert_eq!(with_id.body["id"], 7);
    }

    #[tokio::test]
    async fn defaults_the_error_id_to_null() {
        let f = fixture();
        let result = send(&f, json!({ "jsonrpc": "2.0" }), ApiTokenScope::Full).await;
        assert_eq!(result.body["id"], Value::Null);
    }

    #[tokio::test]
    async fn initialize_returns_protocol_version_server_info_and_instructions() {
        let f = fixture();
        let result = send(&f, rpc("initialize", json!({})), ApiTokenScope::Read).await;
        assert_eq!(result.status, 200);
        let r = &result.body["result"];
        assert_eq!(r["protocolVersion"], "2024-11-05");
        assert_eq!(r["capabilities"], json!({ "tools": {} }));
        assert_eq!(r["serverInfo"], json!({ "name": "trakwyn-mcp", "version": "1.0.0" }));
        assert!(r["instructions"].as_str().unwrap().contains("not instructions"));
        assert_eq!(result.body["jsonrpc"], "2.0");
        assert_eq!(result.body["id"], 1);
    }

    #[tokio::test]
    async fn an_unknown_method_is_method_not_found_with_a_200() {
        let f = fixture();
        let result = send(&f, rpc("resources/list", json!({})), ApiTokenScope::Full).await;
        assert_eq!(result.status, 200);
        assert_eq!(error_of(&result), (-32601, "Method not found: resources/list".to_string()));
    }

    #[tokio::test]
    async fn a_request_without_an_id_answers_without_one() {
        let f = fixture();
        let body = json!({ "jsonrpc": "2.0", "method": "initialize" });
        let result = send(&f, body, ApiTokenScope::Full).await;
        assert!(result.body.get("id").is_none());
    }
}

mod tools_list {
    use super::*;

    fn names(result: &McpResult) -> Vec<String> {
        result.body["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect()
    }

    #[tokio::test]
    async fn a_full_token_sees_every_tool_without_the_access_tag() {
        let f = fixture();
        let result = send(&f, rpc("tools/list", json!({})), ApiTokenScope::Full).await;
        assert_eq!(names(&result).len(), mcp_tools().len());
        for tool in result.body["result"]["tools"].as_array().unwrap() {
            let keys: Vec<&String> = tool.as_object().unwrap().keys().collect();
            assert_eq!(keys, ["description", "inputSchema", "name"]);
        }
    }

    #[tokio::test]
    async fn a_read_token_is_not_shown_write_tools() {
        let f = fixture();
        let result = send(&f, rpc("tools/list", json!({})), ApiTokenScope::Read).await;
        let listed = names(&result);
        assert!(!listed.is_empty());
        for tool in mcp_tools() {
            assert_eq!(listed.contains(&tool.name.to_string()), tool.access == ToolAccess::Read);
        }
    }

    #[tokio::test]
    async fn list_applications_advertises_limit_and_cursor() {
        let tool = mcp_tools().iter().find(|t| t.name == "list_applications").unwrap();
        let props = &tool.input_schema["properties"];
        assert_eq!(props["limit"]["description"], "Applications per page (1-100, default 20)");
        assert!(props["cursor"].is_object());
    }
}

mod parity {
    use super::*;

    #[tokio::test]
    async fn every_catalogue_tool_is_advertised_and_handled() {
        let f = fixture();
        let listed = send(&f, rpc("tools/list", json!({})), ApiTokenScope::Full).await;
        let advertised: Vec<String> = listed.body["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect();

        for tool in mcp_tools() {
            assert!(advertised.contains(&tool.name.to_string()), "{} is not advertised", tool.name);
            // Empty arguments reach the handler, which answers with an
            // argument error or a result — never "Unknown tool".
            let result = send(&f, call(tool.name, json!({})), ApiTokenScope::Full).await;
            let unhandled = result.body["error"]["message"]
                .as_str()
                .is_some_and(|m| m.starts_with("Unknown tool"));
            assert!(!unhandled, "{} is advertised but not handled", tool.name);
        }
    }

    #[tokio::test]
    async fn every_call_goes_through_the_observer_by_name_surface_and_scope() {
        let f = fixture();
        for tool in mcp_tools() {
            send(&f, call(tool.name, json!({})), ApiTokenScope::Full).await;
        }
        let calls = f.observer.calls();
        assert_eq!(calls.len(), mcp_tools().len());
        for ((meta, _), tool) in calls.iter().zip(mcp_tools()) {
            assert_eq!(meta.name, tool.name);
            assert_eq!(meta.surface, ToolSurface::Mcp);
            assert_eq!(meta.token_scope, Some(ApiTokenScope::Full));
        }
    }

    #[tokio::test]
    async fn only_tools_call_is_observed() {
        let f = fixture();
        send(&f, rpc("initialize", json!({})), ApiTokenScope::Full).await;
        send(&f, rpc("tools/list", json!({})), ApiTokenScope::Full).await;
        assert!(f.observer.calls().is_empty());
    }

    #[tokio::test]
    async fn the_observer_never_sees_arguments() {
        let f = fixture();
        send(&f, call("get_application", json!({ "applicationId": "secret-id" })), ApiTokenScope::Full).await;
        assert!(!format!("{:?}", f.observer.calls()).contains("secret-id"));
    }
}

mod scope_enforcement {
    use super::*;

    fn write_tool_arguments(name: &str) -> Value {
        match name {
            "create_application" => json!({ "company": "Evil", "role": "Hacker" }),
            "update_application" => json!({ "applicationId": "app-1", "company": "Evil" }),
            "create_note" => json!({ "applicationId": "app-1", "content": "x" }),
            "create_interview_round" => json!({ "applicationId": "app-1" }),
            "create_skill" => json!({ "name": "Rust" }),
            "update_skill" => json!({ "skillId": "s1", "name": "Rust" }),
            "create_education" => json!({ "institution": "U", "startDate": "2020-01-01" }),
            "update_education" => json!({ "educationId": "e1" }),
            "create_work_experience" => json!({ "company": "A", "title": "B", "startDate": "2020-01-01" }),
            _ => json!({ "workExperienceId": "w1" }),
        }
    }

    #[tokio::test]
    async fn a_read_token_is_refused_every_write_tool_before_any_use_case_runs() {
        let f = fixture();
        let writes: Vec<&ToolDefinition> =
            mcp_tools().iter().filter(|t| t.access == ToolAccess::Write).collect();
        assert!(!writes.is_empty());
        for tool in &writes {
            let result = send(&f, call(tool.name, write_tool_arguments(tool.name)), ApiTokenScope::Read).await;
            assert_eq!(
                error_of(&result),
                (
                    -32602,
                    format!(
                        "Tool \"{}\" requires a full-access API token; this token is read-only",
                        tool.name
                    )
                )
            );
        }
        // Nothing was written.
        assert_eq!(f.written_applications.all().len(), 1);
        assert!(f.written_notes.all().is_empty());
        assert!(f.written_skills.all().is_empty());

        let outcomes: Vec<ToolCallOutcome> =
            f.observer.calls().iter().map(|(_, s)| s.outcome).collect();
        assert_eq!(outcomes, vec![ToolCallOutcome::Refused; writes.len()]);
        assert_eq!(f.observer.calls()[0].1.refused_user_id.as_deref(), Some(USER));
        assert_eq!(f.observer.calls()[0].0.token_scope, Some(ApiTokenScope::Read));
    }

    #[tokio::test]
    async fn a_full_token_may_call_a_write_tool() {
        let f = fixture();
        let result = send(&f, call("create_note", json!({ "applicationId": "app-1", "content": "hello" })), ApiTokenScope::Full).await;
        let note = payload(&result);
        assert_eq!(note["content"], "hello");
        assert_eq!(f.written_notes.all().len(), 1);
    }

    #[tokio::test]
    async fn read_tools_still_work_for_a_read_token() {
        let f = fixture();
        let result = send(&f, call("list_skills", json!({})), ApiTokenScope::Read).await;
        assert_eq!(payload(&result), json!([]));
    }

    #[tokio::test]
    async fn an_unknown_name_is_not_a_refusal_for_a_read_token() {
        let f = fixture();
        let result = send(&f, call("delete_everything", json!({})), ApiTokenScope::Read).await;
        assert_eq!(error_of(&result), (-32601, "Unknown tool: delete_everything".to_string()));
        assert_eq!(f.observer.calls()[0].1.outcome, ToolCallOutcome::InvalidParams);
    }
}

mod tools_call {
    use super::*;

    #[tokio::test]
    async fn list_applications_returns_compact_text_with_preview_rows() {
        let f = fixture();
        let result = send(&f, call("list_applications", json!({})), ApiTokenScope::Read).await;
        let content = &result.body["result"]["content"];
        assert_eq!(content.as_array().unwrap().len(), 1);
        assert_eq!(content[0]["type"], "text");
        let text = content[0]["text"].as_str().unwrap();
        assert!(!text.contains('\n') && !text.contains("  "), "compact, not pretty-printed");
        let page = payload(&result);
        assert_eq!(page["hasNextPage"], false);
        assert_eq!(page["nextCursor"], Value::Null);
        // Nulls are kept for a program reading the result.
        assert_eq!(page["items"][0]["location"], Value::Null);
        assert!(page["items"][0].get("userId").is_none());
    }

    #[tokio::test]
    async fn accepts_a_numeric_string_limit_and_ignores_nonsense() {
        let f = fixture();
        for limit in [json!("1"), json!(1), json!(-3), json!("abc"), json!(2.5)] {
            let result = send(&f, call("list_applications", json!({ "limit": limit })), ApiTokenScope::Read).await;
            assert_eq!(payload(&result)["items"].as_array().unwrap().len(), 1);
        }
    }

    #[tokio::test]
    async fn an_unknown_status_filters_everything_out() {
        let f = fixture();
        let result = send(&f, call("list_applications", json!({ "status": "nonsense" })), ApiTokenScope::Read).await;
        assert_eq!(payload(&result)["items"], json!([]));
    }

    #[tokio::test]
    async fn get_application_requires_an_id() {
        let f = fixture();
        let result = send(&f, call("get_application", json!({})), ApiTokenScope::Read).await;
        assert_eq!(error_of(&result), (-32602, "applicationId is required".to_string()));
        assert_eq!(f.observer.calls()[0].1.outcome, ToolCallOutcome::InvalidParams);
    }

    #[tokio::test]
    async fn get_application_returns_the_whole_record() {
        let f = fixture();
        let result = send(&f, call("get_application", json!({ "applicationId": "app-1" })), ApiTokenScope::Read).await;
        let app = payload(&result);
        assert_eq!(app["id"], "app-1");
        assert_eq!(app["userId"], USER);
        assert_eq!(app["createdAt"], "1970-01-01T00:00:00.000Z");
    }

    #[tokio::test]
    async fn not_found_is_invalid_params_and_forbidden_too() {
        let f = fixture();
        let result = send(&f, call("get_application", json!({ "applicationId": "nope" })), ApiTokenScope::Read).await;
        assert_eq!(error_of(&result), (-32602, "Application not found".to_string()));
        assert_eq!(f.observer.calls()[0].1.outcome, ToolCallOutcome::DomainError);
    }

    #[tokio::test]
    async fn a_missing_params_object_is_an_unknown_tool() {
        let f = fixture();
        let result = send(&f, json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call" }), ApiTokenScope::Full).await;
        assert_eq!(error_of(&result), (-32601, "Unknown tool: undefined".to_string()));
    }

    #[tokio::test]
    async fn get_analytics_combines_the_four_aggregates_under_named_keys() {
        let f = fixture();
        let result = send(&f, call("get_analytics", json!({})), ApiTokenScope::Read).await;
        let analytics = payload(&result);
        let keys: Vec<&String> = analytics.as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), 4);
        for key in ["responseTime", "channels", "interviewRounds", "offers"] {
            assert!(analytics.get(key).is_some(), "{key}");
        }
    }

    #[tokio::test]
    async fn write_tools_validate_their_arguments() {
        let f = fixture();
        let cases = [
            ("create_application", json!({ "company": "A" }), "company and role are required"),
            ("update_application", json!({}), "applicationId is required"),
            ("create_note", json!({ "applicationId": "app-1" }), "applicationId and content are required"),
            ("create_interview_round", json!({}), "applicationId is required"),
            ("create_skill", json!({}), "name is required"),
            ("update_skill", json!({}), "skillId is required"),
            ("create_education", json!({ "institution": "U", "startDate": "junk" }), "institution and a valid ISO 8601 startDate are required"),
            ("update_education", json!({}), "educationId is required"),
            ("create_work_experience", json!({ "company": "A", "title": "B" }), "company, title and a valid ISO 8601 startDate are required"),
            ("update_work_experience", json!({}), "workExperienceId is required"),
        ];
        for (name, arguments, message) in cases {
            let result = send(&f, call(name, arguments), ApiTokenScope::Full).await;
            assert_eq!(error_of(&result), (-32602, message.to_string()), "{name}");
        }
    }

    #[tokio::test]
    async fn create_application_stores_and_returns_the_record() {
        let f = fixture();
        let result = send(
            &f,
            call("create_application", json!({ "company": "Globex", "role": "Staff", "status": "applied" })),
            ApiTokenScope::Full,
        )
        .await;
        let created = payload(&result);
        assert_eq!((created["company"].as_str(), created["status"].as_str()), (Some("Globex"), Some("applied")));
        assert_eq!(created["userId"], USER);
        assert_eq!(f.written_applications.all().len(), 2);
    }

    #[tokio::test]
    async fn create_interview_round_drops_an_unparseable_scheduled_at() {
        let f = fixture();
        let ok = send(
            &f,
            call("create_interview_round", json!({ "applicationId": "app-1", "scheduledAt": "2030-05-01T10:00:00Z" })),
            ApiTokenScope::Full,
        )
        .await;
        assert_eq!(payload(&ok)["scheduledAt"], "2030-05-01T10:00:00.000Z");
        let junk = send(
            &f,
            call("create_interview_round", json!({ "applicationId": "app-1", "scheduledAt": "someday" })),
            ApiTokenScope::Full,
        )
        .await;
        assert_eq!(payload(&junk)["scheduledAt"], Value::Null);
    }

    #[tokio::test]
    async fn an_interview_type_outside_the_enum_is_refused() {
        let f = fixture();
        let result = send(
            &f,
            call("create_interview_round", json!({ "applicationId": "app-1", "type": "phone_screen" })),
            ApiTokenScope::Full,
        )
        .await;
        let (code, message) = error_of(&result);
        assert_eq!(code, -32602);
        assert!(message.contains("phone_screen"));
    }

    #[tokio::test]
    async fn update_skill_maps_skill_id_onto_the_use_case() {
        let f = fixture();
        let created = send(&f, call("create_skill", json!({ "name": "Rust" })), ApiTokenScope::Full).await;
        let id = payload(&created)["id"].as_str().unwrap().to_string();
        let updated = send(&f, call("update_skill", json!({ "skillId": id, "proficiency": "expert" })), ApiTokenScope::Full).await;
        let skill = payload(&updated);
        assert_eq!((skill["name"].as_str(), skill["proficiency"].as_str()), (Some("Rust"), Some("expert")));
        let missing = send(&f, call("update_skill", json!({ "skillId": "nope" })), ApiTokenScope::Full).await;
        assert_eq!(error_of(&missing), (-32602, "Skill not found".to_string()));
    }

    #[tokio::test]
    async fn arguments_that_are_not_an_object_read_as_none() {
        let f = fixture();
        let result = send(&f, rpc("tools/call", json!({ "name": "get_application", "arguments": "x" })), ApiTokenScope::Read).await;
        assert_eq!(error_of(&result), (-32602, "applicationId is required".to_string()));
    }
}

mod catalogue {
    use super::*;
    use std::collections::HashSet;
    use std::fs;
    use std::path::Path;

    fn rust_files(dir: &Path) -> Vec<std::path::PathBuf> {
        fs::read_dir(dir)
            .unwrap()
            .flat_map(|entry| {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    rust_files(&path)
                } else if path.extension().is_some_and(|e| e == "rs") {
                    vec![path]
                } else {
                    vec![]
                }
            })
            .collect()
    }

    #[test]
    fn is_never_imported_by_a_use_case() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/use_cases");
        let offenders: Vec<_> = rust_files(&dir)
            .into_iter()
            .filter(|file| {
                let text = fs::read_to_string(file).unwrap();
                text.lines().any(|line| {
                    let line = line.trim_start();
                    line.starts_with("use crate::http") || line.contains("crate::http::mcp")
                })
            })
            .collect();
        assert!(offenders.is_empty(), "{offenders:?}");
    }

    #[test]
    fn gives_each_surface_its_own_selection() {
        assert_eq!(mcp_tools().len(), tool_catalogue().len());
        let chat = chat_tools();
        assert!(chat.iter().all(|t| t.access == ToolAccess::Read));
        assert!(chat.len() < mcp_tools().len());
        assert_eq!(chat.len(), 13);
    }

    #[test]
    fn drops_the_access_tag_and_marks_only_the_last_tool_as_a_cache_breakpoint() {
        let defs = to_llm_tool_definitions(&chat_tools());
        assert_eq!(defs.len(), chat_tools().len());
        assert_eq!(defs.iter().filter(|d| d.cache_breakpoint).count(), 1);
        assert!(defs.last().unwrap().cache_breakpoint);
        let advertised = advertise(&chat_tools());
        assert!(advertised.iter().all(|t| t.get("access").is_none()));
    }

    #[test]
    fn does_not_restate_the_scope_requirement_in_descriptions() {
        let offenders: Vec<&str> = tool_catalogue()
            .iter()
            .filter(|t| t.description.to_lowercase().contains("full-access token")
                || t.description.to_lowercase().contains("full access token"))
            .map(|t| t.name)
            .collect();
        assert!(offenders.is_empty(), "{offenders:?}");
    }

    #[test]
    fn has_a_unique_name_per_tool_and_an_object_schema() {
        let names: HashSet<&str> = tool_catalogue().iter().map(|t| t.name).collect();
        assert_eq!(names.len(), tool_catalogue().len());
        for tool in tool_catalogue() {
            assert_eq!(tool.input_schema["type"], "object", "{}", tool.name);
        }
    }

    #[test]
    fn lists_the_same_tools_as_the_original() {
        let names: Vec<&str> = tool_catalogue().iter().map(|t| t.name).collect();
        assert_eq!(
            names,
            [
                "list_applications", "get_application", "list_notes", "list_contacts",
                "list_interview_rounds", "list_work_experiences", "list_educations", "list_skills",
                "list_documents", "list_offers", "list_activity", "list_calendar_events",
                "get_analytics", "create_application", "update_application", "create_note",
                "create_interview_round", "create_skill", "update_skill", "create_education",
                "update_education", "create_work_experience", "update_work_experience",
            ]
        );
    }
}
