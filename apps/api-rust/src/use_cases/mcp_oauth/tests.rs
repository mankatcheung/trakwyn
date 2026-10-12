use std::sync::Arc;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use chrono::{DateTime, TimeDelta, Utc};
use sha2::{Digest, Sha256};

use super::*;
use crate::domain::mcp_oauth::{
    McpOAuthAccessToken, McpOAuthAuthorizationCode, McpOAuthClient, McpOAuthCodeChallengeMethod,
    McpOAuthRefreshToken, McpOAuthScope,
};
use crate::domain::security_event::SecurityEventType;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::secret_token;
use crate::use_cases::test_support::{
    sequential_ids, FakeMcpOAuthAuthorizationCodeRepository, FakeMcpOAuthClientRepository,
    FakeMcpOAuthGrantRepository, FakeMcpOAuthRefreshTokenRepository, FakeMcpOAuthTokenRepository,
    FakeSecurityEventRepository,
};

const USER: &str = "user-1";
const CLIENT: &str = "trakwyn_mcp_client_abc";
const REDIRECT: &str = "http://localhost:6274/oauth/callback";
const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const RAW_CODE: &str = "trakwyn_mcp_code_0123456789abcdef";
const FAMILY: &str = "family-1";

fn ago(seconds: i64) -> DateTime<Utc> {
    now() - TimeDelta::seconds(seconds)
}

fn ahead(seconds: i64) -> DateTime<Utc> {
    now() + TimeDelta::seconds(seconds)
}

fn client(revoked: bool) -> McpOAuthClient {
    McpOAuthClient {
        id: CLIENT.to_string(),
        name: "Claude Desktop".to_string(),
        redirect_uris: vec![REDIRECT.to_string()],
        revoked_at: revoked.then(now),
        created_at: ago(60),
    }
}

fn code(expires_at: DateTime<Utc>, consumed: bool) -> McpOAuthAuthorizationCode {
    McpOAuthAuthorizationCode {
        id: "code-1".to_string(),
        code_hash: secret_token::hash(RAW_CODE),
        family_id: FAMILY.to_string(),
        client_id: CLIENT.to_string(),
        user_id: USER.to_string(),
        redirect_uri: REDIRECT.to_string(),
        scope: McpOAuthScope::Read,
        code_challenge: CHALLENGE.to_string(),
        code_challenge_method: McpOAuthCodeChallengeMethod::S256,
        expires_at,
        consumed_at: consumed.then(now),
        created_at: ago(30),
    }
}

fn refresh(
    raw: &str,
    used: bool,
    revoked: bool,
    expires_at: DateTime<Utc>,
) -> McpOAuthRefreshToken {
    McpOAuthRefreshToken {
        id: format!("refresh-{raw}"),
        token_hash: secret_token::hash(raw),
        family_id: FAMILY.to_string(),
        client_id: CLIENT.to_string(),
        user_id: USER.to_string(),
        scope: McpOAuthScope::Full,
        expires_at,
        used_at: used.then(now),
        revoked_at: revoked.then(now),
        created_at: ago(30),
    }
}

fn access(
    raw: &str,
    audience: &str,
    expires_at: DateTime<Utc>,
    revoked: bool,
) -> McpOAuthAccessToken {
    McpOAuthAccessToken {
        id: format!("access-{raw}"),
        user_id: USER.to_string(),
        client_id: CLIENT.to_string(),
        family_id: FAMILY.to_string(),
        token_hash: secret_token::hash(raw),
        scope: McpOAuthScope::Read,
        audience: audience.to_string(),
        expires_at,
        revoked_at: revoked.then(now),
        last_used_at: None,
        created_at: ago(30),
    }
}

/// Every fake, shared the way the real repositories are.
struct World {
    clients: Arc<FakeMcpOAuthClientRepository>,
    codes: Arc<FakeMcpOAuthAuthorizationCodeRepository>,
    refresh_tokens: Arc<FakeMcpOAuthRefreshTokenRepository>,
    access_tokens: Arc<FakeMcpOAuthTokenRepository>,
    events: Arc<FakeSecurityEventRepository>,
}

