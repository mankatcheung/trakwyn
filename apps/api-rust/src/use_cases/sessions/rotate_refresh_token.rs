use std::sync::Arc;

use chrono::TimeDelta;

use crate::domain::session::Session;
use crate::use_cases::clock::now;
use crate::use_cases::constants::session::{ROTATION_GRACE_MS, TTL_MS};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::{RotateRefreshTokenData, SessionRepository};

pub struct RotateRefreshTokenInput {
    pub session_id: String,
    /// The `jti` presented on the refresh token, or `None` for a legacy
    /// token from before rotation tracking.
    pub presented_token_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RotateRefreshTokenResult {
    pub session: Session,
    pub new_token_id: String,
}

pub struct RotateRefreshTokenUseCase {
    pub session_repository: Arc<dyn SessionRepository>,
    pub generate_id: GenerateId,
    pub logger: Arc<dyn Logger>,
}

fn unauthorized() -> DomainError {
    DomainError::unauthorized("Session revoked or expired")
}

impl RotateRefreshTokenUseCase {
    pub async fn execute(
        &self,
        input: RotateRefreshTokenInput,
    ) -> DomainResult<RotateRefreshTokenResult> {
        let session = self
            .session_repository
            .find_by_id(&input.session_id)
            .await?
            .filter(|session| session.revoked_at.is_none() && session.expires_at >= now())
            .ok_or_else(unauthorized)?;

        let expires_at = now() + TimeDelta::milliseconds(TTL_MS);
        let presented = input.presented_token_id;

        let Some(current) = session.current_refresh_token_id.clone() else {
            // The session predates rotation tracking: whatever is presented
            // is adopted as the new baseline, instead of forcing every
            // existing session to log out.
            let previous = presented.unwrap_or_else(|| (self.generate_id)());
            return self.rotate(session, previous, expires_at).await;
        };

        // An exact match on the current token: normal rotation.
        if presented.as_deref() == Some(current.as_str()) {
            return self.rotate(session, current, expires_at).await;
        }

        // A match on the just-superseded token within the grace window: a
        // benign concurrent-refresh race (two tabs, say). Tokens bound to the
        // still-current id are re-issued rather than rotating again, so both
        // tabs converge.
        if let (Some(previous), Some(previous_rotated_at)) =
            (session.previous_refresh_token_id.as_deref(), session.previous_rotated_at)
        {
            let since_rotation = now() - previous_rotated_at;
            if presented.as_deref() == Some(previous)
                && since_rotation < TimeDelta::milliseconds(ROTATION_GRACE_MS)
            {
                self.session_repository.touch(&session.id, expires_at).await?;
                return Ok(RotateRefreshTokenResult {
                    session: Session { expires_at, ..session },
                    new_token_id: current,
                });
            }
        }

        // Anything else is a stale or unknown token id: the refresh token has
        // already been superseded and is being reused, the classic signal
        // that it was stolen. The whole session is killed rather than the
        // one request rejected.
        self.session_repository.revoke(&session.id).await?;
        // The ids go in the message, not in fields: an error's context is
        // reduced to an allow-list before it is written (JEF-348).
        self.logger.error(
            &format!(
                "Refresh token reuse detected for session {} (user {})",
                session.id, session.user_id
            ),
            None,
            &[],
        );
        Err(unauthorized())
    }

    /// Makes a freshly minted id the current one and `previous` the
    /// superseded one.
    async fn rotate(
        &self,
        session: Session,
        previous: String,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> DomainResult<RotateRefreshTokenResult> {
        let new_token_id = (self.generate_id)();
        let previous_rotated_at = now();
        self.session_repository
            .rotate_refresh_token(
                &session.id,
                RotateRefreshTokenData {
                    current_refresh_token_id: new_token_id.clone(),
                    previous_refresh_token_id: previous.clone(),
                    previous_rotated_at,
                    expires_at,
                },
            )
            .await?;
        Ok(RotateRefreshTokenResult {
            session: Session {
                current_refresh_token_id: Some(new_token_id.clone()),
                previous_refresh_token_id: Some(previous),
                previous_rotated_at: Some(previous_rotated_at),
                expires_at,
                ..session
            },
            new_token_id,
        })
    }
}
