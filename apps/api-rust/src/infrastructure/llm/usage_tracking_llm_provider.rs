use std::sync::Arc;

use async_trait::async_trait;
use futures::StreamExt;

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmCompleteResult, LlmMessage, LlmStream, LlmStreamChunk,
    LlmToolDefinition, LlmUsage,
};
use crate::use_cases::ports::llm_usage_event_repository::{
    LlmUsageEventRepository, RecordLlmUsageEventData,
};
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::shared::token_estimate::estimate_prompt_tokens;

const RECORD_FAILED_MESSAGE: &str = "[llm-usage] failed to record usage event — continuing";

/// The column is a 32-bit integer; a count that cannot fit is stored as the
/// largest one that can.
fn column(tokens: i64) -> i32 {
    i32::try_from(tokens.max(0)).unwrap_or(i32::MAX)
}

/// Writes one `LlmUsageEvent` for one user, provider and model.
struct UsageRecorder {
    usage_event_repository: Arc<dyn LlmUsageEventRepository>,
    generate_id: GenerateId,
    logger: Arc<dyn Logger>,
    user_id: String,
    provider: String,
    model: Option<String>,
}

impl UsageRecorder {
    /// Fails open: a broken usage log must never break the AI feature the
    /// user is actually here for.
    async fn record(&self, usage: Option<LlmUsage>, estimated: bool) {
        let Some(usage) = usage else { return };
        let recorded = self
            .usage_event_repository
            .record(RecordLlmUsageEventData {
                id: (self.generate_id)(),
                user_id: self.user_id.clone(),
                provider: self.provider.clone(),
                model: self.model.clone(),
                prompt_tokens: column(usage.prompt_tokens),
                completion_tokens: column(usage.completion_tokens),
                cache_read_tokens: usage.cache_read_tokens.map(column),
                cache_write_tokens: usage.cache_write_tokens.map(column),
                estimated,
            })
            .await;
        if let Err(err) = recorded {
            self.logger.error(RECORD_FAILED_MESSAGE, Some(&err), &[]);
        }
    }
}

/// What a stream that ended without `Done` still owes the ledger.
struct StreamCharge {
    recorder: Arc<UsageRecorder>,
    /// The prompt count the provider reported up front, if it did.
    prompt_tokens: Option<i64>,
    /// What the prompt is estimated at, for when the provider never said.
    estimated_prompt_tokens: i64,
    /// Only a stream that produced something was billed for its prompt; a
    /// request refused outright (401, policy) never reached the model.
    started: bool,
    settled: bool,
}

impl StreamCharge {
    fn prompt_only(prompt_tokens: i64) -> Option<LlmUsage> {
        Some(LlmUsage {
            prompt_tokens,
            completion_tokens: 0,
            cache_read_tokens: None,
            cache_write_tokens: None,
        })
    }

    /// The charge still outstanding and whether it is an estimate. Taking it
    /// settles the stream.
    fn take(&mut self) -> Option<(Option<LlmUsage>, bool)> {
        if std::mem::replace(&mut self.settled, true) {
            return None;
        }
        match self.prompt_tokens {
            Some(prompt_tokens) => Some((Self::prompt_only(prompt_tokens), false)),
            None if self.started => Some((Self::prompt_only(self.estimated_prompt_tokens), true)),
            None => None,
        }
    }

    async fn settle(&mut self) {
        if let Some((usage, estimated)) = self.take() {
            self.recorder.record(usage, estimated).await;
        }
    }
}

impl Drop for StreamCharge {
    /// A stream dropped mid-reply (the client disconnected) cannot await its
    /// own bookkeeping, so the charge is written on the runtime instead.
    fn drop(&mut self) {
        let Some((usage, estimated)) = self.take() else { return };
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            let recorder = self.recorder.clone();
            runtime.spawn(async move { recorder.record(usage, estimated).await });
        }
    }
}