impl World {
    fn new(
        clients: Vec<McpOAuthClient>,
        codes: Vec<McpOAuthAuthorizationCode>,
        refresh_tokens: Vec<McpOAuthRefreshToken>,
        access_tokens: Vec<McpOAuthAccessToken>,
    ) -> Self {
        Self {
            clients: Arc::new(FakeMcpOAuthClientRepository::with(clients)),
            codes: Arc::new(FakeMcpOAuthAuthorizationCodeRepository::with(codes)),
            refresh_tokens: Arc::new(FakeMcpOAuthRefreshTokenRepository::with(refresh_tokens)),
            access_tokens: Arc::new(FakeMcpOAuthTokenRepository::with(access_tokens)),
            events: Arc::new(FakeSecurityEventRepository::default()),
        }
    }

    fn create_access(&self) -> CreateMcpOAuthAccessTokenUseCase {
        CreateMcpOAuthAccessTokenUseCase {
            mcp_oauth_token_repository: self.access_tokens.clone(),
            generate_id: sequential_ids("access"),
        }
    }

    fn create_refresh(&self) -> CreateMcpOAuthRefreshTokenUseCase {
        CreateMcpOAuthRefreshTokenUseCase {
            mcp_oauth_refresh_token_repository: self.refresh_tokens.clone(),
            generate_id: sequential_ids("refresh"),
        }
    }

