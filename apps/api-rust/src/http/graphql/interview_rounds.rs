use async_graphql::{Context, InputObject, MaybeUndefined, Object, Result, SimpleObject, ID};
use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};

use super::contacts::patch;
use super::enums::{InterviewRoundOutcomeEnum, InterviewRoundTypeEnum};
use super::support::{container, iso, require_user};
use crate::domain::interview_round::InterviewRound;
use crate::http::errors::{to_graphql_error, GraphQLResultExt};
use crate::use_cases::errors::DomainError;
use crate::use_cases::interview_rounds::{
    CreateInterviewRoundInput as CreateInput, DeleteInterviewRoundInput,
    GetInterviewRoundAnalyticsInput, GetInterviewRoundsInput, InterviewRoundAnalytics,
    InterviewRoundTypeStat, RoundsToTerminalStat, UpdateInterviewRoundInput as UpdateInput,
};

/// The date-time layouts without an offset that `new Date(text)` accepts; it
/// reads them in the server's zone, which is UTC wherever this runs.
const LOCAL_DATE_TIME_FORMATS: [&str; 2] = ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"];
const DATE_FORMAT: &str = "%Y-%m-%d";

/// A client timestamp, read the way the original's `new Date(text)` reads the
/// ISO 8601 forms clients send: a full timestamp, one without an offset, or a
/// bare date (UTC midnight).
fn parse_timestamp(text: &str) -> Option<DateTime<Utc>> {
    if let Ok(timestamp) = DateTime::parse_from_rfc3339(text) {
        return Some(timestamp.with_timezone(&Utc));
    }
    if let Some(timestamp) = LOCAL_DATE_TIME_FORMATS
        .iter()
        .find_map(|format| NaiveDateTime::parse_from_str(text, format).ok())
    {
        return Some(timestamp.and_utc());
    }
    let date = NaiveDate::parse_from_str(text, DATE_FORMAT).ok()?;
    Some(date.and_hms_opt(0, 0, 0)?.and_utc())
}

/// The original hands an unparseable string to the database driver as an
/// invalid `Date`, which throws: the client sees an internal error.
fn timestamp(text: &str) -> Result<DateTime<Utc>> {
    parse_timestamp(text)
        .ok_or_else(|| to_graphql_error(DomainError::internal("Invalid time value")))
}

/// On create, an empty or `null` timestamp is simply not set.
fn timestamp_on_create(text: Option<String>) -> Result<Option<DateTime<Utc>>> {
    text.filter(|text| !text.is_empty()).map(|text| timestamp(&text)).transpose()
}

/// On update, a timestamp left out is not written, while `null` and the empty
/// string both clear it.
fn timestamp_on_update(text: MaybeUndefined<String>) -> Result<Option<Option<DateTime<Utc>>>> {
    Ok(match text {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(text) if text.is_empty() => Some(None),
        MaybeUndefined::Value(text) => Some(Some(timestamp(&text)?)),
    })
}