/// Decorates an `LLMProvider` so every completed call also writes an
/// `LlmUsageEvent` (JEF-250). Wired in by `UserLLMProviderFactory` (the
/// single choke point every real AI feature resolves its provider through),
/// never by `from_credentials`.
///
/// A response with no usage simply records nothing rather than a fabricated
/// zero.
///
/// A stream that ends without `Done` (the client disconnected, the idle
/// timeout fired) is still charged for its prompt: exactly, when the
/// provider reported it up front (`PromptUsage`, Anthropic), or as an
/// estimate from the request flagged `estimated` when it did not (F3, the
/// OpenAI-compatible and Gemini paths). Without that, aborting a reply after
/// the first byte was a way past the monthly limit: the provider had billed
/// the whole prompt and the ledger saw nothing (S8). Zero output tokens in
/// both cases: what was streamed before the abort is not known here.
pub struct UsageTrackingLLMProvider {
    inner: Arc<dyn LLMProvider>,
    recorder: Arc<UsageRecorder>,
}

pub struct UsageTrackingDeps {
    pub inner: Arc<dyn LLMProvider>,
    pub usage_event_repository: Arc<dyn LlmUsageEventRepository>,
    pub generate_id: GenerateId,
    pub logger: Arc<dyn Logger>,
    pub user_id: String,
    pub provider: String,
    pub model: Option<String>,
}

impl UsageTrackingLLMProvider {
    pub fn new(deps: UsageTrackingDeps) -> Self {
        Self {
            inner: deps.inner,
            recorder: Arc::new(UsageRecorder {
                usage_event_repository: deps.usage_event_repository,
                generate_id: deps.generate_id,
                logger: deps.logger,
                user_id: deps.user_id,
                provider: deps.provider,
                model: deps.model,
            }),
        }
    }
}

#[async_trait]
impl LLMProvider for UsageTrackingLLMProvider {
    async fn complete(
        &self,
        messages: &[LlmMessage],
        max_tokens: Option<u32>,
        options: LlmCompleteOptions,
    ) -> DomainResult<LlmCompleteResult> {
        let result = self.inner.complete(messages, max_tokens, options).await?;
        self.recorder.record(result.usage, false).await;
        Ok(result)
    }

