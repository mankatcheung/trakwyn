//! The chat assistant: the streaming use case and the history query. The
//! conversation use cases are in `conversations.rs`.

use std::sync::Arc;

use crate::http::container::Container;
use crate::http::mcp::tool_catalogue::{chat_tools, to_llm_tool_definitions, tool_catalogue};
use crate::infrastructure::observability::CatalogueToolCallObserver;
use crate::use_cases::chat::{
    ChatToolDeps, GetChatHistoryUseCase, StreamChatWithAssistantUseCase,
};
use crate::use_cases::ports::tool_call_observer::ToolCallObserver;

impl Container {
    /// Built per use rather than held on the container: it is stateless,
    /// only a catalogue of names over the shared logger and metrics.
    pub fn tool_call_observer(&self) -> Arc<dyn ToolCallObserver> {
        Arc::new(CatalogueToolCallObserver::new(
            tool_catalogue().iter().map(|tool| tool.name),
            self.services.logger.clone(),
            self.services.metrics.clone(),
        ))
    }

    /// The read tools' collaborators, shared by chat and MCP.
    pub fn chat_tool_deps(&self) -> ChatToolDeps {
        ChatToolDeps {
            get_applications_page_use_case: self.get_applications_page_use_case(),
            get_application_use_case: self.get_application_use_case(),
            get_notes_use_case: self.get_notes_use_case(),
            get_contacts_use_case: self.get_contacts_use_case(),
            get_interview_rounds_use_case: self.get_interview_rounds_use_case(),
            get_documents_use_case: self.get_documents_use_case(),
            get_offers_use_case: self.get_offers_use_case(),
            get_activity_logs_use_case: self.get_activity_logs_use_case(),
            get_calendar_events_use_case: self.get_calendar_events_use_case(),
            get_response_time_analytics_use_case: self.get_response_time_analytics_use_case(),
            get_application_channel_analytics_use_case: self
                .get_application_channel_analytics_use_case(),
            get_interview_round_analytics_use_case: self.get_interview_round_analytics_use_case(),
            get_offer_analytics_use_case: self.get_offer_analytics_use_case(),
            work_experience_repository: self.work_experience_repository.clone(),
            education_repository: self.education_repository.clone(),
            skill_repository: self.skill_repository.clone(),
            tool_call_observer: self.tool_call_observer(),
        }
    }

    pub fn get_chat_history_use_case(&self) -> GetChatHistoryUseCase {
        GetChatHistoryUseCase {
            message_repository: self.message_repository.clone(),
            conversation_repository: self.conversation_repository.clone(),
        }
    }

    pub fn stream_chat_with_assistant_use_case(&self) -> StreamChatWithAssistantUseCase {
        StreamChatWithAssistantUseCase {
            tools: self.chat_tool_deps(),
            // Which tools the assistant is offered is decided here, in the
            // composition root. Chat has no token scope to gate writes on, so
            // it gets read tools only; MCP takes the full catalogue and gates
            // per request instead (JEF-177).
            chat_tools: to_llm_tool_definitions(&chat_tools()),
            llm_provider_factory: self.llm_provider_factory.clone(),
            chat_rate_limiter: self.services.rate_limiters.chat.clone(),
            message_repository: self.message_repository.clone(),
            conversation_repository: self.conversation_repository.clone(),
            user_repository: self.user_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }
}
