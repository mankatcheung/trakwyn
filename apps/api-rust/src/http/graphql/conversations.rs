//! The conversation operations of `apps/api`'s `chatQueries.ts` and
//! `chatMutations.ts`. `chatHistory` and the streaming chat route need an
//! LLM and are ported with it.

use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::support::{container, iso, require_user};
use crate::domain::conversation::Conversation;
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::conversations::{CreateConversationInput, DeleteConversationInput};

#[derive(SimpleObject)]
#[graphql(name = "Conversation")]
pub struct ConversationObject {
    // A `String` in the contract, where most types use `ID`.
    id: Option<String>,
    title: Option<String>,
    llm_provider: Option<String>,
    llm_model: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<Conversation> for ConversationObject {
    fn from(conversation: Conversation) -> Self {
        Self {
            id: Some(conversation.id),
            title: conversation.title,
            llm_provider: conversation.llm_provider,
            llm_model: conversation.llm_model,
            created_at: Some(iso(conversation.created_at)),
            updated_at: Some(iso(conversation.updated_at)),
        }
    }
}

fn objects(conversations: Vec<Conversation>) -> Option<Vec<ConversationObject>> {
    Some(conversations.into_iter().map(ConversationObject::from).collect())
}

#[derive(Default)]
pub struct ConversationsQuery;

#[Object]
impl ConversationsQuery {
    // `limit` bounds the fetch for surfaces that only show a window (the
    // assistant sidebar's ten most recent). Omitted, it is the user's full
    // history, which is what the history page wants.
    async fn conversations(
        &self,
        ctx: &Context<'_>,
        limit: Option<i32>,
    ) -> Result<Option<Vec<ConversationObject>>> {
        let user = require_user(ctx)?;
        let conversations = container(ctx)
            .list_conversations_use_case()
            .execute(&user.sub, limit.map(i64::from))
            .await
            .gql()?;
        Ok(objects(conversations))
    }

    async fn search_conversations(
        &self,
        ctx: &Context<'_>,
        query: String,
    ) -> Result<Option<Vec<ConversationObject>>> {
        let user = require_user(ctx)?;
        let conversations =
            container(ctx).search_conversations_use_case().execute(&user.sub, &query).await.gql()?;
        Ok(objects(conversations))
    }
}

#[derive(Default)]
pub struct ConversationsMutation;

#[Object]
impl ConversationsMutation {
    async fn create_conversation(
        &self,
        ctx: &Context<'_>,
        provider: Option<String>,
        model: Option<String>,
    ) -> Result<Option<ConversationObject>> {
        let user = require_user(ctx)?;
        let conversation = container(ctx)
            .create_conversation_use_case()
            .execute(CreateConversationInput { user_id: user.sub.clone(), provider, model })
            .await
            .gql()?;
        Ok(Some(conversation.into()))
    }

    async fn delete_conversation(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_conversation_use_case()
            .execute(DeleteConversationInput { user_id: user.sub.clone(), conversation_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }
}
