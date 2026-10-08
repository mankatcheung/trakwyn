//! What an MCP request asked for, as the suffix of its operation's name:
//! `tools/call get_application`, `tools/list` (JEF-365). Without it every
//! operation is just `POST /mcp`.
//!
//! The body is whatever the client sent, and this ends up in a log field or
//! a span name, so only our own method and tool names pass through. Anything
//! else is `unknown`, and a body that is not a JSON-RPC request names nothing.

use serde_json::Value;

use super::constants::{method, UNKNOWN_OPERATION};
use super::tool_catalogue::mcp_tools;

pub fn mcp_operation_name(body: &Value) -> Option<String> {
    let method_name = body.as_object()?.get("method")?.as_str()?;
    if !method::ALL.contains(&method_name) {
        return Some(UNKNOWN_OPERATION.to_string());
    }
    if method_name != method::TOOLS_CALL {
        return Some(method_name.to_string());
    }

    let requested =
        body.get("params").and_then(|params| params.get("name")).and_then(Value::as_str);
    let tool = requested
        .filter(|name| mcp_tools().iter().any(|tool| tool.name == *name))
        .unwrap_or(UNKNOWN_OPERATION);
    Some(format!("{method_name} {tool}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rpc(method: Value, params: Option<Value>) -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    #[test]
    fn names_a_tool_call_after_the_tool() {
        let body = rpc(json!("tools/call"), Some(json!({ "name": "get_application" })));
        assert_eq!(mcp_operation_name(&body).as_deref(), Some("tools/call get_application"));
    }

    #[test]
    fn names_every_catalogue_tool() {
        for tool in mcp_tools() {
            let body = rpc(json!("tools/call"), Some(json!({ "name": tool.name })));
            assert_eq!(mcp_operation_name(&body), Some(format!("tools/call {}", tool.name)));
        }
    }

    #[test]
    fn names_the_other_methods_by_method_alone() {
        assert_eq!(
            mcp_operation_name(&rpc(json!("tools/list"), None)).as_deref(),
            Some("tools/list")
        );
        assert_eq!(
            mcp_operation_name(&rpc(json!("initialize"), None)).as_deref(),
            Some("initialize")
        );
    }

    #[test]
    fn never_puts_a_client_chosen_name_into_the_operation() {
        let long = "x".repeat(500);
        for params in [Some(json!({ "name": long })), Some(json!({ "name": 42 })), None] {
            assert_eq!(
                mcp_operation_name(&rpc(json!("tools/call"), params)).as_deref(),
                Some("tools/call unknown")
            );
        }
        assert_eq!(
            mcp_operation_name(&rpc(json!("resources/list"), None)).as_deref(),
            Some("unknown")
        );
    }

    #[test]
    fn names_nothing_for_a_body_that_is_not_a_json_rpc_request() {
        assert_eq!(mcp_operation_name(&Value::Null), None);
        assert_eq!(mcp_operation_name(&json!("tools/call")), None);
        assert_eq!(mcp_operation_name(&json!({ "jsonrpc": "2.0" })), None);
    }
}
