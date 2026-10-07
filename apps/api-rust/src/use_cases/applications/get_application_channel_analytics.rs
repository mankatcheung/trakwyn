use std::sync::Arc;

use crate::domain::application::ApplicationStatus;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{ApplicationRepository, FindApplicationsFilters};

const NO_SOURCE_LABEL: &str = "(no source)";

const RESPONDED_STATUSES: [ApplicationStatus; 5] = [
    ApplicationStatus::Interviewing,
    ApplicationStatus::Offered,
    ApplicationStatus::Accepted,
    ApplicationStatus::Rejected,
    ApplicationStatus::Withdrawn,
];
const OFFERED_STATUSES: [ApplicationStatus; 2] =
    [ApplicationStatus::Offered, ApplicationStatus::Accepted];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationGroupStat {
    pub label: String,
    pub application_count: usize,
    pub responded_count: usize,
    /// A whole percentage of the group's non-draft applications.
    pub response_rate: u32,
    pub offer_count: usize,
    /// A whole percentage of the group's applications.
    pub offer_rate: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationChannelAnalytics {
    pub by_source: Vec<ApplicationGroupStat>,
    pub by_tag: Vec<ApplicationGroupStat>,
}

pub struct GetApplicationChannelAnalyticsInput {
    pub user_id: String,
}

/// Groups in first-seen order, keyed case-insensitively.
#[derive(Default)]
struct Groups {
    groups: Vec<Group>,
}

struct Group {
    key: String,
    label: String,
    statuses: Vec<ApplicationStatus>,
}

impl Groups {
    fn add(&mut self, key: String, label: &str, status: ApplicationStatus) {
        match self.groups.iter_mut().find(|group| group.key == key) {
            Some(group) => group.statuses.push(status),
            None => {
                self.groups.push(Group { key, label: label.to_string(), statuses: vec![status] })
            }
        }
    }

    /// Largest group first; groups of one size stay in first-seen order.
    fn into_stats(self) -> Vec<ApplicationGroupStat> {
        let mut stats: Vec<ApplicationGroupStat> = self.groups.iter().map(build_stat).collect();
        stats.sort_by_key(|stat| std::cmp::Reverse(stat.application_count));
        stats
    }
}

fn percentage(part: usize, whole: usize) -> u32 {
    if whole == 0 {
        return 0;
    }
    (part as f64 / whole as f64 * 100.0).round() as u32
}

fn build_stat(group: &Group) -> ApplicationGroupStat {
    let application_count = group.statuses.len();
    let applied_or_beyond =
        group.statuses.iter().filter(|status| **status != ApplicationStatus::Draft).count();
    let responded_count =
        group.statuses.iter().filter(|status| RESPONDED_STATUSES.contains(status)).count();
    let offer_count =
        group.statuses.iter().filter(|status| OFFERED_STATUSES.contains(status)).count();
    ApplicationGroupStat {
        label: group.label.clone(),
        application_count,
        responded_count,
        response_rate: percentage(responded_count, applied_or_beyond),
        offer_count,
        offer_rate: percentage(offer_count, application_count),
    }
}

/// `Application.source` and `Application.tags` are free text, captured on
/// every application: this answers "which channel/tag is actually working
/// for me." Grouping is case-insensitive (trim + lowercase) since neither
/// field is normalized at write time; the first-seen casing per group is kept
/// as the display label. Applications with no source are grouped under an
/// explicit "(no source)" bucket rather than dropped. Applications with no
/// tags simply don't appear in any tag group.
///
/// Response rate excludes drafts from the denominator; its numerator is any
/// status past "applied". Offer rate counts both `offered` and `accepted`.
pub struct GetApplicationChannelAnalyticsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
}

impl GetApplicationChannelAnalyticsUseCase {
    pub async fn execute(
        &self,
        input: GetApplicationChannelAnalyticsInput,
    ) -> DomainResult<ApplicationChannelAnalytics> {
        let applications = self
            .application_repository
            .find_all_by_user_id(&input.user_id, FindApplicationsFilters::default())
            .await?;

        let mut sources = Groups::default();
        let mut tags = Groups::default();

        for application in &applications {
            let source = application.source.as_deref().map(str::trim).filter(|s| !s.is_empty());
            match source {
                Some(source) => sources.add(source.to_lowercase(), source, application.status),
                None => {
                    sources.add(NO_SOURCE_LABEL.to_string(), NO_SOURCE_LABEL, application.status)
                }
            }

            for tag in &application.tags {
                let label = tag.trim();
                if label.is_empty() {
                    continue;
                }
                tags.add(label.to_lowercase(), label, application.status);
            }
        }

        Ok(ApplicationChannelAnalytics {
            by_source: sources.into_stats(),
            by_tag: tags.into_stats(),
        })
    }
}