#[derive(SimpleObject)]
#[graphql(name = "InterviewRound")]
pub struct InterviewRoundObject {
    id: Option<ID>,
    application_id: Option<ID>,
    r#type: Option<InterviewRoundTypeEnum>,
    scheduled_at: Option<String>,
    completed_at: Option<String>,
    interviewer_name: Option<String>,
    notes: Option<String>,
    outcome: Option<InterviewRoundOutcomeEnum>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

impl From<InterviewRound> for InterviewRoundObject {
    fn from(round: InterviewRound) -> Self {
        Self {
            id: Some(ID(round.id)),
            application_id: Some(ID(round.application_id)),
            r#type: Some(round.r#type.into()),
            scheduled_at: round.scheduled_at.map(iso),
            completed_at: round.completed_at.map(iso),
            interviewer_name: round.interviewer_name,
            notes: round.notes,
            outcome: Some(round.outcome.into()),
            created_at: Some(iso(round.created_at)),
            updated_at: Some(iso(round.updated_at)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "InterviewRoundTypeStat")]
pub struct InterviewRoundTypeStatObject {
    r#type: Option<InterviewRoundTypeEnum>,
    passed: Option<i32>,
    failed: Option<i32>,
    pending: Option<i32>,
    cancelled: Option<i32>,
}

impl From<InterviewRoundTypeStat> for InterviewRoundTypeStatObject {
    fn from(stat: InterviewRoundTypeStat) -> Self {
        Self {
            r#type: Some(stat.r#type.into()),
            passed: Some(stat.passed),
            failed: Some(stat.failed),
            pending: Some(stat.pending),
            cancelled: Some(stat.cancelled),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "RoundsToTerminalStat")]
pub struct RoundsToTerminalStatObject {
    average: Option<f64>,
    median: Option<f64>,
    sample_size: Option<i32>,
}

impl From<RoundsToTerminalStat> for RoundsToTerminalStatObject {
    fn from(stat: RoundsToTerminalStat) -> Self {
        Self { average: stat.average, median: stat.median, sample_size: Some(stat.sample_size) }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "InterviewRoundAnalytics")]
pub struct InterviewRoundAnalyticsObject {
    by_type: Option<Vec<InterviewRoundTypeStatObject>>,
    rounds_to_offer: Option<RoundsToTerminalStatObject>,
    rounds_to_rejection: Option<RoundsToTerminalStatObject>,
}

impl From<InterviewRoundAnalytics> for InterviewRoundAnalyticsObject {
    fn from(analytics: InterviewRoundAnalytics) -> Self {
        Self {
            by_type: Some(analytics.by_type.into_iter().map(Into::into).collect()),
            rounds_to_offer: Some(analytics.rounds_to_offer.into()),
            rounds_to_rejection: Some(analytics.rounds_to_rejection.into()),
        }
    }
}

#[derive(InputObject)]
#[graphql(name = "CreateInterviewRoundInput")]
pub struct CreateInterviewRoundInputObject {
    application_id: ID,
    r#type: Option<InterviewRoundTypeEnum>,
    scheduled_at: Option<String>,
    completed_at: Option<String>,
    interviewer_name: Option<String>,
    notes: Option<String>,
    outcome: Option<InterviewRoundOutcomeEnum>,
}

#[derive(InputObject)]
#[graphql(name = "UpdateInterviewRoundInput")]
pub struct UpdateInterviewRoundInputObject {
    r#type: Option<InterviewRoundTypeEnum>,
    scheduled_at: MaybeUndefined<String>,
    completed_at: MaybeUndefined<String>,
    interviewer_name: MaybeUndefined<String>,
    notes: MaybeUndefined<String>,
    outcome: Option<InterviewRoundOutcomeEnum>,
}

#[derive(Default)]
pub struct InterviewRoundsQuery;

#[Object]
impl InterviewRoundsQuery {
    async fn interview_rounds(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<Vec<InterviewRoundObject>>> {
        let user = require_user(ctx)?;
        let rounds = container(ctx)
            .get_interview_rounds_use_case()
            .execute(GetInterviewRoundsInput {
                user_id: user.sub.clone(),
                application_id: application_id.0,
            })
            .await
            .gql()?;
        Ok(Some(rounds.into_iter().map(InterviewRoundObject::from).collect()))
    }

    async fn interview_round_analytics(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<InterviewRoundAnalyticsObject>> {
        let user = require_user(ctx)?;
        let analytics = container(ctx)
            .get_interview_round_analytics_use_case()
            .execute(GetInterviewRoundAnalyticsInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(analytics.into()))
    }
}

#[derive(Default)]
pub struct InterviewRoundsMutation;

#[Object]
impl InterviewRoundsMutation {
    async fn create_interview_round(
        &self,
        ctx: &Context<'_>,
        input: CreateInterviewRoundInputObject,
    ) -> Result<Option<InterviewRoundObject>> {
        let user = require_user(ctx)?;
        let round = container(ctx)
            .create_interview_round_use_case()
            .execute(CreateInput {
                user_id: user.sub.clone(),
                application_id: input.application_id.0,
                r#type: input.r#type.map(Into::into),
                scheduled_at: timestamp_on_create(input.scheduled_at)?,
                completed_at: timestamp_on_create(input.completed_at)?,
                interviewer_name: input.interviewer_name,
                notes: input.notes,
                outcome: input.outcome.map(Into::into),
            })
            .await
            .gql()?;
        Ok(Some(round.into()))
    }

    async fn update_interview_round(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: UpdateInterviewRoundInputObject,
    ) -> Result<Option<InterviewRoundObject>> {
        let user = require_user(ctx)?;
        let round = container(ctx)
            .update_interview_round_use_case()
            .execute(UpdateInput {
                user_id: user.sub.clone(),
                round_id: id.0,
                r#type: input.r#type.map(Into::into),
                scheduled_at: timestamp_on_update(input.scheduled_at)?,
                completed_at: timestamp_on_update(input.completed_at)?,
                interviewer_name: patch(input.interviewer_name),
                notes: patch(input.notes),
                outcome: input.outcome.map(Into::into),
            })
            .await
            .gql()?;
        Ok(Some(round.into()))
    }

    async fn delete_interview_round(&self, ctx: &Context<'_>, id: ID) -> Result<Option<bool>> {
        let user = require_user(ctx)?;
        container(ctx)
            .delete_interview_round_use_case()
            .execute(DeleteInterviewRoundInput { user_id: user.sub.clone(), round_id: id.0 })
            .await
            .gql()?;
        Ok(Some(true))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(text: &str) -> Option<String> {
        parse_timestamp(text).map(iso)
    }

    #[test]
    fn reads_the_iso_forms_a_client_sends() {
        let expected = Some("2026-01-31T09:30:00.000Z".to_string());
        assert_eq!(parsed("2026-01-31T09:30:00.000Z"), expected);
        assert_eq!(parsed("2026-01-31T09:30:00Z"), expected);
        assert_eq!(parsed("2026-01-31T10:30:00+01:00"), expected);
        assert_eq!(parsed("2026-01-31T09:30:00"), expected);
        assert_eq!(parsed("2026-01-31T09:30"), expected);
        assert_eq!(parsed("2026-01-31"), Some("2026-01-31T00:00:00.000Z".to_string()));
    }

    #[test]
    fn refuses_what_is_not_a_timestamp() {
        assert_eq!(parsed("next tuesday"), None);
        assert_eq!(parsed(" "), None);
        assert_eq!(parsed("2026-13-40"), None);
    }

    #[test]
    fn an_empty_timestamp_is_unset_on_create_and_cleared_on_update() {
        assert_eq!(timestamp_on_create(Some(String::new())).unwrap(), None);
        assert_eq!(timestamp_on_create(None).unwrap(), None);
        assert_eq!(timestamp_on_update(MaybeUndefined::Value(String::new())).unwrap(), Some(None));
        assert_eq!(timestamp_on_update(MaybeUndefined::Null).unwrap(), Some(None));
        assert_eq!(timestamp_on_update(MaybeUndefined::Undefined).unwrap(), None);
        assert!(timestamp_on_update(MaybeUndefined::Value("soon".to_string())).is_err());
    }
}
