//! Domain entities and use-case outputs as the objects `JSON.stringify`
//! sees in `apps/api`, field for field in the interface's order. Dates stay
//! dates (`ToolJson::Date`): the chat shortens them, MCP prints them whole.

use super::tool_json::{iso, ToolJson};
use crate::domain::activity_log::ActivityLog;
use crate::domain::application::Application;
use crate::domain::contact::Contact;
use crate::domain::document::Document;
use crate::domain::education::Education;
use crate::domain::interview_round::InterviewRound;
use crate::domain::note::Note;
use crate::domain::offer::Offer;
use crate::domain::skill::Skill;
use crate::domain::work_experience::WorkExperience;
use crate::use_cases::activity_logs::ResponseTimeAnalytics;
use crate::use_cases::applications::{ApplicationChannelAnalytics, ApplicationGroupStat};
use crate::use_cases::calendar::{CalendarEvent, CalendarEventType};
use crate::use_cases::interview_rounds::{InterviewRoundAnalytics, RoundsToTerminalStat};
use crate::use_cases::offers::OfferAnalytics;

use ToolJson as J;

pub fn application(app: &Application) -> J {
    J::object(vec![
        ("id", J::str(&app.id)),
        ("userId", J::str(&app.user_id)),
        ("company", J::str(&app.company)),
        ("role", J::str(&app.role)),
        ("status", J::str(app.status.as_str())),
        ("jobUrl", J::opt_str(&app.job_url)),
        ("location", J::opt_str(&app.location)),
        ("salaryRange", J::opt_str(&app.salary_range)),
        ("description", J::opt_str(&app.description)),
        ("appliedAt", J::opt_date(&app.applied_at)),
        ("starred", J::Bool(app.starred)),
        ("source", J::opt_str(&app.source)),
        ("followUpAt", J::opt_date(&app.follow_up_at)),
        ("tags", J::array(app.tags.iter().map(J::str))),
        ("reminderSentAt", J::opt_date(&app.reminder_sent_at)),
        ("boardPosition", J::int(app.board_position)),
        ("deletedAt", J::opt_date(&app.deleted_at)),
        ("createdAt", J::Date(app.created_at)),
        ("updatedAt", J::Date(app.updated_at)),
    ])
}

pub fn note(note: &Note) -> J {
    J::object(vec![
        ("id", J::str(&note.id)),
        ("applicationId", J::str(&note.application_id)),
        ("content", J::str(&note.content)),
        ("createdAt", J::Date(note.created_at)),
        ("updatedAt", J::Date(note.updated_at)),
    ])
}

pub fn contact(contact: &Contact) -> J {
    J::object(vec![
        ("id", J::str(&contact.id)),
        ("applicationId", J::str(&contact.application_id)),
        ("name", J::str(&contact.name)),
        ("role", J::opt_str(&contact.role)),
        ("email", J::opt_str(&contact.email)),
        ("phone", J::opt_str(&contact.phone)),
        ("linkedinUrl", J::opt_str(&contact.linkedin_url)),
        ("notes", J::opt_str(&contact.notes)),
        ("createdAt", J::Date(contact.created_at)),
        ("updatedAt", J::Date(contact.updated_at)),
    ])
}

