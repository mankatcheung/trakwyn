//! The interfaces `use_cases` needs from the outside world. `infrastructure`
//! implements them; `http::container` picks the implementation.

pub mod activity_log_repository;
pub mod application_repository;
pub mod job_posting_source_resolver;
pub mod llm_provider;
pub mod logger;
pub mod note_repository;
pub mod outbound_url_policy;
pub mod session_blocklist;
pub mod token_service;
pub mod transaction_manager;

pub use activity_log_repository::{ActivityLogRepository, AppendActivityLogData};
pub use application_repository::ApplicationRepository;
pub use job_posting_source_resolver::{JobPostingSource, JobPostingSourceResolver};
pub use llm_provider::{
    LLMProvider, LlmCompleteOptions, LlmCompleteResult, LlmCompletionResult, LlmMessage, LlmRole,
    LlmStream, LlmStreamChunk, LlmToolCall, LlmToolDefinition, LlmUsage,
};
pub use note_repository::{CreateNoteData, NoteRepository};
pub use session_blocklist::SessionBlocklist;
pub use token_service::{AccessClaims, RefreshClaims, TokenPair, TokenService};
