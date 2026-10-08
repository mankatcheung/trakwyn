//! `chatHistory` (`chatQueries.ts`, `MessageType.ts`). The conversation
//! operations are in `conversations.rs`; the streaming reply is
//! `routes/chat_stream.rs`.

use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::message::Message;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::chat::GetChatHistoryInput;

#[derive(SimpleObject)]
#[graphql(name = "Message")]
pub struct MessageObject {
    id: Option<String>,
    role: Option<String>,
    content: Option<String>,
    created_at: Option<String>,
}

impl From<Message> for MessageObject {
    fn from(message: Message) -> Self {
        Self {
            id: Some(message.id),
            role: Some(message.role.as_str().to_string()),
            content: Some(message.content),
            created_at: Some(iso(message.created_at)),
        }
    }
}

#[derive(Default)]
pub struct ChatQuery;

#[Object]
impl ChatQuery {
    async fn chat_history(
        &self,
        ctx: &Context<'_>,
        conversation_id: ID,
    ) -> Result<Option<Vec<MessageObject>>> {
        let user = require_user(ctx)?;
        let messages = container(ctx)
            .get_chat_history_use_case()
            .execute(GetChatHistoryInput {
                user_id: user.sub.clone(),
                conversation_id: conversation_id.0,
            })
            .await
            .gql()?;
        Ok(Some(messages.into_iter().map(MessageObject::from).collect()))
    }
}