pub fn interview_round(round: &InterviewRound) -> J {
    J::object(vec![
        ("id", J::str(&round.id)),
        ("applicationId", J::str(&round.application_id)),
        ("type", J::str(round.r#type.as_str())),
        ("scheduledAt", J::opt_date(&round.scheduled_at)),
        ("completedAt", J::opt_date(&round.completed_at)),
        ("interviewerName", J::opt_str(&round.interviewer_name)),
        ("notes", J::opt_str(&round.notes)),
        ("outcome", J::str(round.outcome.as_str())),
        ("pushNotificationSentAt", J::opt_date(&round.push_notification_sent_at)),
        ("createdAt", J::Date(round.created_at)),
        ("updatedAt", J::Date(round.updated_at)),
    ])
}

pub fn work_experience(item: &WorkExperience) -> J {
    J::object(vec![
        ("id", J::str(&item.id)),
        ("userId", J::str(&item.user_id)),
        ("company", J::str(&item.company)),
        ("title", J::str(&item.title)),
        ("location", J::opt_str(&item.location)),
        ("startDate", J::Date(item.start_date)),
        ("endDate", J::opt_date(&item.end_date)),
        ("description", J::opt_str(&item.description)),
        ("createdAt", J::Date(item.created_at)),
        ("updatedAt", J::Date(item.updated_at)),
    ])
}

pub fn education(item: &Education) -> J {
    J::object(vec![
        ("id", J::str(&item.id)),
        ("userId", J::str(&item.user_id)),
        ("institution", J::str(&item.institution)),
        ("degree", J::opt_str(&item.degree)),
        ("field", J::opt_str(&item.field)),
        ("startDate", J::Date(item.start_date)),
        ("endDate", J::opt_date(&item.end_date)),
        ("description", J::opt_str(&item.description)),
        ("createdAt", J::Date(item.created_at)),
        ("updatedAt", J::Date(item.updated_at)),
    ])
}

pub fn skill(item: &Skill) -> J {
    J::object(vec![
        ("id", J::str(&item.id)),
        ("userId", J::str(&item.user_id)),
        ("name", J::str(&item.name)),
        ("category", J::opt_str(&item.category)),
        ("proficiency", J::opt_str(&item.proficiency)),
        ("createdAt", J::Date(item.created_at)),
    ])
}

pub fn document(item: &Document) -> J {
    J::object(vec![
        ("id", J::str(&item.id)),
        ("applicationId", J::str(&item.application_id)),
        ("name", J::str(&item.name)),
        ("mimeType", J::str(&item.mime_type)),
        ("sizeBytes", J::int(item.size_bytes)),
        ("storageKey", J::str(&item.storage_key)),
        ("documentType", J::str(&item.document_type)),
        ("version", J::opt_str(&item.version)),
        ("sourceDraftId", J::opt_str(&item.source_draft_id)),
        ("createdAt", J::Date(item.created_at)),
    ])
}

fn opt_int(value: Option<i64>) -> J {
    value.map_or(J::Null, J::int)
}

pub fn offer(item: &Offer) -> J {
    J::object(vec![
        ("id", J::str(&item.id)),
        ("applicationId", J::str(&item.application_id)),
        ("baseSalary", J::int(item.base_salary)),
        ("bonus", opt_int(item.bonus)),
        ("equity", J::opt_str(&item.equity)),
        ("benefits", J::opt_str(&item.benefits)),
        ("costOfLivingAdjustment", opt_int(item.cost_of_living_adjustment)),
        ("currency", J::str(&item.currency)),
        ("period", J::str(item.period.as_str())),
        ("notes", J::opt_str(&item.notes)),
        ("createdAt", J::Date(item.created_at)),
        ("updatedAt", J::Date(item.updated_at)),
    ])
}

pub fn activity_log(item: &ActivityLog) -> J {
    J::object(vec![
        ("id", J::str(&item.id)),
        ("applicationId", J::str(&item.application_id)),
        ("actorId", J::str(&item.actor_id)),
        ("eventType", J::str(item.event_type.as_str())),
        ("payload", J::str(&item.payload)),
        ("createdAt", J::Date(item.created_at)),
    ])
}

pub fn calendar_event(event: &CalendarEvent) -> J {
    let kind = match event.r#type {
        CalendarEventType::Applied => "applied",
        CalendarEventType::FollowUp => "followUp",
        CalendarEventType::Interview => "interview",
    };
    let mut fields = vec![
        ("id", J::str(&event.id)),
        ("applicationId", J::str(&event.application_id)),
        ("company", J::str(&event.company)),
        ("role", J::str(&event.role)),
        ("type", J::str(kind)),
        ("date", J::Date(event.date)),
    ];
    // `undefined` in the original, so absent rather than null.
    if let Some(round_type) = event.interview_round_type {
        fields.push(("interviewRoundType", J::str(round_type.as_str())));
    }
    J::object(fields)
}

fn list<T>(items: &[T], map: fn(&T) -> J) -> J {
    J::array(items.iter().map(map))
}

pub fn applications(items: &[Application]) -> J {
    list(items, application)
}
pub fn notes(items: &[Note]) -> J {
    list(items, note)
}
pub fn contacts(items: &[Contact]) -> J {
    list(items, contact)
}
pub fn interview_rounds(items: &[InterviewRound]) -> J {
    list(items, interview_round)
}
pub fn work_experiences(items: &[WorkExperience]) -> J {
    list(items, work_experience)
}
pub fn educations(items: &[Education]) -> J {
    list(items, education)
}
pub fn skills(items: &[Skill]) -> J {
    list(items, skill)
}
pub fn documents(items: &[Document]) -> J {
    list(items, document)
}
pub fn offers(items: &[Offer]) -> J {
    list(items, offer)
}
pub fn activity_logs(items: &[ActivityLog]) -> J {
    list(items, activity_log)
}
pub fn calendar_events(items: &[CalendarEvent]) -> J {
    list(items, calendar_event)
}

fn group_stat(stat: &ApplicationGroupStat) -> J {
    J::object(vec![
        ("label", J::str(&stat.label)),
        ("applicationCount", J::int(stat.application_count as i64)),
        ("respondedCount", J::int(stat.responded_count as i64)),
        ("responseRate", J::int(stat.response_rate)),
        ("offerCount", J::int(stat.offer_count as i64)),
        ("offerRate", J::int(stat.offer_rate)),
    ])
}

pub fn channel_analytics(analytics: &ApplicationChannelAnalytics) -> J {
    J::object(vec![
        ("bySource", list(&analytics.by_source, group_stat)),
        ("byTag", list(&analytics.by_tag, group_stat)),
    ])
}

pub fn response_time_analytics(analytics: &ResponseTimeAnalytics) -> J {
    let stages = J::array(analytics.time_in_stage.iter().map(|stat| {
        J::object(vec![
            ("status", J::str(stat.status.as_str())),
            ("averageDays", J::opt_number(stat.average_days)),
            ("medianDays", J::opt_number(stat.median_days)),
            ("sampleSize", J::int(stat.sample_size as i64)),
        ])
    }));
    let first = &analytics.time_to_first_response;
    J::object(vec![
        ("timeInStage", stages),
        (
            "timeToFirstResponse",
            J::object(vec![
                ("averageDays", J::opt_number(first.average_days)),
                ("medianDays", J::opt_number(first.median_days)),
                ("sampleSize", J::int(first.sample_size as i64)),
            ]),
        ),
    ])
}

fn terminal_stat(stat: &RoundsToTerminalStat) -> J {
    J::object(vec![
        ("average", J::opt_number(stat.average)),
        ("median", J::opt_number(stat.median)),
        ("sampleSize", J::int(stat.sample_size)),
    ])
}

pub fn interview_round_analytics(analytics: &InterviewRoundAnalytics) -> J {
    let by_type = J::array(analytics.by_type.iter().map(|stat| {
        J::object(vec![
            ("type", J::str(stat.r#type.as_str())),
            ("passed", J::int(stat.passed)),
            ("failed", J::int(stat.failed)),
            ("pending", J::int(stat.pending)),
            ("cancelled", J::int(stat.cancelled)),
        ])
    }));
    J::object(vec![
        ("byType", by_type),
        ("roundsToOffer", terminal_stat(&analytics.rounds_to_offer)),
        ("roundsToRejection", terminal_stat(&analytics.rounds_to_rejection)),
    ])
}

pub fn offer_analytics(analytics: &OfferAnalytics) -> J {
    let trend = J::array(analytics.trend.iter().map(|point| {
        J::object(vec![
            ("offerId", J::str(&point.offer_id)),
            ("applicationId", J::str(&point.application_id)),
            ("company", J::str(&point.company)),
            ("role", J::str(&point.role)),
            // Pre-serialised to a string in the original, so never shortened.
            ("createdAt", J::str(iso(point.created_at))),
            ("currency", J::str(&point.currency)),
            ("normalizedYearlySalary", J::Number(point.normalized_yearly_salary)),
        ])
    }));
    let by_currency = J::array(analytics.by_currency.iter().map(|group| {
        J::object(vec![
            ("currency", J::str(&group.currency)),
            ("count", J::int(group.count)),
            ("minYearlySalary", J::Number(group.min_yearly_salary)),
            ("maxYearlySalary", J::Number(group.max_yearly_salary)),
            ("medianYearlySalary", J::Number(group.median_yearly_salary)),
            ("averageYearlySalary", J::Number(group.average_yearly_salary)),
        ])
    }));
    J::object(vec![("trend", trend), ("byCurrency", by_currency)])
}
