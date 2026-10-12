use std::sync::Arc;

use super::*;
use crate::domain::oauth_account::{OAuthAccount, OAuthProviderName};
use crate::domain::user::User;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainResult, ErrorCode};
use crate::use_cases::ports::{MobileOAuthTokens, OAuthProfile};
use crate::use_cases::test_support::{
    sequential_ids, user_with_email, FakeMobileOAuthHandoffService, FakeOAuthAccountRepository,
    FakeOAuthProvider, FakeOAuthProviderRegistry, FakeUserRepository, OAuthExchange,
};

const CODE: &str = "auth-code";
const REDIRECT: &str = "https://api.example.com/auth/oauth/google/callback";
const VERIFIER: &str = "pkce-verifier";

fn profile(email: Option<&str>, email_verified: bool) -> OAuthProfile {
    OAuthProfile {
        provider_account_id: "google-123".to_string(),
        email: email.map(str::to_string),
        email_verified,
        name: Some("Ada Lovelace".to_string()),
    }
}

fn link(id: &str, user_id: &str, provider: OAuthProviderName) -> OAuthAccount {
    OAuthAccount {
        id: id.to_string(),
        user_id: user_id.to_string(),
        provider,
        provider_account_id: "google-123".to_string(),
        email: Some("ada@example.com".to_string()),
        created_at: now(),
    }
}

struct Fixture {
    users: Arc<FakeUserRepository>,
    accounts: Arc<FakeOAuthAccountRepository>,
    registry: Arc<FakeOAuthProviderRegistry>,
}

impl Fixture {
    fn new(users: Vec<User>, accounts: Vec<OAuthAccount>, profile: OAuthProfile) -> Self {
        Self {
            users: Arc::new(FakeUserRepository::with(users)),
            accounts: Arc::new(FakeOAuthAccountRepository::with(accounts)),
            registry: Arc::new(FakeOAuthProviderRegistry::new(
                FakeOAuthProvider::default().with_profile(CODE, profile),
                FakeOAuthProvider::default(),
            )),
        }
    }

    async fn login_or_signup(&self, code: &str) -> DomainResult<LoginOrSignupWithOAuthOutput> {
        LoginOrSignupWithOAuthUseCase {
            user_repository: self.users.clone(),
            oauth_account_repository: self.accounts.clone(),
            oauth_provider_registry: self.registry.clone(),
            generate_id: sequential_ids("id"),
        }
        .execute(LoginOrSignupWithOAuthInput {
            provider: OAuthProviderName::Google,
            code: code.to_string(),
            redirect_uri: REDIRECT.to_string(),
            code_verifier: VERIFIER.to_string(),
        })
        .await
    }

    async fn link(&self, user_id: &str) -> DomainResult<()> {
        LinkOAuthAccountUseCase {
            oauth_account_repository: self.accounts.clone(),
            oauth_provider_registry: self.registry.clone(),
            generate_id: sequential_ids("id"),
        }
        .execute(LinkOAuthAccountInput {
            user_id: user_id.to_string(),
            provider: OAuthProviderName::Google,
            code: CODE.to_string(),
            redirect_uri: REDIRECT.to_string(),
            code_verifier: VERIFIER.to_string(),
        })
        .await
    }

    async fn unlink(&self, user_id: &str, provider: OAuthProviderName) -> DomainResult<()> {
        UnlinkOAuthAccountUseCase {
            user_repository: self.users.clone(),
            oauth_account_repository: self.accounts.clone(),
        }
        .execute(UnlinkOAuthAccountInput { user_id: user_id.to_string(), provider })
        .await
    }
}

fn ada() -> User {
    user_with_email("user-1", "ada@example.com")
}

// ── LoginOrSignupWithOAuthUseCase ──

#[tokio::test]
async fn an_already_linked_identity_logs_its_user_in() {
    let fixture = Fixture::new(
        vec![ada()],
        vec![link("link-1", "user-1", OAuthProviderName::Google)],
        // Not even a verified email is needed once the identity is linked.
        profile(None, false),
    );

    let output = fixture.login_or_signup(CODE).await.unwrap();

    assert_eq!(output.user.id, "user-1");
    assert!(!output.is_new_user);
    assert_eq!(
        fixture.registry.google.exchanges(),
        vec![OAuthExchange {
            code: CODE.to_string(),
            redirect_uri: REDIRECT.to_string(),
            code_verifier: VERIFIER.to_string(),
        }]
    );
}

