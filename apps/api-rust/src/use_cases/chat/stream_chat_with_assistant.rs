use std::pin::Pin;
use std::sync::Arc;

use async_stream::try_stream;
use futures::{Stream, StreamExt};

use super::chat_assembly::{
    build_chat_messages, derive_chat_title, format_tool_result_for_model, summarize_tool_result,
    trim_history_to_budget,
};
use super::chat_tools::{execute_chat_tool, ChatToolDeps};
use crate::domain::message::MessageRole;
use crate::use_cases::constants::chat;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::llm_provider::{
    LlmMessage, LlmRole, LlmStreamChunk, LlmToolDefinition,
};
use crate::use_cases::ports::{
    ConversationRepository, CreateMessageData, LLMProviderFactory, MessageRepository, RateLimiter,
    UserRepository,
};
use crate::use_cases::shared::js_string::{js_trim, utf16_len};

pub struct ChatWithAssistantInput {
    pub user_id: String,
    pub conversation_id: String,
    pub message: String,
}

pub struct StreamChatWithAssistantUseCase {
    pub tools: ChatToolDeps,
    /// The tools this surface offers the model, injected rather than
    /// imported: the catalogue is an adapter-layer contract, and which subset
    /// chat gets is a composition decision. Chat is session-authenticated
    /// with no token scope, so it receives read tools only (JEF-177).
    pub chat_tools: Vec<LlmToolDefinition>,
    pub llm_provider_factory: Arc<dyn LLMProviderFactory>,
    pub chat_rate_limiter: Arc<dyn RateLimiter>,
    pub message_repository: Arc<dyn MessageRepository>,
    pub conversation_repository: Arc<dyn ConversationRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub generate_id: crate::use_cases::ids::GenerateId,
}

/// `Delta` carries incremental assistant text as it arrives, including
/// narration ahead of a tool call. `Done` terminates a successful stream.
/// Only text from the final round (the one with no further tool calls) is
/// persisted as the assistant message; mid-conversation narration is
/// real-time UI only.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChatStreamEvent {
    Delta {
        text: String,
    },
    /// The key this turn would have used was paused at its monthly limit, and
    /// the user's opt-in fallback picked another one (JEF-258). Emitted
    /// before any text, so the client can say which key answered.
    Fallback {
        from: String,
        to: String,
    },
    Done,
}

/// A stream ends at its first `Err`, as the original generator ends at its
/// first throw. Dropping it aborts the upstream LLM request.
pub type ChatEventStream = Pin<Box<dyn Stream<Item = DomainResult<ChatStreamEvent>> + Send>>;

const EXHAUSTED_REPLY: &str =
    "That took more steps than I could complete — try asking something more specific.";
const EMPTY_REPLY: &str = "I don't have a response for that.";

/// `n.toLocaleString()` (en-US) for a whole number.
fn with_thousands(n: usize) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

