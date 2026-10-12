//! The key every cached read is stored under.
//!
//! These strings are shared with `apps/api` (both implementations can run
//! against one Redis), and an invalidation only works if it names the key the
//! read used, so they are built here and nowhere else.

pub fn app_by_id(id: &str) -> String {
    format!("apps:byId:{id}")
}

/// Prefix of every per-status list of one user's applications.
pub fn app_list_prefix(user_id: &str) -> String {
    format!("apps:list:{user_id}:")
}

pub fn app_trash_list(user_id: &str) -> String {
    format!("apps:trash:{user_id}")
}

pub fn app_list(user_id: &str, status: &str) -> String {
    format!("apps:list:{user_id}:{status}")
}

pub fn note_by_id(id: &str) -> String {
    format!("notes:byId:{id}")
}

pub fn note_list(application_id: &str) -> String {
    format!("notes:list:{application_id}")
}

pub fn doc_by_id(id: &str) -> String {
    format!("docs:byId:{id}")
}

pub fn doc_list(application_id: &str) -> String {
    format!("docs:list:{application_id}")
}

pub fn round_by_id(id: &str) -> String {
    format!("rounds:byId:{id}")
}

pub fn round_list(application_id: &str) -> String {
    format!("rounds:list:{application_id}")
}

pub fn contact_by_id(id: &str) -> String {
    format!("contacts:byId:{id}")
}

pub fn contact_list(application_id: &str) -> String {
    format!("contacts:list:{application_id}")
}

pub fn api_token_by_id(id: &str) -> String {
    format!("tokens:byId:{id}")
}

pub fn api_token_by_hash(token_hash: &str) -> String {
    format!("tokens:byHash:{token_hash}")
}

pub fn api_token_list(user_id: &str) -> String {
    format!("tokens:list:{user_id}")
}

pub fn api_token_last_used(id: &str) -> String {
    format!("tokens:lastUsedWritten:{id}")
}

pub fn mcp_oauth_token_by_hash(token_hash: &str) -> String {
    format!("mcpTokens:byHash:{token_hash}")
}

pub fn mcp_oauth_token_last_used(id: &str) -> String {
    format!("mcpTokens:lastUsedWritten:{id}")
}

pub fn notification_unread_count(user_id: &str) -> String {
    format!("notifications:unreadCount:{user_id}")
}

pub fn user_by_id(id: &str) -> String {
    format!("users:byId:{id}")
}

pub fn user_by_email(email: &str) -> String {
    format!("users:byEmail:{email}")
}

pub fn skill_by_id(id: &str) -> String {
    format!("skills:byId:{id}")
}

pub fn skill_list(user_id: &str) -> String {
    format!("skills:list:{user_id}")
}

pub fn education_by_id(id: &str) -> String {
    format!("education:byId:{id}")
}

pub fn education_list(user_id: &str) -> String {
    format!("education:list:{user_id}")
}

pub fn work_experience_by_id(id: &str) -> String {
    format!("workExperience:byId:{id}")
}

pub fn work_experience_list(user_id: &str) -> String {
    format!("workExperience:list:{user_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_same_strings_as_the_original() {
        assert_eq!(app_by_id("a1"), "apps:byId:a1");
        assert_eq!(app_list_prefix("u1"), "apps:list:u1:");
        assert_eq!(app_trash_list("u1"), "apps:trash:u1");
        assert_eq!(app_list("u1", "applied"), "apps:list:u1:applied");
        assert_eq!(note_by_id("n1"), "notes:byId:n1");
        assert_eq!(note_list("a1"), "notes:list:a1");
        assert_eq!(doc_by_id("d1"), "docs:byId:d1");
        assert_eq!(doc_list("a1"), "docs:list:a1");
        assert_eq!(round_by_id("r1"), "rounds:byId:r1");
        assert_eq!(round_list("a1"), "rounds:list:a1");
        assert_eq!(contact_by_id("c1"), "contacts:byId:c1");
        assert_eq!(contact_list("a1"), "contacts:list:a1");
        assert_eq!(api_token_by_id("t1"), "tokens:byId:t1");
        assert_eq!(api_token_by_hash("h1"), "tokens:byHash:h1");
        assert_eq!(api_token_list("u1"), "tokens:list:u1");
        assert_eq!(api_token_last_used("t1"), "tokens:lastUsedWritten:t1");
        assert_eq!(mcp_oauth_token_by_hash("h1"), "mcpTokens:byHash:h1");
        assert_eq!(mcp_oauth_token_last_used("t1"), "mcpTokens:lastUsedWritten:t1");
        assert_eq!(notification_unread_count("u1"), "notifications:unreadCount:u1");
        assert_eq!(user_by_id("u1"), "users:byId:u1");
        assert_eq!(user_by_email("a@b.c"), "users:byEmail:a@b.c");
        assert_eq!(skill_by_id("s1"), "skills:byId:s1");
        assert_eq!(skill_list("u1"), "skills:list:u1");
        assert_eq!(education_by_id("e1"), "education:byId:e1");
        assert_eq!(education_list("u1"), "education:list:u1");
        assert_eq!(work_experience_by_id("w1"), "workExperience:byId:w1");
        assert_eq!(work_experience_list("u1"), "workExperience:list:u1");
    }

    #[test]
    fn a_status_list_key_starts_with_the_prefix_that_invalidates_it() {
        assert!(app_list("u1", "offer").starts_with(&app_list_prefix("u1")));
    }
}