#[tokio::test]
async fn a_link_to_a_missing_user_is_not_found() {
    let fixture = Fixture::new(
        Vec::new(),
        vec![link("link-1", "gone", OAuthProviderName::Google)],
        profile(Some("ada@example.com"), true),
    );

    let err = fixture.login_or_signup(CODE).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::NotFound);
    assert_eq!(err.to_string(), "Linked account not found");
}

#[tokio::test]
async fn an_unverified_or_missing_email_cannot_create_an_account() {
    for profile in [profile(Some("ada@example.com"), false), profile(None, true)] {
        let fixture = Fixture::new(Vec::new(), Vec::new(), profile);

        let err = fixture.login_or_signup(CODE).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(
            err.to_string(),
            "Your provider did not share a verified email address, so an account cannot be created automatically."
        );
        assert!(fixture.users.all().is_empty());
    }
}

#[tokio::test]
async fn an_email_that_already_has_an_account_is_a_conflict_not_a_silent_link() {
    let fixture = Fixture::new(vec![ada()], Vec::new(), profile(Some("ada@example.com"), true));

    let err = fixture.login_or_signup(CODE).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Conflict);
    assert_eq!(
        err.to_string(),
        "An account with this email already exists. Log in and link this provider from account settings."
    );
    assert!(fixture.accounts.all().is_empty());
}

#[tokio::test]
async fn a_first_sign_in_creates_a_passwordless_verified_user_and_links_it() {
    let fixture = Fixture::new(Vec::new(), Vec::new(), profile(Some("ada@example.com"), true));

    let output = fixture.login_or_signup(CODE).await.unwrap();

    assert!(output.is_new_user);
    assert_eq!(output.user.id, "id-1");
    assert_eq!(output.user.email, "ada@example.com");
    assert_eq!(output.user.password_hash, None);
    assert_eq!(output.user.name.as_deref(), Some("Ada Lovelace"));
    assert!(output.user.email_verified_at.is_some());

    let accounts = fixture.accounts.all();
    assert_eq!(accounts.len(), 1);
    assert_eq!(accounts[0].id, "id-2");
    assert_eq!(accounts[0].user_id, "id-1");
    assert_eq!(accounts[0].provider, OAuthProviderName::Google);
    assert_eq!(accounts[0].provider_account_id, "google-123");
    assert_eq!(accounts[0].email.as_deref(), Some("ada@example.com"));
}

#[tokio::test]
async fn a_failed_code_exchange_is_reported() {
    let fixture = Fixture::new(Vec::new(), Vec::new(), profile(Some("ada@example.com"), true));

    let err = fixture.login_or_signup("unknown-code").await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::InternalError);
}

// ── LinkOAuthAccountUseCase ──

#[tokio::test]
async fn links_an_identity_nobody_holds() {
    let fixture = Fixture::new(vec![ada()], Vec::new(), profile(Some("work@example.com"), true));

    fixture.link("user-1").await.unwrap();

    let accounts = fixture.accounts.all();
    assert_eq!(accounts.len(), 1);
    assert_eq!(accounts[0].id, "id-1");
    assert_eq!(accounts[0].user_id, "user-1");
    assert_eq!(accounts[0].provider_account_id, "google-123");
    assert_eq!(accounts[0].email.as_deref(), Some("work@example.com"));
}

#[tokio::test]
async fn linking_twice_is_a_no_op() {
    let fixture = Fixture::new(
        vec![ada()],
        vec![link("link-1", "user-1", OAuthProviderName::Google)],
        profile(Some("ada@example.com"), true),
    );

    fixture.link("user-1").await.unwrap();

    assert_eq!(fixture.accounts.all().len(), 1);
}

#[tokio::test]
async fn an_identity_linked_to_someone_else_is_a_conflict() {
    let fixture = Fixture::new(
        vec![ada()],
        vec![link("link-1", "user-2", OAuthProviderName::Google)],
        profile(Some("ada@example.com"), true),
    );

    let err = fixture.link("user-1").await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Conflict);
    assert_eq!(err.to_string(), "This account is already linked to another user");
}

// ── ListLinkedOAuthAccountsUseCase ──