    fn exchange(&self) -> ExchangeMcpOAuthAuthorizationCodeUseCase {
        ExchangeMcpOAuthAuthorizationCodeUseCase {
            mcp_oauth_authorization_code_repository: self.codes.clone(),
            mcp_oauth_client_repository: self.clients.clone(),
            mcp_oauth_token_repository: self.access_tokens.clone(),
            mcp_oauth_refresh_token_repository: self.refresh_tokens.clone(),
            create_mcp_oauth_access_token_use_case: self.create_access(),
            create_mcp_oauth_refresh_token_use_case: self.create_refresh(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("event"),
        }
    }

    fn rotate(&self) -> RotateMcpOAuthRefreshTokenUseCase {
        RotateMcpOAuthRefreshTokenUseCase {
            mcp_oauth_refresh_token_repository: self.refresh_tokens.clone(),
            mcp_oauth_token_repository: self.access_tokens.clone(),
            create_mcp_oauth_access_token_use_case: self.create_access(),
            create_mcp_oauth_refresh_token_use_case: self.create_refresh(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("event"),
        }
    }

    fn revoke(&self) -> RevokeMcpOAuthGrantUseCase {
        RevokeMcpOAuthGrantUseCase {
            mcp_oauth_token_repository: self.access_tokens.clone(),
            mcp_oauth_refresh_token_repository: self.refresh_tokens.clone(),
        }
    }

    fn revoke_for_user(&self) -> RevokeMcpOAuthGrantForUserUseCase {
        RevokeMcpOAuthGrantForUserUseCase {
            mcp_oauth_grant_repository: Arc::new(FakeMcpOAuthGrantRepository {
                clients: self.clients.clone(),
                codes: self.codes.clone(),
                refresh_tokens: self.refresh_tokens.clone(),
                access_tokens: self.access_tokens.clone(),
            }),
            mcp_oauth_token_repository: self.access_tokens.clone(),
            mcp_oauth_refresh_token_repository: self.refresh_tokens.clone(),
            security_event_repository: self.events.clone(),
            generate_id: sequential_ids("event"),
        }
    }

    fn validate(&self) -> ValidateMcpOAuthAccessTokenUseCase {
        ValidateMcpOAuthAccessTokenUseCase {
            mcp_oauth_token_repository: self.access_tokens.clone(),
        }
    }

    fn event_types(&self) -> Vec<SecurityEventType> {
        self.events.all().into_iter().map(|event| event.event_type).collect()
    }
}

fn exchange_input(verifier: &str) -> ExchangeMcpOAuthAuthorizationCodeInput {
    ExchangeMcpOAuthAuthorizationCodeInput {
        code: RAW_CODE.to_string(),
        client_id: CLIENT.to_string(),
        redirect_uri: REDIRECT.to_string(),
        code_verifier: verifier.to_string(),
    }
}

#[test]
fn the_fixture_challenge_is_the_s256_of_the_verifier() {
    assert_eq!(URL_SAFE_NO_PAD.encode(Sha256::digest(VERIFIER.as_bytes())), CHALLENGE);
}

mod register_client {
    use super::*;

    fn use_case(repository: &Arc<FakeMcpOAuthClientRepository>) -> RegisterMcpOAuthClientUseCase {
        RegisterMcpOAuthClientUseCase { mcp_oauth_client_repository: repository.clone() }
    }

    fn input(name: &str, uris: &[&str]) -> RegisterMcpOAuthClientInput {
        RegisterMcpOAuthClientInput {
            name: name.to_string(),
            redirect_uris: uris.iter().map(ToString::to_string).collect(),
        }
    }

    #[tokio::test]
    async fn registers_a_client_with_trimmed_name_and_deduplicated_uris() {
        let repository = Arc::new(FakeMcpOAuthClientRepository::default());

        let client = use_case(&repository)
            .execute(input(" Claude Desktop ", &[REDIRECT, &format!(" {REDIRECT} ")]))
            .await
            .unwrap();

        let body = client.id.strip_prefix("trakwyn_mcp_client_").unwrap();
        assert_eq!(body.len(), 32);
        assert!(body.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_eq!(client.name, "Claude Desktop");
        assert_eq!(client.redirect_uris, vec![REDIRECT.to_string()]);
        assert_eq!(repository.all(), vec![client]);
    }

    #[tokio::test]
    async fn accepts_https_and_every_loopback_host_over_http() {
        let repository = Arc::new(FakeMcpOAuthClientRepository::default());
        let uris = [
            "https://app.example.com/cb",
            "http://localhost:1/cb",
            "http://127.0.0.1:1/cb",
            "http://[::1]:1/cb",
        ];
        assert!(use_case(&repository).execute(input("c", &uris)).await.is_ok());
    }

    #[tokio::test]
    async fn rejects_plain_http_to_a_remote_host_and_other_schemes() {
        let repository = Arc::new(FakeMcpOAuthClientRepository::default());
        for uri in
            ["http://evil.example/callback", "myapp://cb", "not a url", "javascript:alert(1)"]
        {
            let err = use_case(&repository).execute(input("Bad", &[uri])).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::Validation, "{uri}");
            assert!(err.to_string().contains("redirect_uris"));
        }
        assert!(repository.all().is_empty());
    }

    #[tokio::test]
    async fn rejects_no_uris_and_a_bad_name() {
        let repository = Arc::new(FakeMcpOAuthClientRepository::default());
        assert!(use_case(&repository).execute(input("ok", &[])).await.is_err());
        assert!(use_case(&repository).execute(input("   ", &[REDIRECT])).await.is_err());
        assert!(use_case(&repository).execute(input(&"n".repeat(101), &[REDIRECT])).await.is_err());
        assert!(use_case(&repository).execute(input(&"n".repeat(100), &[REDIRECT])).await.is_ok());
    }
}

mod create_tokens {
    use super::*;

    #[tokio::test]
    async fn an_access_token_is_hashed_scoped_and_bound_to_the_resource() {
        let world = World::new(vec![], vec![], vec![], vec![]);

        let output = world
            .create_access()
            .execute(CreateMcpOAuthAccessTokenInput {
                user_id: USER.to_string(),
                client_id: CLIENT.to_string(),
                family_id: FAMILY.to_string(),
                scope: McpOAuthScope::Read,
            })
            .await
            .unwrap();

        assert_eq!(output.raw_token.len(), "trakwyn_mcp_".len() + 64);
        assert!(output.raw_token.starts_with("trakwyn_mcp_"));
        assert_eq!(output.token.token_hash, secret_token::hash(&output.raw_token));
        assert_eq!(output.token.audience, "/mcp");
        assert_eq!(output.token.family_id, FAMILY);
        let ttl = output.token.expires_at - now();
        assert!(ttl <= TimeDelta::hours(1) && ttl > TimeDelta::minutes(59));
    }

    #[tokio::test]
    async fn a_refresh_token_keeps_the_family_and_lives_thirty_days() {
        let world = World::new(vec![], vec![], vec![], vec![]);

        let output = world
            .create_refresh()
            .execute(CreateMcpOAuthRefreshTokenInput {
                user_id: USER.to_string(),
                client_id: CLIENT.to_string(),
                family_id: FAMILY.to_string(),
                scope: McpOAuthScope::Full,
            })
            .await
            .unwrap();

        assert!(output.raw_token.starts_with("trakwyn_mcp_refresh_"));
        assert_eq!(output.token.family_id, FAMILY);
        assert_eq!(output.token.token_hash, secret_token::hash(&output.raw_token));
        assert!(output.token.expires_at - now() > TimeDelta::days(29));
    }

    #[tokio::test]
    async fn an_authorization_code_mints_its_own_grant_id_and_requires_s256() {
        let world = World::new(vec![], vec![], vec![], vec![]);
        let use_case = CreateMcpOAuthAuthorizationCodeUseCase {
            mcp_oauth_authorization_code_repository: world.codes.clone(),
            generate_id: sequential_ids("id"),
        };

        let output = use_case
            .execute(CreateMcpOAuthAuthorizationCodeInput {
                client_id: CLIENT.to_string(),
                user_id: USER.to_string(),
                redirect_uri: REDIRECT.to_string(),
                scope: McpOAuthScope::Read,
                code_challenge: CHALLENGE.to_string(),
            })
            .await
            .unwrap();

        assert!(output.raw_code.starts_with("trakwyn_mcp_code_"));
        assert_eq!(output.code.code_hash, secret_token::hash(&output.raw_code));
        assert_eq!(output.code.id, "id-1");
        assert_eq!(output.code.family_id, "id-2");
        assert_eq!(output.code.code_challenge_method, McpOAuthCodeChallengeMethod::S256);
        let ttl = output.code.expires_at - now();
        assert!(ttl <= TimeDelta::minutes(5) && ttl > TimeDelta::minutes(4));
    }
}

mod exchange {
    use super::*;

    fn world(code: McpOAuthAuthorizationCode) -> World {
        World::new(vec![client(false)], vec![code], vec![], vec![])
    }

    #[tokio::test]
    async fn exchanges_a_valid_code_once_and_issues_both_tokens_in_the_grant() {
        let world = world(code(ahead(60), false));

        let output = world.exchange().execute(exchange_input(VERIFIER)).await.unwrap().unwrap();

        assert!(output.access_token.starts_with("trakwyn_mcp_"));
        assert!(output.refresh_token.starts_with("trakwyn_mcp_refresh_"));
        assert_eq!(output.token.family_id, FAMILY);
        assert_eq!(output.token.scope, McpOAuthScope::Read);
        assert_eq!(world.refresh_tokens.all()[0].family_id, FAMILY);
        assert!(world.codes.all()[0].consumed_at.is_some());
        assert!(world.event_types().is_empty());
    }

    #[tokio::test]
    async fn refuses_a_verifier_that_does_not_match_the_challenge() {
        let world = world(code(ahead(60), false));
        let wrong = "x".repeat(43);

        assert!(world.exchange().execute(exchange_input(&wrong)).await.unwrap().is_none());
        assert!(world.codes.all()[0].consumed_at.is_none());
    }

    #[tokio::test]
    async fn refuses_a_verifier_outside_the_rfc_7636_range() {
        let world = world(code(ahead(60), false));
        for verifier in ["short", &"a".repeat(129), &format!("{}!", "a".repeat(43))] {
            assert!(world.exchange().execute(exchange_input(verifier)).await.unwrap().is_none());
        }
    }

    #[tokio::test]
    async fn refuses_an_expired_code() {
        let world = world(code(ago(1), false));
        assert!(world.exchange().execute(exchange_input(VERIFIER)).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn refuses_a_different_redirect_uri_or_client() {
        let world = world(code(ahead(60), false));

        let mut input = exchange_input(VERIFIER);
        input.redirect_uri = "http://localhost:6274/other".to_string();
        assert!(world.exchange().execute(input).await.unwrap().is_none());

        let mut input = exchange_input(VERIFIER);
        input.client_id = "trakwyn_mcp_client_other".to_string();
        assert!(world.exchange().execute(input).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn refuses_a_revoked_client() {
        let world = World::new(vec![client(true)], vec![code(ahead(60), false)], vec![], vec![]);
        assert!(world.exchange().execute(exchange_input(VERIFIER)).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn refuses_a_credential_that_is_not_an_authorization_code() {
        let world = world(code(ahead(60), false));
        let mut input = exchange_input(VERIFIER);
        input.code = "trakwyn_mcp_refresh_abc".to_string();
        assert!(world.exchange().execute(input).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn revokes_the_whole_grant_when_a_consumed_code_is_replayed() {
        let world = World::new(
            vec![client(false)],
            vec![code(ahead(60), true)],
            vec![refresh("trakwyn_mcp_refresh_a", false, false, ahead(600))],
            vec![access("trakwyn_mcp_a", "/mcp", ahead(600), false)],
        );

        assert!(world.exchange().execute(exchange_input(VERIFIER)).await.unwrap().is_none());

        assert!(world.refresh_tokens.all()[0].revoked_at.is_some());
        assert!(world.access_tokens.all()[0].revoked_at.is_some());
        assert_eq!(world.event_types(), vec![SecurityEventType::McpOauthCodeReuseDetected]);
        assert_eq!(world.events.all()[0].user_id, USER);
    }

    #[tokio::test]
    async fn a_second_exchange_of_the_same_code_revokes_what_the_first_produced() {
        let world = world(code(ahead(60), false));
        let first = world.exchange().execute(exchange_input(VERIFIER)).await.unwrap().unwrap();

        assert!(world.exchange().execute(exchange_input(VERIFIER)).await.unwrap().is_none());

        let hash = secret_token::hash(&first.access_token);
        let stored = world.access_tokens.all().into_iter().find(|t| t.token_hash == hash).unwrap();
        assert!(stored.revoked_at.is_some());
        assert!(world.refresh_tokens.all()[0].revoked_at.is_some());
    }
}

mod rotate {
    use super::*;

    const RAW: &str = "trakwyn_mcp_refresh_current";

    fn input(token: &str, client: &str) -> RotateMcpOAuthRefreshTokenInput {
        RotateMcpOAuthRefreshTokenInput {
            refresh_token: token.to_string(),
            client_id: client.to_string(),
        }
    }

    fn world(token: McpOAuthRefreshToken) -> World {
        World::new(
            vec![client(false)],
            vec![],
            vec![token],
            vec![access("trakwyn_mcp_live", "/mcp", ahead(600), false)],
        )
    }

    #[tokio::test]
    async fn rotates_a_valid_token_and_keeps_its_family_and_scope() {
        let world = world(refresh(RAW, false, false, ahead(600)));

        let output = world.rotate().execute(input(RAW, CLIENT)).await.unwrap().unwrap();

        assert_eq!(output.user_id, USER);
        assert!(output.refresh_token.starts_with("trakwyn_mcp_refresh_"));
        let tokens = world.refresh_tokens.all();
        assert!(tokens[0].used_at.is_some());
        assert_eq!(tokens[1].family_id, FAMILY);
        assert_eq!(tokens[1].scope, McpOAuthScope::Full);
        let issued = world.access_tokens.all().pop().unwrap();
        assert_eq!(issued.family_id, FAMILY);
        assert_eq!(output.access_token_expires_at, issued.expires_at);
    }

    #[tokio::test]
    async fn burns_the_family_and_records_reuse_when_a_rotated_token_returns() {
        let world = world(refresh(RAW, true, false, ahead(600)));

        assert!(world.rotate().execute(input(RAW, CLIENT)).await.unwrap().is_none());

        assert!(world.refresh_tokens.all()[0].revoked_at.is_some());
        // The access token already issued from the family dies with it.
        assert!(world.access_tokens.all()[0].revoked_at.is_some());
        assert_eq!(world.event_types(), vec![SecurityEventType::McpOauthRefreshReuseDetected]);
    }

    #[tokio::test]
    async fn refuses_another_client_an_expired_token_and_a_revoked_family() {
        let live = world(refresh(RAW, false, false, ahead(600)));
        assert!(live.rotate().execute(input(RAW, "other")).await.unwrap().is_none());

        let expired = world(refresh(RAW, false, false, ago(1)));
        assert!(expired.rotate().execute(input(RAW, CLIENT)).await.unwrap().is_none());

        let revoked = world(refresh(RAW, false, true, ahead(600)));
        assert!(revoked.rotate().execute(input(RAW, CLIENT)).await.unwrap().is_none());
        assert!(revoked.event_types().is_empty());
    }

    #[tokio::test]
    async fn refuses_an_unknown_token_and_one_that_is_not_a_refresh_token() {
        let world = world(refresh(RAW, false, false, ahead(600)));
        assert!(world
            .rotate()
            .execute(input("trakwyn_mcp_refresh_nope", CLIENT))
            .await
            .unwrap()
            .is_none());
        assert!(world.rotate().execute(input("trakwyn_mcp_live", CLIENT)).await.unwrap().is_none());
    }
}

mod validate {
    use super::*;

    const RAW: &str = "trakwyn_mcp_validtoken";

    async fn run(
        token: McpOAuthAccessToken,
        raw: &str,
    ) -> (World, Option<ValidateMcpOAuthAccessTokenResult>) {
        let world = World::new(vec![], vec![], vec![], vec![token]);
        let result = world.validate().execute(raw).await.unwrap();
        (world, result)
    }

    #[tokio::test]
    async fn returns_the_subject_and_scope_and_stamps_last_used() {
        let (world, result) = run(access(RAW, "/mcp", ahead(60), false), RAW).await;
        assert_eq!(
            result,
            Some(ValidateMcpOAuthAccessTokenResult {
                sub: USER.to_string(),
                scope: McpOAuthScope::Read
            })
        );
        assert!(world.access_tokens.all()[0].last_used_at.is_some());
    }

    #[tokio::test]
    async fn refuses_expired_revoked_and_wrong_audience_tokens() {
        for token in [
            access(RAW, "/mcp", ago(1), false),
            access(RAW, "/mcp", ahead(60), true),
            access(RAW, "/other", ahead(60), false),
        ] {
            let (world, result) = run(token, RAW).await;
            assert_eq!(result, None);
            assert!(world.access_tokens.all()[0].last_used_at.is_none());
        }
    }

    #[tokio::test]
    async fn refuses_a_credential_without_the_prefix_and_an_unknown_one() {
        let (_, result) = run(access(RAW, "/mcp", ahead(60), false), "trakwyn_abc").await;
        assert_eq!(result, None);
        let (_, result) = run(access(RAW, "/mcp", ahead(60), false), "trakwyn_mcp_unknown").await;
        assert_eq!(result, None);
    }
}

mod revoke {
    use super::*;

    fn world() -> World {
        World::new(
            vec![client(false)],
            vec![code(ahead(60), true)],
            vec![refresh("trakwyn_mcp_refresh_r", false, false, ahead(600))],
            vec![access("trakwyn_mcp_a", "/mcp", ahead(600), false)],
        )
    }

    #[tokio::test]
    async fn an_access_token_revokes_the_whole_grant() {
        let world = world();
        assert_eq!(world.revoke().execute("trakwyn_mcp_a").await.unwrap().as_deref(), Some(USER));
        assert!(world.access_tokens.all()[0].revoked_at.is_some());
        assert!(world.refresh_tokens.all()[0].revoked_at.is_some());
    }

    #[tokio::test]
    async fn a_refresh_token_revokes_the_whole_grant() {
        let world = world();
        let owner = world.revoke().execute("trakwyn_mcp_refresh_r").await.unwrap();
        assert_eq!(owner.as_deref(), Some(USER));
        assert!(world.access_tokens.all()[0].revoked_at.is_some());
        assert!(world.refresh_tokens.all()[0].revoked_at.is_some());
    }

    #[tokio::test]
    async fn an_unknown_or_foreign_credential_revokes_nothing() {
        let world = world();
        for raw in ["trakwyn_mcp_unknown", "trakwyn_mcp_refresh_unknown", "trakwyn_abc", ""] {
            assert_eq!(world.revoke().execute(raw).await.unwrap(), None);
        }
        assert!(world.access_tokens.all()[0].revoked_at.is_none());
    }

    #[tokio::test]
    async fn the_owner_revokes_their_grant_and_the_event_is_recorded() {
        let world = world();
        assert!(world.revoke_for_user().execute(USER, FAMILY).await.unwrap());
        assert!(world.access_tokens.all()[0].revoked_at.is_some());
        assert!(world.refresh_tokens.all()[0].revoked_at.is_some());
        assert_eq!(world.event_types(), vec![SecurityEventType::McpOauthTokenRevoked]);
    }

    #[tokio::test]
    async fn another_user_or_an_unknown_grant_revokes_nothing() {
        let world = world();
        assert!(!world.revoke_for_user().execute("someone-else", FAMILY).await.unwrap());
        assert!(!world.revoke_for_user().execute(USER, "no-such-grant").await.unwrap());
        assert!(world.access_tokens.all()[0].revoked_at.is_none());
        assert!(world.event_types().is_empty());
    }

    #[tokio::test]
    async fn a_revoked_grant_is_gone_from_the_list_and_cannot_be_revoked_again() {
        let world = world();
        let list = ListMcpOAuthGrantsUseCase {
            mcp_oauth_grant_repository: Arc::new(FakeMcpOAuthGrantRepository {
                clients: world.clients.clone(),
                codes: world.codes.clone(),
                refresh_tokens: world.refresh_tokens.clone(),
                access_tokens: world.access_tokens.clone(),
            }),
        };
        assert_eq!(list.execute(USER).await.unwrap().len(), 1);
        assert!(list.execute("someone-else").await.unwrap().is_empty());

        world.revoke_for_user().execute(USER, FAMILY).await.unwrap();

        assert!(list.execute(USER).await.unwrap().is_empty());
        assert!(!world.revoke_for_user().execute(USER, FAMILY).await.unwrap());
    }
}
