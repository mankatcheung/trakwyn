use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;

/// What a user-supplied URL is about to be used for. The policy is stricter
/// for an LLM endpoint (every AI feature will keep POSTing there, with a
/// credential attached) than for a one-off job-posting fetch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutboundUrlPurpose {
    LlmProvider,
    JobPosting,
}

/// Decides whether the API server may open a connection to a URL a user
/// typed in. Both places that take one (the custom LLM provider's base URL
/// and `parseJobDescription(url)`) fetch it from inside the server's own
/// network, so without a policy an authenticated user can point the server
/// at cloud metadata endpoints, Redis or its own admin routes.
///
/// Fails with a `Validation` error for a refused URL. Callers check at save
/// time and again right before every request and redirect hop, since a
/// hostname can change what it resolves to in between.
#[async_trait]
pub trait OutboundUrlPolicy: Send + Sync {
    async fn assert_allowed(&self, url: &str, purpose: OutboundUrlPurpose) -> DomainResult<()>;
}
