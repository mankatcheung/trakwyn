use std::sync::Arc;

use crate::domain::conversation::Conversation;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::ConversationRepository;

/// What JavaScript's `String.prototype.trim` strips: the `WhiteSpace` and
/// `LineTerminator` productions. Differs from `char::is_whitespace` at
/// U+FEFF (stripped here) and U+0085 (not stripped here).
fn is_js_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200A}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202F}'
            | '\u{205F}'
            | '\u{3000}'
            | '\u{FEFF}'
    )
}

/// Finds a user's conversations whose title or any message content matches
/// the search term, newest-updated first. The search runs server-side so
/// clients never need the full history to filter it locally. A blank term
/// finds nothing rather than silently behaving as "list everything": callers
/// that want that have the list query.
pub struct SearchConversationsUseCase {
    pub conversation_repository: Arc<dyn ConversationRepository>,
}

impl SearchConversationsUseCase {
    pub async fn execute(
        &self,
        user_id: &str,
        search_term: &str,
    ) -> DomainResult<Vec<Conversation>> {
        let trimmed = search_term.trim_matches(is_js_whitespace);
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        self.conversation_repository.search_by_user_id(user_id, trimmed).await
    }
}
