use std::collections::{HashMap, HashSet, VecDeque};
use std::pin::Pin;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

use async_trait::async_trait;
use futures::Stream;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};
use crate::use_cases::ports::{
    JobPostingSource, JobPostingSourceResolver, LLMProvider, LlmCompleteOptions, LlmCompleteResult,
    LlmCompletionResult, LlmMessage, LlmStream, LlmStreamChunk, LlmToolCall, LlmToolDefinition,
    LlmUsage,
};

/// One call a [`FakeLLMProvider`] received.
#[derive(Debug, Clone, PartialEq)]
pub enum FakeLlmCall {
    Complete { messages: Vec<LlmMessage>, max_tokens: Option<u32>, options: LlmCompleteOptions },
    Stream { messages: Vec<LlmMessage>, tools: Vec<LlmToolDefinition>, max_tokens: Option<u32> },
}

impl FakeLlmCall {
    pub fn messages(&self) -> &[LlmMessage] {
        match self {
            Self::Complete { messages, .. } | Self::Stream { messages, .. } => messages,
        }
    }
}

type ScriptedStream = Vec<DomainResult<LlmStreamChunk>>;

/// A scriptable model. Replies are queued per method and served in call
/// order; every call is recorded. A call with nothing queued fails with an
/// internal error naming the fake, so a test that under-scripts sees why.
#[derive(Default)]
pub struct FakeLLMProvider {
    completions: Mutex<VecDeque<DomainResult<LlmCompleteResult>>>,
    streams: Mutex<VecDeque<ScriptedStream>>,
    calls: Mutex<Vec<FakeLlmCall>>,
    abandoned_streams: Arc<AtomicUsize>,
}

impl FakeLLMProvider {
    pub fn new() -> Self {
        Self::default()
    }

    /// Queues a `complete` reply with this text, no usage, not truncated.
    pub fn reply(self, content: &str) -> Self {
        self.reply_with(LlmCompleteResult {
            content: content.to_string(),
            usage: None,
            truncated: false,
        })
    }

    pub fn reply_with(self, result: LlmCompleteResult) -> Self {
        self.completions.lock().unwrap().push_back(Ok(result));
        self
    }

    /// Queues a `complete` call that fails.
    pub fn fail(self, error: DomainError) -> Self {
        self.completions.lock().unwrap().push_back(Err(error));
        self
    }

    /// Queues one stream, item for item as scripted (an `Err` ends it).
    pub fn stream(self, chunks: Vec<DomainResult<LlmStreamChunk>>) -> Self {
        self.streams.lock().unwrap().push_back(chunks);
        self
    }

    /// Queues a stream of text deltas ending in a `Done` with the joined text.
    pub fn stream_text(self, deltas: &[&str], usage: Option<LlmUsage>) -> Self {
        let mut chunks: ScriptedStream = deltas
            .iter()
            .map(|delta| Ok(LlmStreamChunk::TextDelta { text: delta.to_string() }))
            .collect();
        let content = deltas.concat();
        chunks.push(Ok(LlmStreamChunk::Done(LlmCompletionResult {
            content: (!content.is_empty()).then_some(content),
            tool_calls: Vec::new(),
            usage,
        })));
        self.stream(chunks)
    }

    /// Queues a stream whose only item is a `Done` requesting these tool calls.
    pub fn stream_tool_calls(self, tool_calls: Vec<LlmToolCall>, usage: Option<LlmUsage>) -> Self {
        self.stream(vec![Ok(LlmStreamChunk::Done(LlmCompletionResult {
            content: None,
            tool_calls,
            usage,
        }))])
    }

    /// Queues a stream that fails before yielding anything.
    pub fn stream_failing(self, error: DomainError) -> Self {
        self.stream(vec![Err(error)])
    }

    pub fn calls(&self) -> Vec<FakeLlmCall> {
        self.calls.lock().unwrap().clone()
    }

    /// Streams that were dropped before their last scripted item was read:
    /// what a client disconnect looks like from the provider's side.
    pub fn abandoned_streams(&self) -> usize {
        self.abandoned_streams.load(Ordering::SeqCst)
    }
}

