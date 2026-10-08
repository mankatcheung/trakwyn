//! The MCP server's adapter layer: the tool catalogue, JSON-RPC constants
//! and the controller that turns a request into use-case calls
//! (`interface-adapters/{llm,mcp}` in `apps/api`).

pub mod constants;
pub mod controller;
pub mod operation_name;
pub mod tool_catalogue;
pub mod write_tools;

#[cfg(test)]
mod tests;
