use std::sync::Arc;

use crate::domain::oauth_account::OAuthProviderName;
use crate::use_cases::ports::oauth_provider::OAuthProvider;

pub trait OAuthProviderRegistry: Send + Sync {
    fn get(&self, provider: OAuthProviderName) -> Arc<dyn OAuthProvider>;
}