#[tokio::test]
async fn lists_only_the_users_links() {
    let fixture = Fixture::new(
        vec![ada()],
        vec![
            link("mine", "user-1", OAuthProviderName::Google),
            link("foreign", "user-2", OAuthProviderName::Github),
        ],
        profile(None, false),
    );

    let links =
        ListLinkedOAuthAccountsUseCase { oauth_account_repository: fixture.accounts.clone() }
            .execute("user-1")
            .await
            .unwrap();

    assert_eq!(links.len(), 1);
    assert_eq!(links[0].id, "mine");
}

// ── UnlinkOAuthAccountUseCase ──

#[tokio::test]
async fn unlinking_a_provider_that_is_not_linked_is_a_no_op() {
    let fixture = Fixture::new(
        vec![ada()],
        vec![link("link-1", "user-1", OAuthProviderName::Google)],
        profile(None, false),
    );

    fixture.unlink("user-1", OAuthProviderName::Github).await.unwrap();

    assert_eq!(fixture.accounts.all().len(), 1);
}

#[tokio::test]
async fn unlinks_when_a_password_remains() {
    let fixture = Fixture::new(
        vec![ada()],
        vec![link("link-1", "user-1", OAuthProviderName::Google)],
        profile(None, false),
    );

    fixture.unlink("user-1", OAuthProviderName::Google).await.unwrap();

    assert!(fixture.accounts.all().is_empty());
}

#[tokio::test]
async fn unlinks_when_another_provider_remains() {
    let fixture = Fixture::new(
        vec![User { password_hash: None, ..ada() }],
        vec![
            link("google", "user-1", OAuthProviderName::Google),
            link("github", "user-1", OAuthProviderName::Github),
        ],
        profile(None, false),
    );

    fixture.unlink("user-1", OAuthProviderName::Google).await.unwrap();

    let remaining: Vec<String> =
        fixture.accounts.all().into_iter().map(|account| account.id).collect();
    assert_eq!(remaining, vec!["github"]);
}

#[tokio::test]
async fn refuses_to_unlink_the_only_way_to_sign_in() {
    let fixture = Fixture::new(
        vec![User { password_hash: None, ..ada() }],
        vec![link("link-1", "user-1", OAuthProviderName::Google)],
        profile(None, false),
    );

    let err = fixture.unlink("user-1", OAuthProviderName::Google).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Validation);
    assert_eq!(err.to_string(), "Set a password before unlinking your only sign-in method");
    assert_eq!(fixture.accounts.all().len(), 1);
}

#[tokio::test]
async fn unlinking_for_a_missing_user_is_not_found() {
    let fixture = Fixture::new(
        Vec::new(),
        vec![link("link-1", "user-1", OAuthProviderName::Google)],
        profile(None, false),
    );

    let err = fixture.unlink("user-1", OAuthProviderName::Google).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::NotFound);
    assert_eq!(err.to_string(), "User not found");
}

// ── ExchangeMobileOAuthCodeUseCase ──

fn exchange() -> ExchangeMobileOAuthCodeUseCase {
    let tokens = MobileOAuthTokens {
        access_token: "access".to_string(),
        refresh_token: "refresh".to_string(),
    };
    ExchangeMobileOAuthCodeUseCase {
        mobile_oauth_handoff_service: Arc::new(
            FakeMobileOAuthHandoffService::default().with_code("handoff", VERIFIER, tokens),
        ),
    }
}

fn exchange_input(code: &str, code_verifier: &str) -> ExchangeMobileOAuthCodeInput {
    ExchangeMobileOAuthCodeInput {
        code: code.to_string(),
        code_verifier: code_verifier.to_string(),
    }
}

#[tokio::test]
async fn redeems_a_handoff_code_for_the_tokens_it_carries() {
    let tokens = exchange().execute(exchange_input("handoff", VERIFIER)).await.unwrap();

    assert_eq!(tokens.access_token, "access");
    assert_eq!(tokens.refresh_token, "refresh");
}

#[tokio::test]
async fn an_invalid_code_is_unauthorized_without_the_infrastructure_reason() {
    let err = exchange().execute(exchange_input("forged", VERIFIER)).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid or expired OAuth handoff code");
}

#[tokio::test]
async fn the_wrong_verifier_is_unauthorized() {
    let err = exchange().execute(exchange_input("handoff", "other")).await.unwrap_err();

    assert_eq!(err.code(), ErrorCode::Unauthorized);
    assert_eq!(err.to_string(), "Invalid or expired OAuth handoff code");
}