fn nothing_scripted(method: &str) -> DomainError {
    DomainError::internal(format!("FakeLLMProvider: no {method} reply scripted"))
}

#[async_trait]
impl LLMProvider for FakeLLMProvider {
    async fn complete(
        &self,
        messages: &[LlmMessage],
        max_tokens: Option<u32>,
        options: LlmCompleteOptions,
    ) -> DomainResult<LlmCompleteResult> {
        self.calls.lock().unwrap().push(FakeLlmCall::Complete {
            messages: messages.to_vec(),
            max_tokens,
            options,
        });
        let reply = self.completions.lock().unwrap().pop_front();
        reply.unwrap_or_else(|| Err(nothing_scripted("complete")))
    }

    fn complete_with_tools_stream(
        &self,
        messages: &[LlmMessage],
        tools: &[LlmToolDefinition],
        max_tokens: Option<u32>,
    ) -> LlmStream {
        self.calls.lock().unwrap().push(FakeLlmCall::Stream {
            messages: messages.to_vec(),
            tools: tools.to_vec(),
            max_tokens,
        });
        let chunks = self
            .streams
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| vec![Err(nothing_scripted("stream"))]);
        Box::pin(FakeStream { chunks: chunks.into(), abandoned: self.abandoned_streams.clone() })
    }
}

struct FakeStream {
    chunks: VecDeque<DomainResult<LlmStreamChunk>>,
    abandoned: Arc<AtomicUsize>,
}

impl Stream for FakeStream {
    type Item = DomainResult<LlmStreamChunk>;

    fn poll_next(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let next = self.chunks.pop_front();
        if matches!(next, Some(Err(_))) {
            // An error ends a real stream; nothing scripted after it is delivered.
            self.chunks.clear();
        }
        Poll::Ready(next)
    }
}

impl Drop for FakeStream {
    fn drop(&mut self) {
        if !self.chunks.is_empty() {
            self.abandoned.fetch_add(1, Ordering::SeqCst);
        }
    }
}

/// Resolves pasted text the way the real resolver does (trimmed, and
/// preferred over a link) and serves links from the pages it was given.
#[derive(Default)]
pub struct FakeJobPostingSourceResolver {
    pages: HashMap<String, String>,
    failures: Mutex<HashMap<String, DomainError>>,
    resolved: Mutex<Vec<JobPostingSource>>,
}

impl FakeJobPostingSourceResolver {
    pub fn new() -> Self {
        Self::default()
    }

    /// The text a link resolves to.
    pub fn with_page(mut self, url: &str, text: &str) -> Self {
        self.pages.insert(url.to_string(), text.to_string());
        self
    }

    /// A link whose fetch fails, once, with this error.
    pub fn with_failure(self, url: &str, error: DomainError) -> Self {
        self.failures.lock().unwrap().insert(url.to_string(), error);
        self
    }

    pub fn resolved(&self) -> Vec<JobPostingSource> {
        self.resolved.lock().unwrap().clone()
    }
}

#[async_trait]
impl JobPostingSourceResolver for FakeJobPostingSourceResolver {
    async fn resolve(&self, source: JobPostingSource) -> DomainResult<String> {
        self.resolved.lock().unwrap().push(source.clone());

        let text = source.text.as_deref().map(str::trim).unwrap_or_default();
        if !text.is_empty() {
            return Ok(text.to_string());
        }

        let url = source.url.as_deref().map(str::trim).unwrap_or_default();
        if url.is_empty() {
            return Err(DomainError::internal("Either text or url must be provided"));
        }
        if let Some(error) = self.failures.lock().unwrap().remove(url) {
            return Err(error);
        }
        self.pages
            .get(url)
            .cloned()
            .ok_or_else(|| DomainError::service_unavailable("Could not fetch the job posting"))
    }
}

/// An outbound URL policy that allows everything except the URLs it was told
/// to refuse, and records every check in order.
#[derive(Default)]
pub struct RecordingOutboundUrlPolicy {
    refused: HashSet<String>,
    refuse_all: bool,
    checks: Mutex<Vec<(String, OutboundUrlPurpose)>>,
}

