use std::sync::Arc;

use crate::domain::oauth_account::OAuthProviderName;
use crate::use_cases::ports::oauth_provider::OAuthProvider;
use crate::use_cases::ports::oauth_provider_registry::OAuthProviderRegistry;

/// Hands out the provider wired for each name: the real one, or the
/// same-origin fake when `OAUTH_PROVIDER_MODE=fake`.
///
/// `apps/api`'s registry also fails with `VALIDATION` ("Unknown OAuth
/// provider: …") for a name outside the union. Here the name is an enum, so
/// that case is refused where the string is parsed
/// (`OAuthProviderName::parse`), before a registry is ever asked.
pub struct StaticOAuthProviderRegistry {
    google: Arc<dyn OAuthProvider>,
    github: Arc<dyn OAuthProvider>,
}

impl StaticOAuthProviderRegistry {
    pub fn new(google: Arc<dyn OAuthProvider>, github: Arc<dyn OAuthProvider>) -> Self {
        Self { google, github }
    }
}

impl OAuthProviderRegistry for StaticOAuthProviderRegistry {
    fn get(&self, provider: OAuthProviderName) -> Arc<dyn OAuthProvider> {
        match provider {
            OAuthProviderName::Google => Arc::clone(&self.google),
            OAuthProviderName::Github => Arc::clone(&self.github),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::auth::fake_oauth_provider::FakeOAuthProvider;

    #[test]
    fn resolves_each_name_to_its_provider_instance() {
        let google: Arc<dyn OAuthProvider> =
            Arc::new(FakeOAuthProvider::new(OAuthProviderName::Google));
        let github: Arc<dyn OAuthProvider> =
            Arc::new(FakeOAuthProvider::new(OAuthProviderName::Github));
        let registry = StaticOAuthProviderRegistry::new(Arc::clone(&google), Arc::clone(&github));

        assert!(Arc::ptr_eq(&registry.get(OAuthProviderName::Google), &google));
        assert!(Arc::ptr_eq(&registry.get(OAuthProviderName::Github), &github));
    }
}
