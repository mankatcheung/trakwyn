//! `StreamChatWithAssistantUseCase` and the chat tool dispatch. Mirrors
//! `StreamChatWithAssistantUseCase.test.ts` and the `executeChatTool`
//! observation tests of `chatAssembly.test.ts`.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde_json::{json, Value};

use super::chat_assembly::CHAT_SYSTEM_PROMPT;
use super::chat_tools::execute_chat_tool;
use super::*;
use crate::domain::application::Application;
use crate::domain::conversation::Conversation;
use crate::domain::message::MessageRole;
use crate::use_cases::constants::chat;
use crate::use_cases::errors::{DomainError, DomainResult, ErrorCode};
use crate::use_cases::ports::llm_provider::{LlmRole, LlmToolCall, LlmToolDefinition};
use crate::use_cases::ports::tool_call_observer::{ToolCallOutcome, ToolSurface};
use crate::use_cases::test_support::{
    application_owned_by, fake_chat_tool_deps, sequential_ids, user_with_email,
    FakeConversationRepository, FakeLLMProvider, FakeLLMProviderFactory, FakeMessageRepository,
    FakeRateLimiter, FakeUserRepository, RecordingToolCallObserver,
};

const USER: &str = "u1";
const CONVERSATION: &str = "c1";

struct Harness {
    provider: Arc<FakeLLMProvider>,
    messages: Arc<FakeMessageRepository>,
    conversations: Arc<FakeConversationRepository>,
    limiter: Arc<FakeRateLimiter>,
    use_case: Option<StreamChatWithAssistantUseCase>,
}

fn conversation(user_id: &str, provider: Option<&str>) -> Conversation {
    Conversation {
        id: CONVERSATION.into(),
        user_id: user_id.into(),
        title: None,
        llm_provider: provider.map(str::to_string),
        llm_model: None,
        created_at: DateTime::<Utc>::UNIX_EPOCH,
        updated_at: DateTime::<Utc>::UNIX_EPOCH,
    }
}

struct Options {
    provider: FakeLLMProvider,
    applications: Vec<Application>,
    conversation: Option<Conversation>,
    stored: Vec<crate::domain::message::Message>,
    limiter: FakeRateLimiter,
    factory: Option<FakeLLMProviderFactory>,
}

impl Options {
    fn new(provider: FakeLLMProvider) -> Self {
        Self {
            provider,
            applications: vec![],
            conversation: Some(conversation(USER, None)),
            stored: vec![],
            limiter: FakeRateLimiter::default(),
            factory: None,
        }
    }
}

fn harness(options: Options) -> Harness {
    let provider = Arc::new(options.provider);
    let messages = Arc::new(FakeMessageRepository::with(options.stored));
    let conversations = Arc::new(
        FakeConversationRepository::with(options.conversation.into_iter().collect())
            .with_messages(&messages),
    );
    let limiter = Arc::new(options.limiter);
    let observer = Arc::new(RecordingToolCallObserver::default());
    let factory: Arc<dyn crate::use_cases::ports::LLMProviderFactory> = Arc::new(
        options.factory.unwrap_or_else(|| FakeLLMProviderFactory::with_provider(provider.clone())),
    );
    let use_case = StreamChatWithAssistantUseCase {
        tools: fake_chat_tool_deps(options.applications, observer),
        chat_tools: vec![LlmToolDefinition::new("list_applications", "d", json!({}))],
        llm_provider_factory: factory,
        chat_rate_limiter: limiter.clone(),
        message_repository: messages.clone(),
        conversation_repository: conversations.clone(),
        user_repository: Arc::new(FakeUserRepository::with(vec![user_with_email(
            USER, "a@b.test",
        )])),
        generate_id: sequential_ids("id"),
    };
    Harness { provider, messages, conversations, limiter, use_case: Some(use_case) }
}

impl Harness {
    fn stream(&mut self, message: &str) -> ChatEventStream {
        self.stream_as(USER, message)
    }

    fn stream_as(&mut self, user_id: &str, message: &str) -> ChatEventStream {
        self.use_case.take().expect("one run per harness").execute(ChatWithAssistantInput {
            user_id: user_id.into(),
            conversation_id: CONVERSATION.into(),
            message: message.into(),
        })
    }

    async fn run(&mut self, message: &str) -> Vec<DomainResult<ChatStreamEvent>> {
        self.stream(message).collect().await
    }
}