    fn complete_with_tools_stream(
        &self,
        messages: &[LlmMessage],
        tools: &[LlmToolDefinition],
        max_tokens: Option<u32>,
    ) -> LlmStream {
        let mut inner = self.inner.complete_with_tools_stream(messages, tools, max_tokens);
        let recorder = self.recorder.clone();
        let mut charge = StreamCharge {
            recorder: recorder.clone(),
            prompt_tokens: None,
            estimated_prompt_tokens: estimate_prompt_tokens(messages, tools),
            started: false,
            settled: false,
        };
        Box::pin(async_stream::stream! {
            while let Some(item) = inner.next().await {
                match &item {
                    Ok(chunk) => {
                        charge.started = true;
                        match chunk {
                            LlmStreamChunk::PromptUsage { prompt_tokens } => {
                                charge.prompt_tokens = Some(*prompt_tokens);
                            }
                            LlmStreamChunk::Done(result) => {
                                charge.settled = true;
                                recorder.record(result.usage, false).await;
                            }
                            LlmStreamChunk::TextDelta { .. } => {}
                        }
                    }
                    // A failure ends the stream: the ledger is written before
                    // the caller hears about it.
                    Err(_) => charge.settle().await,
                }
                yield item;
            }
            charge.settle().await;
        })
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::use_cases::errors::{DomainError, ErrorCode};
    use crate::use_cases::ports::llm_provider::LlmCompletionResult;
    use crate::use_cases::test_support::{
        sequential_ids, FakeLLMProvider, FakeLlmUsageEventRepository, FakeLogger, LogLevel,
    };

    const USAGE: LlmUsage = LlmUsage {
        prompt_tokens: 120,
        completion_tokens: 30,
        cache_read_tokens: Some(100),
        cache_write_tokens: None,
    };

    struct Fixture {
        events: Arc<FakeLlmUsageEventRepository>,
        logger: Arc<FakeLogger>,
        provider: UsageTrackingLLMProvider,
    }

    fn tracking_with(
        inner: FakeLLMProvider,
        usage_event_repository: Arc<dyn LlmUsageEventRepository>,
        events: Arc<FakeLlmUsageEventRepository>,
    ) -> Fixture {
        let logger = Arc::new(FakeLogger::default());
        let provider = UsageTrackingLLMProvider::new(UsageTrackingDeps {
            inner: Arc::new(inner),
            usage_event_repository,
            generate_id: sequential_ids("usage"),
            logger: logger.clone(),
            user_id: "user-1".to_string(),
            provider: "anthropic".to_string(),
            model: Some("claude-haiku-4-5".to_string()),
        });
        Fixture { events, logger, provider }
    }

    fn tracking(inner: FakeLLMProvider) -> Fixture {
        let events = Arc::new(FakeLlmUsageEventRepository::default());
        tracking_with(inner, events.clone(), events)
    }

    struct FailingUsageRepository;

    #[async_trait]
    impl LlmUsageEventRepository for FailingUsageRepository {
        async fn record(&self, _data: RecordLlmUsageEventData) -> DomainResult<()> {
            Err(DomainError::internal("the usage table is gone"))
        }

        async fn summarize_by_user_id(
            &self,
            _user_id: &str,
            _since: chrono::DateTime<chrono::Utc>,
        ) -> DomainResult<Vec<crate::domain::llm_usage_event::LlmUsageSummary>> {
            Ok(Vec::new())
        }
    }

    fn done(usage: Option<LlmUsage>) -> DomainResult<LlmStreamChunk> {
        Ok(LlmStreamChunk::Done(LlmCompletionResult {
            content: Some("Hello".to_string()),
            tool_calls: Vec::new(),
            usage,
        }))
    }

    fn delta(text: &str) -> DomainResult<LlmStreamChunk> {
        Ok(LlmStreamChunk::TextDelta { text: text.to_string() })
    }

    /// Lets a charge spawned from `Drop` reach the repository.
    async fn settle_spawned(events: &FakeLlmUsageEventRepository, expected: usize) {
        for _ in 0..200 {
            if events.all().len() >= expected {
                return;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }

    #[tokio::test]
    async fn records_a_usage_event_when_the_inner_provider_reports_usage() {
        let fixture = tracking(FakeLLMProvider::new().reply_with(LlmCompleteResult {
            content: "hi".to_string(),
            usage: Some(USAGE),
            truncated: false,
        }));

        let result = fixture
            .provider
            .complete(&[LlmMessage::user("hello")], Some(64), LlmCompleteOptions { json: true })
            .await
            .unwrap();

        assert_eq!(result.content, "hi");
        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].id, "usage-1");
        assert_eq!(events[0].user_id, "user-1");
        assert_eq!(events[0].provider, "anthropic");
        assert_eq!(events[0].model.as_deref(), Some("claude-haiku-4-5"));
        assert_eq!(events[0].prompt_tokens, 120);
        assert_eq!(events[0].completion_tokens, 30);
        assert_eq!(events[0].cache_read_tokens, Some(100));
        assert_eq!(events[0].cache_write_tokens, None);
        assert!(!events[0].estimated);
    }

    #[tokio::test]
    async fn records_nothing_when_the_inner_provider_reports_no_usage() {
        let fixture = tracking(FakeLLMProvider::new().reply("hi"));

        fixture
            .provider
            .complete(&[LlmMessage::user("hello")], None, LlmCompleteOptions::default())
            .await
            .unwrap();

        assert!(fixture.events.all().is_empty());
    }

    #[tokio::test]
    async fn records_nothing_when_the_call_fails() {
        let fixture = tracking(FakeLLMProvider::new().fail(DomainError::ai_provider_error("down")));

        let err = fixture
            .provider
            .complete(&[LlmMessage::user("hello")], None, LlmCompleteOptions::default())
            .await
            .unwrap_err();

        assert_eq!(err.code(), ErrorCode::AiProviderError);
        assert!(fixture.events.all().is_empty());
    }

    #[tokio::test]
    async fn fails_open_a_usage_recording_error_never_surfaces_to_the_caller() {
        let inner = FakeLLMProvider::new().reply_with(LlmCompleteResult {
            content: "hi".to_string(),
            usage: Some(USAGE),
            truncated: false,
        });
        let fixture = tracking_with(inner, Arc::new(FailingUsageRepository), Arc::default());

        let result = fixture
            .provider
            .complete(&[LlmMessage::user("hello")], None, LlmCompleteOptions::default())
            .await;

        assert_eq!(result.unwrap().content, "hi");
        let lines = fixture.logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].level, LogLevel::Error);
        assert_eq!(lines[0].message, "[llm-usage] failed to record usage event — continuing");
    }

    #[tokio::test]
    async fn records_a_usage_event_from_the_done_chunk_and_still_yields_every_chunk() {
        let fixture = tracking(FakeLLMProvider::new().stream(vec![
            delta("Hel"),
            delta("lo"),
            done(Some(USAGE)),
        ]));

        let chunks: Vec<_> = fixture
            .provider
            .complete_with_tools_stream(&[LlmMessage::user("hello")], &[], None)
            .collect()
            .await;

        assert_eq!(chunks.len(), 3);
        assert!(matches!(chunks[2], Ok(LlmStreamChunk::Done(_))));
        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!((events[0].prompt_tokens, events[0].completion_tokens), (120, 30));
        assert!(!events[0].estimated);
    }

    #[tokio::test]
    async fn charges_the_prompt_when_the_stream_is_dropped_mid_reply() {
        let fixture = tracking(FakeLLMProvider::new().stream(vec![
            Ok(LlmStreamChunk::PromptUsage { prompt_tokens: 900 }),
            delta("Hel"),
            delta("lo"),
            done(Some(USAGE)),
        ]));

        let mut stream =
            fixture.provider.complete_with_tools_stream(&[LlmMessage::user("hello")], &[], None);
        stream.next().await;
        stream.next().await;
        drop(stream);
        settle_spawned(&fixture.events, 1).await;

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!((events[0].prompt_tokens, events[0].completion_tokens), (900, 0));
        assert!(!events[0].estimated);
    }

    #[tokio::test]
    async fn does_not_double_count_when_done_follows_prompt_usage() {
        let fixture = tracking(FakeLLMProvider::new().stream(vec![
            Ok(LlmStreamChunk::PromptUsage { prompt_tokens: 120 }),
            delta("Hello"),
            done(Some(USAGE)),
        ]));

        let stream =
            fixture.provider.complete_with_tools_stream(&[LlmMessage::user("hello")], &[], None);
        let chunks: Vec<_> = stream.collect().await;
        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(chunks.len(), 3);
        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!((events[0].prompt_tokens, events[0].completion_tokens), (120, 30));
    }

    #[tokio::test]
    async fn records_an_estimated_prompt_charge_for_an_aborted_stream_whose_provider_never_reported_usage(
    ) {
        let fixture = tracking(FakeLLMProvider::new().stream(vec![
            delta("Hel"),
            delta("lo"),
            done(Some(USAGE)),
        ]));
        let messages = [LlmMessage::user("x".repeat(400))];

        let mut stream = fixture.provider.complete_with_tools_stream(&messages, &[], None);
        stream.next().await;
        drop(stream);
        settle_spawned(&fixture.events, 1).await;

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!((events[0].prompt_tokens, events[0].completion_tokens), (100, 0));
        assert!(events[0].estimated);
    }

    #[tokio::test]
    async fn a_stream_that_fails_after_producing_something_is_charged_before_the_error_arrives() {
        let fixture = tracking(
            FakeLLMProvider::new()
                .stream(vec![delta("Hel"), Err(DomainError::ai_provider_error("idle timeout"))]),
        );
        let messages = [LlmMessage::user("x".repeat(40))];

        let mut stream = fixture.provider.complete_with_tools_stream(&messages, &[], None);
        assert!(stream.next().await.unwrap().is_ok());
        assert!(stream.next().await.unwrap().is_err());

        let events = fixture.events.all();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].prompt_tokens, 10);
        assert!(events[0].estimated);
        assert!(stream.next().await.is_none());
        assert_eq!(fixture.events.all().len(), 1);
    }

    #[tokio::test]
    async fn records_nothing_when_the_stream_failed_before_producing_anything() {
        let fixture =
            tracking(FakeLLMProvider::new().stream_failing(DomainError::ai_provider_error("401")));

        let chunks: Vec<_> = fixture
            .provider
            .complete_with_tools_stream(&[LlmMessage::user("hello")], &[], None)
            .collect()
            .await;
        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].is_err());
        assert!(fixture.events.all().is_empty());
    }

    #[tokio::test]
    async fn a_done_without_usage_records_nothing_rather_than_an_estimate() {
        let fixture = tracking(FakeLLMProvider::new().stream(vec![delta("Hello"), done(None)]));

        let chunks: Vec<_> = fixture
            .provider
            .complete_with_tools_stream(&[LlmMessage::user("hello")], &[], None)
            .collect()
            .await;
        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(chunks.len(), 2);
        assert!(fixture.events.all().is_empty());
    }
}
