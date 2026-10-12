use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::contact::Contact;
use crate::domain::document::Document;
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::domain::note::Note;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, FakeApplicationRepository, FakeContactRepository, FakeDocumentRepository,
    FakeInterviewRoundRepository, FakeNoteRepository,
};

const OWNER: &str = "user-owner";
const APPLICATION: &str = "app-1";

fn epoch() -> DateTime<Utc> {
    DateTime::<Utc>::UNIX_EPOCH
}

mod health_score {
    use super::*;

    #[derive(Default)]
    struct Children {
        notes: bool,
        documents: bool,
        rounds: bool,
        contacts: bool,
    }

    fn use_case(application: Application, children: Children) -> ComputeHealthScoreUseCase {
        let notes = children.notes.then(|| Note {
            id: "note".to_string(),
            application_id: APPLICATION.to_string(),
            content: "text".to_string(),
            created_at: epoch(),
            updated_at: epoch(),
        });
        let documents = children.documents.then(|| Document {
            id: "doc".to_string(),
            application_id: APPLICATION.to_string(),
            name: "cv.pdf".to_string(),
            mime_type: "application/pdf".to_string(),
            size_bytes: 1,
            storage_key: "key".to_string(),
            document_type: "resume".to_string(),
            version: None,
            source_draft_id: None,
            created_at: epoch(),
        });
        let rounds = children.rounds.then(|| InterviewRound {
            id: "round".to_string(),
            application_id: APPLICATION.to_string(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome: InterviewRoundOutcome::Pending,
            push_notification_sent_at: None,
            created_at: epoch(),
            updated_at: epoch(),
        });
        let contacts = children.contacts.then(|| Contact {
            id: "contact".to_string(),
            application_id: APPLICATION.to_string(),
            name: "Sam".to_string(),
            role: None,
            email: None,
            phone: None,
            linkedin_url: None,
            notes: None,
            created_at: epoch(),
            updated_at: epoch(),
        });
        ComputeHealthScoreUseCase {
            application_repository: Arc::new(FakeApplicationRepository::with(vec![application])),
            note_repository: Arc::new(FakeNoteRepository::with(notes.into_iter().collect())),
            document_repository: Arc::new(FakeDocumentRepository::with(
                documents.into_iter().collect(),
            )),
            interview_round_repository: Arc::new(FakeInterviewRoundRepository::with(
                rounds.into_iter().collect(),
            )),
            contact_repository: Arc::new(FakeContactRepository::with(
                contacts.into_iter().collect(),
            )),
        }
    }

    fn bare() -> Application {
        application_owned_by(APPLICATION, OWNER)
    }

    fn complete() -> Application {
        Application {
            description: Some("About the job".to_string()),
            applied_at: Some(epoch()),
            follow_up_at: Some(epoch()),
            job_url: Some("https://acme.example".to_string()),
            salary_range: Some("100k".to_string()),
            location: Some("Remote".to_string()),
            source: Some("LinkedIn".to_string()),
            ..bare()
        }
    }

    #[tokio::test]
    async fn a_bare_application_scores_zero() {
        let score =
            use_case(bare(), Children::default()).execute(APPLICATION, OWNER).await.unwrap();

        assert_eq!(score.score, 0);
        assert_eq!(score.label, "Needs attention");
        assert_eq!(score.criteria.len(), 11);
        assert!(score.criteria.iter().all(|criterion| !criterion.met && criterion.earned == 0));
    }

    #[tokio::test]
    async fn every_criterion_met_scores_one_hundred() {
        let children = Children { notes: true, documents: true, rounds: true, contacts: true };

        let score = use_case(complete(), children).execute(APPLICATION, OWNER).await.unwrap();

        assert_eq!(score.score, 100);
        assert_eq!(score.label, "Complete");
        assert!(score.criteria.iter().all(|criterion| criterion.met));
    }

    #[tokio::test]
    async fn the_breakdown_lists_each_criterion_in_order_with_what_it_earned() {
        let application = Application { applied_at: Some(epoch()), ..bare() };
        let children = Children { notes: true, ..Children::default() };

        let score = use_case(application, children).execute(APPLICATION, OWNER).await.unwrap();

        assert_eq!(score.score, 25);
        let keys: Vec<&str> = score.criteria.iter().map(|criterion| criterion.key).collect();
        assert_eq!(
            keys,
            vec![
                "description",
                "appliedAt",
                "hasNotes",
                "hasDocuments",
                "followUpAt",
                "hasInterviews",
                "jobUrl",
                "salaryRange",
                "location",
                "source",
                "hasContacts",
            ]
        );
        assert_eq!(
            score.criteria[1],
            HealthScoreCriterion {
                key: "appliedAt",
                label: "Applied date logged",
                points: 15,
                earned: 15,
                met: true,
            }
        );
        assert_eq!(
            score.criteria[0],
            HealthScoreCriterion {
                key: "description",
                label: "Job description captured",
                points: 20,
                earned: 0,
                met: false,
            }
        );
    }

    #[tokio::test]
    async fn blank_text_does_not_count() {
        let application = Application {
            description: Some("   ".to_string()),
            job_url: Some(String::new()),
            ..bare()
        };

        let score =
            use_case(application, Children::default()).execute(APPLICATION, OWNER).await.unwrap();

        assert_eq!(score.score, 0);
    }

    #[tokio::test]
    async fn the_label_follows_the_score_bands() {
        // 100 - 20 = 80: looking good.
        let no_description = Application { description: None, ..complete() };
        let all = || Children { notes: true, documents: true, rounds: true, contacts: true };
        let score = use_case(no_description, all()).execute(APPLICATION, OWNER).await.unwrap();
        assert_eq!((score.score, score.label), (80, "Looking good"));

        // 20 + 15 + 10 = 45: in progress.
        let partial = Application {
            description: Some("About".to_string()),
            applied_at: Some(epoch()),
            follow_up_at: Some(epoch()),
            ..bare()
        };
        let score =
            use_case(partial, Children::default()).execute(APPLICATION, OWNER).await.unwrap();
        assert_eq!((score.score, score.label), (45, "In progress"));
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let err =
            use_case(bare(), Children::default()).execute("missing", OWNER).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let err = use_case(bare(), Children::default())
            .execute(APPLICATION, "user-stranger")
            .await
            .unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod channel_analytics {
    use super::*;

    /// Seeded oldest first; the repository lists newest first, so the last
    /// one here is the first one seen.
    fn analytics_of(applications: Vec<Application>) -> GetApplicationChannelAnalyticsUseCase {
        let applications = applications
            .into_iter()
            .enumerate()
            .map(|(index, application)| Application {
                id: format!("app-{index}"),
                created_at: DateTime::<Utc>::from_timestamp(index as i64, 0).unwrap(),
                ..application
            })
            .collect();
        GetApplicationChannelAnalyticsUseCase {
            application_repository: Arc::new(FakeApplicationRepository::with(applications)),
        }
    }

    fn application(source: Option<&str>, tags: &[&str], status: ApplicationStatus) -> Application {
        Application {
            source: source.map(str::to_string),
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            status,
            ..application_owned_by("app", OWNER)
        }
    }

    async fn run(use_case: GetApplicationChannelAnalyticsUseCase) -> ApplicationChannelAnalytics {
        use_case
            .execute(GetApplicationChannelAnalyticsInput { user_id: OWNER.to_string() })
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn no_applications_means_no_groups() {
        let analytics = run(analytics_of(vec![])).await;
        assert!(analytics.by_source.is_empty());
        assert!(analytics.by_tag.is_empty());
    }

    #[tokio::test]
    async fn groups_by_source_case_insensitively_keeping_the_first_seen_casing() {
        let analytics = run(analytics_of(vec![
            application(Some("linkedin"), &[], ApplicationStatus::Applied),
            application(Some("  LinkedIn "), &[], ApplicationStatus::Applied),
        ]))
        .await;

        assert_eq!(analytics.by_source.len(), 1);
        assert_eq!(analytics.by_source[0].label, "LinkedIn");
        assert_eq!(analytics.by_source[0].application_count, 2);
    }

    #[tokio::test]
    async fn applications_without_a_source_share_an_explicit_bucket() {
        let analytics = run(analytics_of(vec![
            application(None, &[], ApplicationStatus::Applied),
            application(Some("   "), &[], ApplicationStatus::Applied),
        ]))
        .await;

        assert_eq!(analytics.by_source.len(), 1);
        assert_eq!(analytics.by_source[0].label, "(no source)");
        assert_eq!(analytics.by_source[0].application_count, 2);
    }

    #[tokio::test]
    async fn an_application_counts_in_each_of_its_tag_groups() {
        let analytics = run(analytics_of(vec![
            application(None, &["Remote", "startup", "  "], ApplicationStatus::Applied),
            application(None, &["remote"], ApplicationStatus::Offered),
            application(None, &[], ApplicationStatus::Applied),
        ]))
        .await;

        let groups: Vec<(&str, usize)> =
            analytics.by_tag.iter().map(|g| (g.label.as_str(), g.application_count)).collect();
        assert_eq!(groups, vec![("remote", 2), ("startup", 1)]);
    }

    #[tokio::test]
    async fn rates_exclude_drafts_from_responses_and_count_offers_and_acceptances() {
        let source = Some("Referral");
        let analytics = run(analytics_of(vec![
            application(source, &[], ApplicationStatus::Draft),
            application(source, &[], ApplicationStatus::Applied),
            application(source, &[], ApplicationStatus::Rejected),
            application(source, &[], ApplicationStatus::Offered),
            application(source, &[], ApplicationStatus::Accepted),
        ]))
        .await;

        assert_eq!(
            analytics.by_source,
            vec![ApplicationGroupStat {
                label: "Referral".to_string(),
                application_count: 5,
                responded_count: 3,
                // 3 of the 4 that are not drafts.
                response_rate: 75,
                offer_count: 2,
                offer_rate: 40,
            }]
        );
    }

    #[tokio::test]
    async fn a_group_of_only_drafts_has_a_zero_response_rate() {
        let analytics =
            run(analytics_of(vec![application(None, &[], ApplicationStatus::Draft)])).await;

        assert_eq!(analytics.by_source[0].response_rate, 0);
        assert_eq!(analytics.by_source[0].offer_rate, 0);
    }

    #[tokio::test]
    async fn rates_round_to_the_nearest_whole_percent() {
        let analytics = run(analytics_of(vec![
            application(None, &[], ApplicationStatus::Applied),
            application(None, &[], ApplicationStatus::Applied),
            application(None, &[], ApplicationStatus::Offered),
        ]))
        .await;

        assert_eq!(analytics.by_source[0].response_rate, 33);
        assert_eq!(analytics.by_source[0].offer_rate, 33);
    }

    #[tokio::test]
    async fn the_largest_group_comes_first_and_ties_keep_first_seen_order() {
        let analytics = run(analytics_of(vec![
            application(Some("Big"), &[], ApplicationStatus::Applied),
            application(Some("Seen second"), &[], ApplicationStatus::Applied),
            application(Some("Big"), &[], ApplicationStatus::Applied),
            application(Some("Seen first"), &[], ApplicationStatus::Applied),
        ]))
        .await;

        let labels: Vec<&str> = analytics.by_source.iter().map(|g| g.label.as_str()).collect();
        assert_eq!(labels, vec!["Big", "Seen first", "Seen second"]);
    }
}
