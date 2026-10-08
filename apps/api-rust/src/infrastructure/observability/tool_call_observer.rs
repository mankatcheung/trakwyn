//! `ToolCallObserver` over the `Metrics` and `Logger` ports (JEF-365): a
//! `trakwyn.tool.calls` count by outcome, and a `warn` line plus a counter
//! when a token's scope refuses a tool. (`apps/api` also opens a span per
//! call; there is no tracing exporter behind this port yet.)
//!
//! Nothing about a call's content is recorded: arguments carry application
//! ids and free text, and a result is the user's own records.

use std::collections::HashSet;
use std::sync::Arc;

use crate::use_cases::ports::logger::{LogValue, Logger};
use crate::use_cases::ports::metrics::Metrics;
use crate::use_cases::ports::tool_call_observer::{
    ToolCallMeta, ToolCallObserver, ToolCallOutcome, ToolCallSettlement,
};

/// Stands in for a tool name that is not in the catalogue.
const UNKNOWN_TOOL: &str = "unknown";
/// The `event` field the refusal line is grouped on.
const MCP_TOOL_REFUSED_EVENT: &str = "mcp.tool.refused";

pub struct CatalogueToolCallObserver {
    known_tools: HashSet<String>,
    logger: Arc<dyn Logger>,
    metrics: Arc<dyn Metrics>,
}

impl CatalogueToolCallObserver {
    /// `tool_names` is the catalogue: the only names that may become a metric
    /// label, so a client cannot create labels by inventing names.
    pub fn new<'a>(
        tool_names: impl IntoIterator<Item = &'a str>,
        logger: Arc<dyn Logger>,
        metrics: Arc<dyn Metrics>,
    ) -> Self {
        Self { known_tools: tool_names.into_iter().map(str::to_string).collect(), logger, metrics }
    }
}

impl ToolCallObserver for CatalogueToolCallObserver {
    fn record(&self, meta: &ToolCallMeta, settlement: &ToolCallSettlement) {
        let tool =
            if self.known_tools.contains(&meta.name) { meta.name.as_str() } else { UNKNOWN_TOOL };

        if settlement.outcome == ToolCallOutcome::Refused {
            let scope = meta.token_scope.map(|scope| scope.as_str());
            // No error: nothing was thrown, the scope check refused on
            // purpose. A token probing write tools shows up as a run of
            // these (JEF-354).
            self.logger.warn(
                "MCP tool refused for token scope",
                None,
                &[
                    ("event", LogValue::from(MCP_TOOL_REFUSED_EVENT)),
                    ("userId", LogValue::from(settlement.refused_user_id.clone())),
                    ("tool", LogValue::from(tool)),
                    ("scope", LogValue::from(scope.map(str::to_string))),
                ],
            );
            if let Some(scope) = scope {
                self.metrics.record_mcp_tool_refused(tool, scope);
            }
        }
        self.metrics.record_tool_call(meta.surface.as_str(), tool, settlement.outcome.as_str());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::api_token::ApiTokenScope;
    use crate::use_cases::ports::tool_call_observer::{observe, ToolSurface};
    use crate::use_cases::test_support::{FakeLogger, FakeMetrics, LogLevel};

    fn observer() -> (CatalogueToolCallObserver, Arc<FakeLogger>, Arc<FakeMetrics>) {
        let logger = Arc::new(FakeLogger::default());
        let metrics = Arc::new(FakeMetrics::default());
        let observer = CatalogueToolCallObserver::new(
            ["list_notes", "create_note"],
            logger.clone(),
            metrics.clone(),
        );
        (observer, logger, metrics)
    }

    fn meta(name: &str, scope: Option<ApiTokenScope>) -> ToolCallMeta {
        ToolCallMeta { surface: ToolSurface::Mcp, name: name.into(), token_scope: scope }
    }

    #[tokio::test]
    async fn counts_a_call_by_surface_tool_and_outcome() {
        let (observer, _, metrics) = observer();
        observe(&observer, meta("list_notes", None), |_| async {}).await;
        let calls = metrics.tool_calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            (calls[0].surface.as_str(), calls[0].tool.as_str(), calls[0].outcome.as_str()),
            ("mcp", "list_notes", "ok")
        );
    }

    #[tokio::test]
    async fn a_name_outside_the_catalogue_is_recorded_as_unknown() {
        let (observer, _, metrics) = observer();
        observe(&observer, meta("drop_tables", None), |call| async move { call.invalid_params() })
            .await;
        let calls = metrics.tool_calls();
        assert_eq!(
            (calls[0].tool.as_str(), calls[0].outcome.as_str()),
            ("unknown", "invalid_params")
        );
    }

    #[tokio::test]
    async fn a_refusal_is_logged_and_counted_without_arguments() {
        let (observer, logger, metrics) = observer();
        observe(&observer, meta("create_note", Some(ApiTokenScope::Read)), |call| async move {
            call.refused("user-1")
        })
        .await;

        let lines = logger.lines();
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].level, LogLevel::Warn);
        assert_eq!(lines[0].field("event"), Some(&LogValue::Str("mcp.tool.refused".into())));
        assert_eq!(lines[0].field("userId"), Some(&LogValue::Str("user-1".into())));
        assert_eq!(lines[0].field("tool"), Some(&LogValue::Str("create_note".into())));
        assert_eq!(lines[0].field("scope"), Some(&LogValue::Str("read".into())));
        assert_eq!(lines[0].fields.len(), 4);
        assert_eq!(metrics.mcp_tool_refused()[0].scope, "read");
        assert_eq!(metrics.tool_calls()[0].outcome, "refused");
    }

    #[tokio::test]
    async fn a_call_that_is_not_refused_logs_nothing() {
        let (observer, logger, metrics) = observer();
        observe(&observer, meta("list_notes", Some(ApiTokenScope::Full)), |_| async {}).await;
        assert!(logger.lines().is_empty());
        assert!(metrics.mcp_tool_refused().is_empty());
    }
}
