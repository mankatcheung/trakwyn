use async_graphql::{Context, Enum, Object, Result, SimpleObject, ID};

use super::enums::InterviewRoundTypeEnum;
use super::support::{container, iso, require_user};
use crate::http::errors::GraphQLResultExt;
use crate::use_cases::calendar::{CalendarEvent, CalendarEventType, GetCalendarEventsInput};

#[derive(Enum, Debug, Clone, Copy, PartialEq, Eq)]
#[graphql(name = "CalendarEventType", rename_items = "camelCase")]
pub enum CalendarEventTypeEnum {
    Applied,
    FollowUp,
    Interview,
}

impl From<CalendarEventType> for CalendarEventTypeEnum {
    fn from(event_type: CalendarEventType) -> Self {
        match event_type {
            CalendarEventType::Applied => Self::Applied,
            CalendarEventType::FollowUp => Self::FollowUp,
            CalendarEventType::Interview => Self::Interview,
        }
    }
}

#[derive(SimpleObject)]
#[graphql(name = "CalendarEvent")]
pub struct CalendarEventObject {
    id: Option<ID>,
    application_id: Option<ID>,
    company: Option<String>,
    role: Option<String>,
    r#type: Option<CalendarEventTypeEnum>,
    date: Option<String>,
    interview_round_type: Option<InterviewRoundTypeEnum>,
}

impl From<CalendarEvent> for CalendarEventObject {
    fn from(event: CalendarEvent) -> Self {
        Self {
            id: Some(ID(event.id)),
            application_id: Some(ID(event.application_id)),
            company: Some(event.company),
            role: Some(event.role),
            r#type: Some(event.r#type.into()),
            date: Some(iso(event.date)),
            interview_round_type: event.interview_round_type.map(Into::into),
        }
    }
}

#[derive(Default)]
pub struct CalendarQuery;

#[Object]
impl CalendarQuery {
    async fn calendar_events(&self, ctx: &Context<'_>) -> Result<Option<Vec<CalendarEventObject>>> {
        let user = require_user(ctx)?;
        let events = container(ctx)
            .get_calendar_events_use_case()
            .execute(GetCalendarEventsInput { user_id: user.sub.clone() })
            .await
            .gql()?;
        Ok(Some(events.into_iter().map(CalendarEventObject::from).collect()))
    }
}
