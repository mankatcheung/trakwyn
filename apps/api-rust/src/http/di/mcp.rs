//! The MCP controller: the read tools it shares with chat, plus the write
//! tools only a full-access token may call.

use crate::http::container::Container;
use crate::http::mcp::controller::McpController;
use crate::http::mcp::write_tools::WriteToolDeps;

impl Container {
    pub fn mcp_controller(&self) -> McpController {
        McpController {
            reads: self.chat_tool_deps(),
            writes: WriteToolDeps {
                create_application_use_case: self.create_application_use_case(),
                update_application_use_case: self.update_application_use_case(),
                create_note_use_case: self.create_note_use_case(),
                create_interview_round_use_case: self.create_interview_round_use_case(),
                create_skill_use_case: self.create_skill_use_case(),
                update_skill_use_case: self.update_skill_use_case(),
                create_education_use_case: self.create_education_use_case(),
                update_education_use_case: self.update_education_use_case(),
                create_work_experience_use_case: self.create_work_experience_use_case(),
                update_work_experience_use_case: self.update_work_experience_use_case(),
            },
        }
    }
}
