//! Records every MCP and chat tool call (JEF-365): which tool ran, whether
//! the caller could run it, and how it ended.
//!
//! A port so that the MCP controller and the chat use case can report a call
//! without knowing how it is recorded. It wraps the dispatch rather than a
//! use case, so the tools that read a repository directly are covered too.
//! Nothing about a call's content is ever reported: arguments carry
//! application ids and free text, and a result is the user's own records.

use std::future::Future;
use std::sync::{Arc, Mutex, MutexGuard};

use crate::domain::api_token::ApiTokenScope;
use crate::use_cases::errors::{DomainError, ErrorCode};

/// Which surface a tool was called through: an MCP client, or the in-app chat assistant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ToolSurface {
    Mcp,
    Chat,
}

impl ToolSurface {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Mcp => "mcp",
            Self::Chat => "chat",
        }
    }
}

/// How one tool call ended. A bounded set, so it can label a metric.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ToolCallOutcome {
    /// The tool ran and returned a result.
    Ok,
    /// A `DomainError` the caller can act on ("Application not found").
    DomainError,
    /// Anything else that failed, which is a bug or an outage.
    InternalError,
    /// The token's scope does not allow the tool.
    Refused,
    /// The arguments, or the tool name itself, were unusable.
    InvalidParams,
}

impl ToolCallOutcome {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::DomainError => "domain_error",
            Self::InternalError => "internal_error",
            Self::Refused => "refused",
            Self::InvalidParams => "invalid_params",
        }
    }
}

/// What the observer is told about a call before it runs. No arguments, ever.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCallMeta {
    pub surface: ToolSurface,
    /// The tool name as requested. On MCP that is whatever the client sent,
    /// so the observer checks it against the catalogue before it lands in a
    /// metric label.
    pub name: String,
    /// MCP only. Chat is session-authenticated and has no token.
    pub token_scope: Option<ApiTokenScope>,
}

/// How a call ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCallSettlement {
    pub outcome: ToolCallOutcome,
    /// Set with [`ToolCallOutcome::Refused`]: whose token was refused.
    pub refused_user_id: Option<String>,
}

/// Where a finished call is reported.
pub trait ToolCallObserver: Send + Sync {
    /// Called exactly once per observed call, after it has ended.
    fn record(&self, meta: &ToolCallMeta, settlement: &ToolCallSettlement);
}

/// Handed to the observed function so it can say how the call ended when
/// that is not simply "returned". A call that reports nothing is `Ok`.
pub struct ToolCallRecorder {
    settlement: Mutex<ToolCallSettlement>,
}

impl ToolCallRecorder {
    fn new() -> Self {
        Self {
            settlement: Mutex::new(ToolCallSettlement {
                outcome: ToolCallOutcome::Ok,
                refused_user_id: None,
            }),
        }
    }

    fn settlement(&self) -> MutexGuard<'_, ToolCallSettlement> {
        self.settlement.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The call succeeded.
    pub fn succeeded(&self) {
        self.settlement().outcome = ToolCallOutcome::Ok;
    }

    /// A failure the surface caught and turned into a reply. A
    /// `Validation` error means the model or client sent something unusable,
    /// so it is `InvalidParams` like the controller's own argument checks;
    /// any other coded error is one the caller can act on; anything else is
    /// a bug or an outage.
    pub fn failed(&self, error: &DomainError) {
        self.settlement().outcome = match error {
            DomainError::Coded { code: ErrorCode::Validation, .. } => {
                ToolCallOutcome::InvalidParams
            }
            DomainError::Coded { .. } => ToolCallOutcome::DomainError,
            DomainError::Internal(_) => ToolCallOutcome::InternalError,
        };
    }

    pub fn invalid_params(&self) {
        self.settlement().outcome = ToolCallOutcome::InvalidParams;
    }

    /// The token's scope does not cover the tool. This is the MCP security
    /// boundary, so the observer also logs it with the user and counts it.
    pub fn refused(&self, user_id: &str) {
        let mut settlement = self.settlement();
        settlement.outcome = ToolCallOutcome::Refused;
        settlement.refused_user_id = Some(user_id.to_string());
    }
}

/// Runs one tool call and reports how it ended to `observer`.
///
/// Wrap the whole call, refusal and argument checks included, so every call
/// is counted once however it ends. The observed function reports anything
/// other than a plain return through the recorder it is handed.
pub async fn observe<T, F, Fut>(observer: &dyn ToolCallObserver, meta: ToolCallMeta, run: F) -> T
where
    F: FnOnce(Arc<ToolCallRecorder>) -> Fut,
    Fut: Future<Output = T>,
{
    let recorder = Arc::new(ToolCallRecorder::new());
    let output = run(recorder.clone()).await;
    let settlement = recorder.settlement().clone();
    observer.record(&meta, &settlement);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Recording(Mutex<Vec<(ToolCallMeta, ToolCallSettlement)>>);

    impl ToolCallObserver for Recording {
        fn record(&self, meta: &ToolCallMeta, settlement: &ToolCallSettlement) {
            self.0.lock().unwrap().push((meta.clone(), settlement.clone()));
        }
    }

    fn meta() -> ToolCallMeta {
        ToolCallMeta { surface: ToolSurface::Chat, name: "list_notes".into(), token_scope: None }
    }

    #[tokio::test]
    async fn a_call_that_reports_nothing_is_ok() {
        let observer = Recording::default();
        let out = observe(&observer, meta(), |_| async { 7 }).await;
        assert_eq!(out, 7);
        let recorded = observer.0.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].1.outcome, ToolCallOutcome::Ok);
    }

    #[tokio::test]
    async fn classifies_failures_by_error_code() {
        let cases = [
            (DomainError::validation("bad"), ToolCallOutcome::InvalidParams),
            (DomainError::not_found("gone"), ToolCallOutcome::DomainError),
            (DomainError::internal("boom"), ToolCallOutcome::InternalError),
        ];
        for (error, expected) in cases {
            let observer = Recording::default();
            observe(&observer, meta(), |call| async move { call.failed(&error) }).await;
            assert_eq!(observer.0.lock().unwrap()[0].1.outcome, expected);
        }
    }

    #[tokio::test]
    async fn a_refusal_names_the_user() {
        let observer = Recording::default();
        observe(&observer, meta(), |call| async move { call.refused("user-1") }).await;
        let recorded = observer.0.lock().unwrap();
        assert_eq!(recorded[0].1.outcome, ToolCallOutcome::Refused);
        assert_eq!(recorded[0].1.refused_user_id.as_deref(), Some("user-1"));
    }

    #[test]
    fn spells_the_labels_as_the_original_does() {
        assert_eq!(ToolSurface::Mcp.as_str(), "mcp");
        assert_eq!(ToolCallOutcome::InvalidParams.as_str(), "invalid_params");
        assert_eq!(ToolCallOutcome::InternalError.as_str(), "internal_error");
    }
}
