//! The in-app chat assistant (JEF-239): the streaming use case, prompt
//! assembly, and the shaping of tool results before the model sees them.

pub mod chat_assembly;
pub mod chat_tool_projection;
pub mod chat_tools;
pub mod get_chat_history;
pub mod stream_chat_with_assistant;
pub mod tool_entities;
pub mod tool_json;

pub use chat_tools::ChatToolDeps;
pub use get_chat_history::{GetChatHistoryInput, GetChatHistoryUseCase};
pub use stream_chat_with_assistant::{
    ChatEventStream, ChatStreamEvent, ChatWithAssistantInput, StreamChatWithAssistantUseCase,
};

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_stream;
