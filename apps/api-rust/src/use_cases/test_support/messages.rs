use std::sync::{Arc, Mutex};

use async_trait::async_trait;

use crate::domain::message::Message;
use crate::use_cases::clock::now;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{CreateMessageData, MessageRepository};

/// Messages live behind a shared handle so a `FakeConversationRepository`
/// built with `with_messages` can search them and cascade its deletes.
#[derive(Default)]
pub struct FakeMessageRepository {
    messages: Arc<Mutex<Vec<Message>>>,
}

impl FakeMessageRepository {
    pub fn with(messages: Vec<Message>) -> Self {
        Self { messages: Arc::new(Mutex::new(messages)) }
    }

    pub fn all(&self) -> Vec<Message> {
        self.messages.lock().unwrap().clone()
    }

    pub(super) fn store(&self) -> Arc<Mutex<Vec<Message>>> {
        Arc::clone(&self.messages)
    }
}

#[async_trait]
impl MessageRepository for FakeMessageRepository {
    async fn create(&self, data: CreateMessageData) -> DomainResult<Message> {
        let message = Message {
            id: data.id,
            conversation_id: data.conversation_id,
            role: data.role,
            content: data.content,
            tool_trace: data.tool_trace,
            created_at: now(),
        };
        self.messages.lock().unwrap().push(message.clone());
        Ok(message)
    }

    async fn find_all_by_conversation_id(
        &self,
        conversation_id: &str,
    ) -> DomainResult<Vec<Message>> {
        let mut messages: Vec<Message> = self
            .all()
            .into_iter()
            .filter(|message| message.conversation_id == conversation_id)
            .collect();
        messages.sort_by_key(|message| message.created_at);
        Ok(messages)
    }
}