fn error_code(items: &[DomainResult<ChatStreamEvent>]) -> ErrorCode {
    items.iter().find_map(|i| i.as_ref().err()).expect("an error item").code()
}

fn events(items: Vec<DomainResult<ChatStreamEvent>>) -> Vec<ChatStreamEvent> {
    items.into_iter().map(|item| item.expect("no error")).collect()
}

fn tool_call(id: &str, name: &str, arguments: Value) -> LlmToolCall {
    LlmToolCall { id: id.into(), name: name.into(), arguments }
}

fn application(id: &str) -> Application {
    Application {
        description: Some("A scraped posting".into()),
        applied_at: Some(DateTime::<Utc>::from_timestamp(1_767_312_000, 0).unwrap()),
        ..application_owned_by(id, USER)
    }
}

#[tokio::test]
async fn a_rate_limited_user_is_refused() {
    let mut h = harness(Options {
        limiter: FakeRateLimiter::rejecting(),
        ..Options::new(FakeLLMProvider::new())
    });
    let items = h.run("hi").await;
    assert_eq!(error_code(&items), ErrorCode::RateLimited);
    assert_eq!(h.limiter.consumed(), ["chat:user:u1"]);
}

#[tokio::test]
async fn an_empty_or_overlong_message_is_refused_before_spending_an_attempt() {
    for message in ["", "   \n", &"x".repeat(chat::MAX_MESSAGE_CHARS + 1)] {
        let mut h = harness(Options::new(FakeLLMProvider::new()));
        let items = h.run(message).await;
        assert_eq!(error_code(&items), ErrorCode::Validation);
        assert!(h.limiter.consumed().is_empty());
    }
    let mut h = harness(Options::new(FakeLLMProvider::new()));
    let items = h.run(&"x".repeat(chat::MAX_MESSAGE_CHARS + 1)).await;
    assert_eq!(
        items[0].as_ref().unwrap_err().to_string(),
        "Message is too long — keep it under 8,000 characters"
    );
}

#[tokio::test]
async fn accepts_a_message_exactly_at_the_cap() {
    let provider = FakeLLMProvider::new().stream_text(&["ok"], None);
    let mut h = harness(Options::new(provider));
    let items = h.run(&"x".repeat(chat::MAX_MESSAGE_CHARS)).await;
    assert!(items.iter().all(Result::is_ok));
}

#[tokio::test]
async fn a_missing_conversation_is_not_found_and_another_users_is_forbidden() {
    let mut h = harness(Options { conversation: None, ..Options::new(FakeLLMProvider::new()) });
    assert_eq!(error_code(&h.run("hi").await), ErrorCode::NotFound);

    let mut h = harness(Options {
        conversation: Some(conversation("someone-else", None)),
        ..Options::new(FakeLLMProvider::new())
    });
    assert_eq!(error_code(&h.run("hi").await), ErrorCode::Forbidden);
}

#[tokio::test]
async fn no_provider_is_ai_not_configured() {
    let mut h = harness(Options {
        factory: Some(FakeLLMProviderFactory::default()),
        ..Options::new(FakeLLMProvider::new())
    });
    let items = h.run("hi").await;
    assert_eq!(error_code(&items), ErrorCode::AiNotConfigured);
    assert_eq!(
        items[0].as_ref().unwrap_err().to_string(),
        "Add your AI API key in Settings to use this feature"
    );
}

#[tokio::test]
async fn streams_a_delta_per_chunk_then_done() {
    let mut h = harness(Options::new(FakeLLMProvider::new().stream_text(&["Hel", "lo"], None)));
    let got = events(h.run("hi").await);
    assert_eq!(
        got,
        [
            ChatStreamEvent::Delta { text: "Hel".into() },
            ChatStreamEvent::Delta { text: "lo".into() },
            ChatStreamEvent::Done
        ]
    );
}

#[tokio::test]
async fn ignores_prompt_usage_chunks() {
    use crate::use_cases::ports::llm_provider::{LlmCompletionResult, LlmStreamChunk};
    let provider = FakeLLMProvider::new().stream(vec![
        Ok(LlmStreamChunk::PromptUsage { prompt_tokens: 9 }),
        Ok(LlmStreamChunk::TextDelta { text: "a".into() }),
        Ok(LlmStreamChunk::Done(LlmCompletionResult {
            content: Some("a".into()),
            tool_calls: vec![],
            usage: None,
        })),
    ]);
    let mut h = harness(Options::new(provider));
    assert_eq!(
        events(h.run("hi").await),
        [ChatStreamEvent::Delta { text: "a".into() }, ChatStreamEvent::Done]
    );
}