impl StreamChatWithAssistantUseCase {
    /// Streams the assistant's reply token by token (JEF-239): rate limiting,
    /// conversation/user lookup, message assembly, the tool-calling loop and
    /// persistence.
    pub fn execute(self, input: ChatWithAssistantInput) -> ChatEventStream {
        Box::pin(try_stream! {
            // Before the rate limiter: a request that was never going to run
            // should not spend one of the user's attempts.
            if js_trim(&input.message).is_empty() {
                Err(DomainError::validation("Message is required"))?;
            }
            if utf16_len(&input.message) > chat::MAX_MESSAGE_CHARS {
                Err(DomainError::validation(format!(
                    "Message is too long — keep it under {} characters",
                    with_thousands(chat::MAX_MESSAGE_CHARS)
                )))?;
            }

            if !self.chat_rate_limiter.consume(&format!("chat:user:{}", input.user_id)).await {
                Err(DomainError::rate_limited(
                    "Too many messages — please wait a moment and try again",
                ))?;
            }

            let conversation = self
                .conversation_repository
                .find_by_id(&input.conversation_id)
                .await?
                .ok_or_else(|| DomainError::not_found("Conversation not found"))?;
            if conversation.user_id != input.user_id {
                Err(DomainError::forbidden("Forbidden"))?;
            }

            let user = self.user_repository.find_by_id(&input.user_id).await?;
            let history =
                self.message_repository.find_all_by_conversation_id(&input.conversation_id).await?;
            // Only the most recent CHAT.MAX_HISTORY_MESSAGES go to the model
            // (JEF-237). `history` stays the full list: the title below needs
            // to know whether this is truly the conversation's first message.
            let capped = &history[history.len().saturating_sub(chat::MAX_HISTORY_MESSAGES)..];
            let history_for_prompt = trim_history_to_budget(capped, chat::MAX_HISTORY_CHARS);
            let mut messages = build_chat_messages(history_for_prompt, &input.message, user.as_ref());

            let provider_name = conversation
                .llm_provider
                .clone()
                .or_else(|| user.as_ref().and_then(|u| u.default_llm_provider.clone()));
            let resolution = self
                .llm_provider_factory
                .resolve_for_user(
                    &input.user_id,
                    provider_name.as_deref(),
                    conversation.llm_model.as_deref(),
                    true,
                    Default::default(),
                )
                .await?;
            if let Some(fell_back_from) = resolution.as_ref().and_then(|r| r.fell_back_from.clone()) {
                let to = resolution.as_ref().map(|r| r.provider_id.clone()).unwrap_or_default();
                yield ChatStreamEvent::Fallback { from: fell_back_from, to };
            }
            let Some(resolution) = resolution else {
                Err(DomainError::ai_not_configured(
                    "Add your AI API key in Settings to use this feature",
                ))?;
                return;
            };
            if conversation.llm_provider.as_deref().is_none_or(str::is_empty) {
                if let Some(name) = provider_name.as_deref().filter(|name| !name.is_empty()) {
                    self.conversation_repository
                        .update_llm_settings(&conversation.id, name, conversation.llm_model.as_deref())
                        .await?;
                }
            }

            let mut final_reply = EXHAUSTED_REPLY.to_string();
            let mut tool_trace: Vec<String> = Vec::new();

            for _ in 0..chat::MAX_TOOL_ITERATIONS {
                let mut content = String::new();
                let mut tool_calls = Vec::new();

                let mut upstream =
                    resolution.provider.complete_with_tools_stream(&messages, &self.chat_tools, None);
                while let Some(chunk) = upstream.next().await {
                    match chunk? {
                        LlmStreamChunk::TextDelta { text } => {
                            yield ChatStreamEvent::Delta { text };
                        }
                        LlmStreamChunk::Done(result) => {
                            content = result.content.unwrap_or_default();
                            tool_calls = result.tool_calls;
                        }
                        // The usage tracker's business, not the chat's.
                        LlmStreamChunk::PromptUsage { .. } => {}
                    }
                }

                if tool_calls.is_empty() {
                    let trimmed = js_trim(&content);
                    final_reply =
                        if trimmed.is_empty() { EMPTY_REPLY.to_string() } else { trimmed.to_string() };
                    break;
                }

                messages.push(LlmMessage::assistant_tool_calls(content, tool_calls.clone()));
                let results = futures::future::join_all(
                    tool_calls.iter().map(|call| execute_chat_tool(call, &input.user_id, &self.tools)),
                )
                .await;
                for (call, result) in tool_calls.iter().zip(&results) {
                    tool_trace.push(summarize_tool_result(call, result));
                    messages.push(LlmMessage::tool(
                        call.id.clone(),
                        format_tool_result_for_model(&call.name, result),
                    ));
                }
                // Breakpoint 3 moves each iteration: everything up to and
                // including this round's tool results is a cache hit on the
                // next call of the loop (T2).
                for message in messages.iter_mut().filter(|m| m.role == LlmRole::Tool) {
                    message.cache_breakpoint = false;
                }
                if let Some(last) = messages.last_mut() {
                    last.cache_breakpoint = true;
                }
            }

            self.message_repository
                .create(CreateMessageData {
                    id: (self.generate_id)(),
                    conversation_id: input.conversation_id.clone(),
                    role: MessageRole::User,
                    content: input.message.clone(),
                    tool_trace: None,
                })
                .await?;
            self.message_repository
                .create(CreateMessageData {
                    id: (self.generate_id)(),
                    conversation_id: input.conversation_id.clone(),
                    role: MessageRole::Assistant,
                    content: final_reply,
                    tool_trace: (!tool_trace.is_empty()).then(|| tool_trace.join("; ")),
                })
                .await?;

            if history.is_empty() {
                self.conversation_repository
                    .update_title(&input.conversation_id, &derive_chat_title(&input.message))
                    .await?;
            }

            yield ChatStreamEvent::Done;
        })
    }
}
