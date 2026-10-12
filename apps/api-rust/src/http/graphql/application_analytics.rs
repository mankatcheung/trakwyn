//! Read-only figures computed from a user's applications: the health score,
//! channel analytics, response times and the weekly goal.

use async_graphql::{Context, Object, Result, SimpleObject, ID};

use super::applications::int;
use super::enums::ApplicationStatusEnum;
use super::support::{container, iso, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::activity_logs::{
    GetResponseTimeAnalyticsInput, ResponseTimeAnalytics, StageDurationStat, TimeToResponseStat,
};
use crate::use_cases::applications::{
    ApplicationChannelAnalytics, ApplicationGroupStat, GetApplicationChannelAnalyticsInput,
    HealthScore,
};
use crate::use_cases::user::WeeklyApplicationGoalStats;

#[derive(SimpleObject)]
#[graphql(name = "HealthScoreCriterion")]
pub struct HealthScoreCriterionObject {
    key: Option<String>,
    label: Option<String>,
    points: Option<i32>,
    earned: Option<i32>,
    met: Option<bool>,
}

#[derive(SimpleObject)]
#[graphql(name = "ApplicationHealthScore")]
pub struct ApplicationHealthScoreObject {
    score: Option<i32>,
    label: Option<String>,
    criteria: Option<Vec<HealthScoreCriterionObject>>,
}

impl From<HealthScore> for ApplicationHealthScoreObject {
    fn from(score: HealthScore) -> Self {
        let criteria = score
            .criteria
            .into_iter()
            .map(|criterion| HealthScoreCriterionObject {
                key: Some(criterion.key.to_string()),
                label: Some(criterion.label.to_string()),
                points: Some(criterion.points),
                earned: Some(criterion.earned),
                met: Some(criterion.met),
            })
            .collect();
        Self {
            score: Some(score.score),
            label: Some(score.label.to_string()),
            criteria: Some(criteria),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "ApplicationGroupStat")]
pub struct ApplicationGroupStatObject {
    label: Option<String>,
    application_count: Option<i32>,
    responded_count: Option<i32>,
    response_rate: Option<i32>,
    offer_count: Option<i32>,
    offer_rate: Option<i32>,
}

impl From<ApplicationGroupStat> for ApplicationGroupStatObject {
    fn from(stat: ApplicationGroupStat) -> Self {
        Self {
            label: Some(stat.label),
            application_count: Some(int(stat.application_count)),
            responded_count: Some(int(stat.responded_count)),
            response_rate: Some(int(stat.response_rate)),
            offer_count: Some(int(stat.offer_count)),
            offer_rate: Some(int(stat.offer_rate)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "ApplicationChannelAnalytics")]
pub struct ApplicationChannelAnalyticsObject {
    by_source: Option<Vec<ApplicationGroupStatObject>>,
    by_tag: Option<Vec<ApplicationGroupStatObject>>,
}

impl From<ApplicationChannelAnalytics> for ApplicationChannelAnalyticsObject {
    fn from(analytics: ApplicationChannelAnalytics) -> Self {
        Self {
            by_source: Some(analytics.by_source.into_iter().map(Into::into).collect()),
            by_tag: Some(analytics.by_tag.into_iter().map(Into::into).collect()),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "StageDurationStat")]
pub struct StageDurationStatObject {
    status: Option<ApplicationStatusEnum>,
    average_days: Option<f64>,
    median_days: Option<f64>,
    sample_size: Option<i32>,
}

impl From<StageDurationStat> for StageDurationStatObject {
    fn from(stat: StageDurationStat) -> Self {
        Self {
            status: Some(stat.status.into()),
            average_days: stat.average_days,
            median_days: stat.median_days,
            sample_size: Some(int(stat.sample_size)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "TimeToResponseStat")]
pub struct TimeToResponseStatObject {
    average_days: Option<f64>,
    median_days: Option<f64>,
    sample_size: Option<i32>,
}

impl From<TimeToResponseStat> for TimeToResponseStatObject {
    fn from(stat: TimeToResponseStat) -> Self {
        Self {
            average_days: stat.average_days,
            median_days: stat.median_days,
            sample_size: Some(int(stat.sample_size)),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "ResponseTimeAnalytics")]
pub struct ResponseTimeAnalyticsObject {
    time_in_stage: Option<Vec<StageDurationStatObject>>,
    time_to_first_response: Option<TimeToResponseStatObject>,
}

impl From<ResponseTimeAnalytics> for ResponseTimeAnalyticsObject {
    fn from(analytics: ResponseTimeAnalytics) -> Self {
        Self {
            time_in_stage: Some(analytics.time_in_stage.into_iter().map(Into::into).collect()),
            time_to_first_response: Some(analytics.time_to_first_response.into()),
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "WeeklyApplicationGoal")]
pub struct WeeklyApplicationGoalObject {
    weekly_application_goal: Option<i32>,
    current_week_count: Option<i32>,
    current_week_start: Option<String>,
    streak_weeks: Option<i32>,
}

impl From<WeeklyApplicationGoalStats> for WeeklyApplicationGoalObject {
    fn from(stats: WeeklyApplicationGoalStats) -> Self {
        Self {
            weekly_application_goal: Some(stats.weekly_application_goal),
            current_week_count: Some(stats.current_week_count),
            current_week_start: Some(iso(stats.current_week_start)),
            streak_weeks: Some(stats.streak_weeks),
        }
    }
}

#[derive(Default)]
pub struct ApplicationAnalyticsQuery;

#[Object]
impl ApplicationAnalyticsQuery {
    async fn application_health_score(
        &self,
        ctx: &Context<'_>,
        application_id: ID,
    ) -> Result<Option<ApplicationHealthScoreObject>> {
        let user = require_user(ctx)?;
        let score = container(ctx)
            .compute_health_score_use_case()
            .execute(&application_id.0, &user.sub)
            .await
            .gql()?;
        Ok(Some(score.into()))
    }

    async fn application_channel_analytics(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<ApplicationChannelAnalyticsObject>> {
        let user = require_user(ctx)?;
        let analytics = container(ctx)
            .get_application_channel_analytics_use_case()
            .execute(GetApplicationChannelAnalyticsInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(analytics.into()))
    }

    async fn response_time_analytics(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<ResponseTimeAnalyticsObject>> {
        let user = require_user(ctx)?;
        let analytics = container(ctx)
            .get_response_time_analytics_use_case()
            .execute(GetResponseTimeAnalyticsInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(analytics.into()))
    }

    async fn weekly_application_goal(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Option<WeeklyApplicationGoalObject>> {
        let user = require_user(ctx)?;
        let stats =
            container(ctx).get_weekly_application_goal_use_case().execute(&user.sub).await.gql()?;
        Ok(Some(stats.into()))
    }
}