#[tokio::test]
async fn announces_a_fallback_before_any_text() {
    let provider = Arc::new(FakeLLMProvider::new().stream_text(&["x"], None));
    let factory = FakeLLMProviderFactory::with_provider(provider).falling_back_from("openai");
    let mut h = harness(Options {
        factory: Some(factory),
        conversation: Some(conversation(USER, Some("anthropic"))),
        ..Options::new(FakeLLMProvider::new())
    });
    let got = events(h.run("hi").await);
    assert_eq!(got[0], ChatStreamEvent::Fallback { from: "openai".into(), to: "anthropic".into() });
}

#[tokio::test]
async fn persists_the_user_message_and_the_final_reply() {
    let mut h =
        harness(Options::new(FakeLLMProvider::new().stream_text(&["The ", "answer  "], None)));
    h.run("What?").await;
    let stored = h.messages.all();
    assert_eq!(stored.len(), 2);
    assert_eq!((stored[0].role, stored[0].content.as_str()), (MessageRole::User, "What?"));
    assert_eq!(
        (stored[1].role, stored[1].content.as_str()),
        (MessageRole::Assistant, "The answer")
    );
    assert_eq!(stored[1].tool_trace, None);
}

#[tokio::test]
async fn an_empty_reply_is_replaced_by_a_placeholder() {
    let provider = FakeLLMProvider::new().stream_text(&["  "], None);
    let mut h = harness(Options::new(provider));
    h.run("hi").await;
    assert_eq!(h.messages.all()[1].content, "I don't have a response for that.");
}

#[tokio::test]
async fn derives_a_title_from_the_first_message_only() {
    let mut h = harness(Options::new(FakeLLMProvider::new().stream_text(&["x"], None)));
    h.run("  Tell me about my search  ").await;
    assert_eq!(h.conversations.all()[0].title.as_deref(), Some("Tell me about my search"));

    let stored = vec![crate::domain::message::Message {
        id: "old".into(),
        conversation_id: CONVERSATION.into(),
        role: MessageRole::User,
        content: "earlier".into(),
        tool_trace: None,
        created_at: DateTime::<Utc>::UNIX_EPOCH,
    }];
    let mut h = harness(Options {
        stored,
        ..Options::new(FakeLLMProvider::new().stream_text(&["x"], None))
    });
    h.run("second").await;
    assert_eq!(h.conversations.all()[0].title, None);
}

