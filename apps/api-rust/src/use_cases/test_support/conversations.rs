use std::cmp::Reverse;
use std::sync::{Arc, Mutex};

use async_trait::async_trait;

use super::messages::FakeMessageRepository;
use crate::domain::conversation::Conversation;
use crate::domain::message::Message;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ConversationRepository, CreateConversationData};

/// Searches message contents, and cascades a delete to them, when it shares
/// a message store through [`FakeConversationRepository::with_messages`].
#[derive(Default)]
pub struct FakeConversationRepository {
    conversations: Mutex<Vec<Conversation>>,
    messages: Arc<Mutex<Vec<Message>>>,
}

impl FakeConversationRepository {
    pub fn with(conversations: Vec<Conversation>) -> Self {
        Self { conversations: Mutex::new(conversations), ..Self::default() }
    }

    /// Shares `messages`' store, the way both tables share one database.
    pub fn with_messages(self, messages: &FakeMessageRepository) -> Self {
        Self { messages: messages.store(), ..self }
    }

    pub fn all(&self) -> Vec<Conversation> {
        self.conversations.lock().unwrap().clone()
    }

    /// Every update moves `updatedAt`, as Drizzle's `$onUpdate` does.
    fn update_with(&self, id: &str, change: impl FnOnce(&mut Conversation)) {
        let mut conversations = self.conversations.lock().unwrap();
        if let Some(conversation) = conversations.iter_mut().find(|c| c.id == id) {
            change(conversation);
            conversation.updated_at = now();
        }
    }
}

/// What `ILIKE '%term%'` with the wildcards escaped amounts to.
fn contains_ignoring_case(haystack: &str, needle_lowercase: &str) -> bool {
    haystack.to_lowercase().contains(needle_lowercase)
}

#[async_trait]
impl ConversationRepository for FakeConversationRepository {
    async fn create(&self, data: CreateConversationData) -> DomainResult<Conversation> {
        let timestamp = now();
        let conversation = Conversation {
            id: data.id,
            user_id: data.user_id,
            title: None,
            llm_provider: data.llm_provider,
            llm_model: data.llm_model,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.conversations.lock().unwrap().push(conversation.clone());
        Ok(conversation)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Conversation>> {
        Ok(self.all().into_iter().find(|conversation| conversation.id == id))
    }

    async fn find_all_by_user_id(
        &self,
        user_id: &str,
        limit: Option<i64>,
    ) -> DomainResult<Vec<Conversation>> {
        let mut conversations: Vec<Conversation> =
            self.all().into_iter().filter(|conversation| conversation.user_id == user_id).collect();
        conversations.sort_by_key(|conversation| Reverse(conversation.updated_at));
        if let Some(limit) = limit.filter(|limit| *limit >= 0) {
            conversations.truncate(limit as usize);
        }
        Ok(conversations)
    }

    async fn search_by_user_id(
        &self,
        user_id: &str,
        search_term: &str,
    ) -> DomainResult<Vec<Conversation>> {
        let needle = search_term.to_lowercase();
        let messages = self.messages.lock().unwrap().clone();
        let mut conversations: Vec<Conversation> = self
            .all()
            .into_iter()
            .filter(|conversation| conversation.user_id == user_id)
            .filter(|conversation| {
                let title_matches = conversation
                    .title
                    .as_deref()
                    .is_some_and(|title| contains_ignoring_case(title, &needle));
                title_matches
                    || messages.iter().any(|message| {
                        message.conversation_id == conversation.id
                            && contains_ignoring_case(&message.content, &needle)
                    })
            })
            .collect();
        conversations.sort_by_key(|conversation| Reverse(conversation.updated_at));
        Ok(conversations)
    }

    async fn update_title(&self, id: &str, title: &str) -> DomainResult<()> {
        self.update_with(id, |conversation| conversation.title = Some(title.to_string()));
        Ok(())
    }

    async fn update_llm_settings(
        &self,
        id: &str,
        llm_provider: &str,
        llm_model: Option<&str>,
    ) -> DomainResult<()> {
        self.update_with(id, |conversation| {
            conversation.llm_provider = Some(llm_provider.to_string());
            conversation.llm_model = llm_model.map(str::to_string);
        });
        Ok(())
    }

    async fn delete(&self, id: &str) -> DomainResult<()> {
        self.conversations.lock().unwrap().retain(|conversation| conversation.id != id);
        self.messages.lock().unwrap().retain(|message| message.conversation_id != id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::message::MessageRole;
    use crate::use_cases::ports::{CreateMessageData, MessageRepository};

    fn data(id: &str, user_id: &str) -> CreateConversationData {
        CreateConversationData {
            id: id.to_string(),
            user_id: user_id.to_string(),
            ..CreateConversationData::default()
        }
    }

    fn message(id: &str, conversation_id: &str, content: &str) -> CreateMessageData {
        CreateMessageData {
            id: id.to_string(),
            conversation_id: conversation_id.to_string(),
            role: MessageRole::User,
            content: content.to_string(),
            tool_trace: None,
        }
    }

    #[tokio::test]
    async fn searches_titles_and_message_contents_ignoring_case() {
        let messages = FakeMessageRepository::default();
        let conversations = FakeConversationRepository::default().with_messages(&messages);
        for id in ["by-title", "by-content", "neither", "foreign"] {
            let user_id = if id == "foreign" { "user-2" } else { "user-1" };
            conversations.create(data(id, user_id)).await.unwrap();
        }
        conversations.update_title("by-title", "Salary NEGOTIATION tips").await.unwrap();
        conversations.update_title("foreign", "negotiation").await.unwrap();
        messages.create(message("m1", "by-content", "How do I open a negotiation?")).await.unwrap();
        messages.create(message("m2", "neither", "100% unrelated")).await.unwrap();

        let found = conversations.search_by_user_id("user-1", "Negotiation").await.unwrap();
        let mut ids: Vec<&str> =
            found.iter().map(|conversation| conversation.id.as_str()).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["by-content", "by-title"]);

        // Wildcards are literal: `_` does not stand for any character.
        assert!(conversations.search_by_user_id("user-1", "1_0").await.unwrap().is_empty());
        assert_eq!(conversations.search_by_user_id("user-1", "100%").await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_delete_takes_the_conversations_messages_with_it() {
        let messages = FakeMessageRepository::default();
        let conversations = FakeConversationRepository::default().with_messages(&messages);
        conversations.create(data("c1", "user-1")).await.unwrap();
        messages.create(message("m1", "c1", "hello")).await.unwrap();

        conversations.delete("c1").await.unwrap();

        assert!(messages.find_all_by_conversation_id("c1").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_limit_bounds_the_list_and_a_negative_one_does_not() {
        let conversations = FakeConversationRepository::default();
        for id in ["c1", "c2", "c3"] {
            conversations.create(data(id, "user-1")).await.unwrap();
        }

        assert_eq!(conversations.find_all_by_user_id("user-1", Some(2)).await.unwrap().len(), 2);
        assert_eq!(conversations.find_all_by_user_id("user-1", Some(-1)).await.unwrap().len(), 3);
        assert_eq!(conversations.find_all_by_user_id("user-1", None).await.unwrap().len(), 3);
    }
}