impl RecordingOutboundUrlPolicy {
    pub fn allow_all() -> Self {
        Self::default()
    }

    pub fn refuse_all() -> Self {
        Self { refuse_all: true, ..Self::default() }
    }

    pub fn refusing(mut self, url: &str) -> Self {
        self.refused.insert(url.to_string());
        self
    }

    pub fn checks(&self) -> Vec<(String, OutboundUrlPurpose)> {
        self.checks.lock().unwrap().clone()
    }
}

#[async_trait]
impl OutboundUrlPolicy for RecordingOutboundUrlPolicy {
    async fn assert_allowed(&self, url: &str, purpose: OutboundUrlPurpose) -> DomainResult<()> {
        self.checks.lock().unwrap().push((url.to_string(), purpose));
        if self.refuse_all || self.refused.contains(url) {
            return Err(DomainError::validation("URL host is not allowed"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use futures::StreamExt;

    use super::*;
    use crate::use_cases::errors::ErrorCode;

    #[tokio::test]
    async fn serves_scripted_completions_in_order_and_records_the_calls() {
        let fake = FakeLLMProvider::new().reply("one").fail(DomainError::ai_provider_error("down"));
        let messages = [LlmMessage::user("hi")];

        let first = fake.complete(&messages, Some(64), LlmCompleteOptions { json: true }).await;
        let second = fake.complete(&messages, None, LlmCompleteOptions::default()).await;
        let third = fake.complete(&messages, None, LlmCompleteOptions::default()).await;

        assert_eq!(first.unwrap().content, "one");
        assert_eq!(second.unwrap_err().code(), ErrorCode::AiProviderError);
        assert_eq!(third.unwrap_err().code(), ErrorCode::InternalError);
        assert_eq!(
            fake.calls()[0],
            FakeLlmCall::Complete {
                messages: messages.to_vec(),
                max_tokens: Some(64),
                options: LlmCompleteOptions { json: true },
            }
        );
        assert_eq!(fake.calls().len(), 3);
    }

    #[tokio::test]
    async fn streams_scripted_chunks_and_counts_a_stream_dropped_early() {
        let fake = FakeLLMProvider::new()
            .stream_text(&["Hel", "lo"], None)
            .stream_text(&["never", "read"], None);
        let messages = [LlmMessage::user("hi")];

        let chunks: Vec<_> = fake.complete_with_tools_stream(&messages, &[], None).collect().await;
        assert_eq!(chunks.len(), 3);
        assert!(matches!(
            chunks.last(),
            Some(Ok(LlmStreamChunk::Done(done))) if done.content.as_deref() == Some("Hello")
        ));
        assert_eq!(fake.abandoned_streams(), 0);

        let mut second = fake.complete_with_tools_stream(&messages, &[], None);
        second.next().await;
        drop(second);
        assert_eq!(fake.abandoned_streams(), 1);
    }

    #[tokio::test]
    async fn the_fake_resolver_prefers_text_and_serves_known_pages() {
        let resolver = FakeJobPostingSourceResolver::new()
            .with_page("https://example.com/job", "Staff Engineer")
            .with_failure("https://example.com/down", DomainError::validation("nope"));
        let link = |url: &str| JobPostingSource { text: None, url: Some(url.to_string()) };

        let pasted = JobPostingSource { text: Some("  pasted  ".to_string()), url: None };
        assert_eq!(resolver.resolve(pasted).await.unwrap(), "pasted");
        assert_eq!(
            resolver.resolve(link("https://example.com/job")).await.unwrap(),
            "Staff Engineer"
        );
        let down = resolver.resolve(link("https://example.com/down")).await.unwrap_err();
        assert_eq!(down.code(), ErrorCode::Validation);
        let empty = resolver.resolve(JobPostingSource::default()).await.unwrap_err();
        assert_eq!(empty.code(), ErrorCode::InternalError);
        assert_eq!(resolver.resolved().len(), 4);
    }
}