#[tokio::test]
async fn runs_a_tool_round_trip_and_persists_only_the_final_text() {
    let provider = FakeLLMProvider::new()
        .stream_tool_calls(
            vec![tool_call("t1", "list_applications", json!({"status": "applied"}))],
            None,
        )
        .stream_text(&["You have one."], None);
    let mut h =
        harness(Options { applications: vec![application("app-1")], ..Options::new(provider) });
    let got = events(h.run("which?").await);
    assert_eq!(
        got,
        [ChatStreamEvent::Delta { text: "You have one.".into() }, ChatStreamEvent::Done]
    );

    let stored = h.messages.all();
    assert_eq!(stored[1].content, "You have one.");
    assert_eq!(
        stored[1].tool_trace.as_deref(),
        Some(r#"list_applications({"status":"applied"}) → 1 result: app-1 Acme/Engineer"#)
    );

    let calls = h.provider.calls();
    assert_eq!(calls.len(), 2);
    let second = calls[1].messages();
    let assistant = &second[second.len() - 2];
    assert_eq!(assistant.role, LlmRole::Assistant);
    assert_eq!(assistant.tool_calls.len(), 1);
    let tool = second.last().unwrap();
    assert_eq!(tool.role, LlmRole::Tool);
    assert_eq!(tool.tool_call_id.as_deref(), Some("t1"));
}

#[tokio::test]
async fn fences_and_compacts_every_tool_result_before_the_model_sees_it() {
    let provider = FakeLLMProvider::new()
        .stream_tool_calls(vec![tool_call("t1", "list_applications", json!({}))], None)
        .stream_text(&["ok"], None);
    let mut h =
        harness(Options { applications: vec![application("app-1")], ..Options::new(provider) });
    h.run("go").await;
    let calls = h.provider.calls();
    let content = &calls[1].messages().last().unwrap().content;
    assert!(content.starts_with("<tool_result name=\"list_applications\">\n"), "{content}");
    assert!(content.ends_with("\n</tool_result>"));
    assert!(!content.contains("null"), "nulls are dropped: {content}");
    assert!(content.contains(r#""appliedAt":"2026-01-02""#), "{content}");
    assert!(!content.contains("boardPosition"));
}

#[tokio::test]
async fn hands_the_model_a_domain_message_but_never_an_internal_error() {
    let provider = FakeLLMProvider::new()
        .stream_tool_calls(
            vec![tool_call("t1", "get_application", json!({"applicationId": "nope"}))],
            None,
        )
        .stream_text(&["sorry"], None);
    let mut h = harness(Options::new(provider));
    h.run("go").await;
    let content = h.provider.calls()[1].messages().last().unwrap().content.clone();
    assert!(content.contains(r#"{"error":"Application not found"}"#), "{content}");
}

#[tokio::test]
async fn moves_a_cache_breakpoint_onto_each_rounds_last_tool_result() {
    let provider = FakeLLMProvider::new()
        .stream_tool_calls(vec![tool_call("a", "list_skills", json!({}))], None)
        .stream_tool_calls(vec![tool_call("b", "list_educations", json!({}))], None)
        .stream_text(&["done"], None);
    let mut h = harness(Options::new(provider));
    h.run("go").await;
    let calls = h.provider.calls();
    let tools: Vec<(String, bool)> = calls[2]
        .messages()
        .iter()
        .filter(|m| m.role == LlmRole::Tool)
        .map(|m| (m.tool_call_id.clone().unwrap(), m.cache_breakpoint))
        .collect();
    assert_eq!(tools, [("a".to_string(), false), ("b".to_string(), true)]);
}

#[tokio::test]
async fn list_applications_defaults_to_the_chat_page_size_and_honours_a_limit() {
    let apps: Vec<Application> = (0..15).map(|i| application(&format!("app-{i:02}"))).collect();
    let provider = FakeLLMProvider::new()
        .stream_tool_calls(vec![tool_call("a", "list_applications", json!({}))], None)
        .stream_tool_calls(vec![tool_call("b", "list_applications", json!({"limit": "3"}))], None)
        .stream_text(&["done"], None);
    let mut h = harness(Options { applications: apps, ..Options::new(provider) });
    h.run("go").await;
    let messages = h.provider.calls()[2].messages().to_vec();
    let results: Vec<&str> =
        messages.iter().filter(|m| m.role == LlmRole::Tool).map(|m| m.content.as_str()).collect();
    assert_eq!(results[0].matches(r#""id":"app-"#).count(), chat::LIST_DEFAULT_LIMIT as usize);
    assert!(results[0].contains(r#""hasNextPage":true"#));
    assert_eq!(results[1].matches(r#""id":"app-"#).count(), 3);
}

#[tokio::test]
async fn bounds_the_history_by_count_and_by_characters() {
    let mut stored = Vec::new();
    for i in 0..(chat::MAX_HISTORY_MESSAGES + 6) {
        stored.push(crate::domain::message::Message {
            id: format!("m{i}"),
            conversation_id: CONVERSATION.into(),
            role: if i % 2 == 0 { MessageRole::User } else { MessageRole::Assistant },
            content: format!("message {i}"),
            tool_trace: None,
            created_at: DateTime::<Utc>::from_timestamp(i as i64, 0).unwrap(),
        });
    }
    let mut h = harness(Options {
        stored,
        ..Options::new(FakeLLMProvider::new().stream_text(&["x"], None))
    });
    h.run("new").await;
    let sent = h.provider.calls()[0].messages().to_vec();
    // two system blocks' worth is one here (no custom prompt), plus the new message
    assert_eq!(sent.len(), 1 + chat::MAX_HISTORY_MESSAGES + 1);
    assert_eq!(sent[0].content, CHAT_SYSTEM_PROMPT);
    assert_eq!(sent[1].content, "message 6");
}

#[tokio::test]
async fn gives_up_with_a_clear_message_after_the_iteration_cap() {
    let mut provider = FakeLLMProvider::new();
    for i in 0..chat::MAX_TOOL_ITERATIONS {
        provider = provider
            .stream_tool_calls(vec![tool_call(&format!("t{i}"), "list_skills", json!({}))], None);
    }
    let mut h = harness(Options::new(provider));
    let got = events(h.run("go").await);
    assert_eq!(got, [ChatStreamEvent::Done]);
    assert_eq!(
        h.messages.all()[1].content,
        "That took more steps than I could complete — try asking something more specific."
    );
    assert_eq!(h.provider.calls().len(), chat::MAX_TOOL_ITERATIONS);
}

#[tokio::test]
async fn a_provider_failure_ends_the_stream_with_its_error() {
    let provider = FakeLLMProvider::new().stream_failing(DomainError::ai_provider_error("down"));
    let mut h = harness(Options::new(provider));
    let items = h.run("hi").await;
    assert_eq!(error_code(&items), ErrorCode::AiProviderError);
    assert!(h.messages.all().is_empty(), "nothing is persisted for a failed turn");
}

#[tokio::test]
async fn dropping_the_stream_abandons_the_upstream_request() {
    let provider = FakeLLMProvider::new().stream_text(&["a", "b", "c"], None);
    let mut h = harness(Options::new(provider));
    let mut stream = h.stream("hi");
    assert!(stream.next().await.is_some());
    drop(stream);
    assert_eq!(h.provider.abandoned_streams(), 1);
}

mod chat_tools {
    use super::*;

    async fn run_tool(
        name: &str,
        arguments: Value,
        apps: Vec<Application>,
    ) -> (Value, Arc<RecordingToolCallObserver>) {
        let observer = Arc::new(RecordingToolCallObserver::default());
        let deps = fake_chat_tool_deps(apps, observer.clone());
        let out = execute_chat_tool(&tool_call("c", name, arguments), USER, &deps).await;
        (serde_json::from_str(&out.stringify()).unwrap(), observer)
    }

    #[tokio::test]
    async fn every_chat_tool_goes_through_the_observer_on_the_chat_surface() {
        let observer = Arc::new(RecordingToolCallObserver::default());
        let deps = fake_chat_tool_deps(vec![application("app-1")], observer.clone());
        let names = [
            "list_applications",
            "get_application",
            "list_notes",
            "list_contacts",
            "list_interview_rounds",
            "list_work_experiences",
            "list_educations",
            "list_skills",
            "list_documents",
            "list_offers",
            "list_activity",
            "list_calendar_events",
            "get_analytics",
        ];
        for name in names {
            execute_chat_tool(
                &tool_call("c", name, json!({"applicationId": "app-1"})),
                USER,
                &deps,
            )
            .await;
        }
        let calls = observer.calls();
        assert_eq!(calls.len(), names.len());
        for ((meta, settlement), name) in calls.iter().zip(names) {
            assert_eq!((meta.surface, meta.name.as_str()), (ToolSurface::Chat, name));
            assert_eq!(meta.token_scope, None);
            assert_eq!(settlement.outcome, ToolCallOutcome::Ok, "{name}");
        }
    }

    #[tokio::test]
    async fn a_domain_error_is_reported_and_the_model_gets_its_message() {
        let (out, observer) =
            run_tool("get_application", json!({"applicationId": "nope"}), vec![]).await;
        assert_eq!(out, json!({"error": "Application not found"}));
        assert_eq!(observer.calls()[0].1.outcome, ToolCallOutcome::DomainError);
    }

    #[tokio::test]
    async fn an_unknown_tool_is_invalid_params_and_still_answers_the_model() {
        let (out, observer) = run_tool("drop_tables", json!({}), vec![]).await;
        assert_eq!(out, json!({"error": "Unknown tool: drop_tables"}));
        assert_eq!(observer.calls()[0].1.outcome, ToolCallOutcome::InvalidParams);
    }

    #[tokio::test]
    async fn a_write_tool_is_not_available_to_chat() {
        let (out, _) = run_tool(
            "create_note",
            json!({"applicationId": "app-1", "content": "x"}),
            vec![application("app-1")],
        )
        .await;
        assert_eq!(out, json!({"error": "Unknown tool: create_note"}));
    }

    #[tokio::test]
    async fn another_users_application_is_refused() {
        let mut foreign = application("app-1");
        foreign.user_id = "someone-else".into();
        let (out, _) =
            run_tool("get_application", json!({"applicationId": "app-1"}), vec![foreign]).await;
        assert_eq!(out["error"], "Forbidden");
    }

    #[tokio::test]
    async fn the_observer_never_sees_arguments() {
        let (_, observer) =
            run_tool("get_application", json!({"applicationId": "secret-id"}), vec![]).await;
        let seen = format!("{:?}", observer.calls());
        assert!(!seen.contains("secret-id"));
    }
}
