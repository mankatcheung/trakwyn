use std::sync::Arc;

use chrono::{DateTime, TimeDelta, Utc};

use super::*;
use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::interview_round::{InterviewRound, InterviewRoundOutcome, InterviewRoundType};
use crate::domain::share_link::ShareLink;
use crate::use_cases::clock::now;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::secret_token;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeApplicationRepository, FakeInterviewRoundRepository,
    FakeShareLinkRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";

fn link(id: &str, user_id: &str, raw: &str, created_at_s: i64) -> ShareLink {
    ShareLink {
        id: id.to_string(),
        user_id: user_id.to_string(),
        name: format!("link {id}"),
        token_hash: secret_token::hash(raw),
        last_used_at: None,
        created_at: DateTime::<Utc>::from_timestamp(created_at_s, 0).unwrap(),
    }
}

mod create {
    use super::*;

    fn use_case(repository: &Arc<FakeShareLinkRepository>) -> CreateShareLinkUseCase {
        CreateShareLinkUseCase {
            share_link_repository: repository.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn input() -> CreateShareLinkInput {
        CreateShareLinkInput { user_id: OWNER.to_string(), name: "Mentor".to_string() }
    }

    #[tokio::test]
    async fn generates_a_prefixed_token_and_stores_only_its_hash() {
        let repository = Arc::new(FakeShareLinkRepository::default());

        let output = use_case(&repository).execute(input()).await.unwrap();

        // jfsl_ + 24 random bytes in hex.
        let body = output.raw_token.strip_prefix("jfsl_").unwrap();
        assert_eq!(body.len(), 48);
        assert!(body.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')));

        assert_eq!(output.share_link.id, "id-1");
        assert_eq!(output.share_link.user_id, OWNER);
        assert_eq!(output.share_link.name, "Mentor");
        assert_eq!(output.share_link.token_hash, secret_token::hash(&output.raw_token));
        assert_eq!(repository.all(), vec![output.share_link]);
    }

    #[tokio::test]
    async fn each_call_produces_a_unique_raw_token() {
        let repository = Arc::new(FakeShareLinkRepository::default());
        let use_case = use_case(&repository);

        let first = use_case.execute(input()).await.unwrap();
        let second = use_case.execute(input()).await.unwrap();

        assert_ne!(first.raw_token, second.raw_token);
    }
}

mod list {
    use super::*;

    #[tokio::test]
    async fn returns_the_users_links_newest_first() {
        let repository = Arc::new(FakeShareLinkRepository::with(vec![
            link("old", OWNER, "jfsl_a", 100),
            link("new", OWNER, "jfsl_b", 200),
            link("foreign", STRANGER, "jfsl_c", 300),
        ]));

        let links = ListShareLinksUseCase { share_link_repository: repository }
            .execute(OWNER)
            .await
            .unwrap();

        let ids: Vec<&str> = links.iter().map(|link| link.id.as_str()).collect();
        assert_eq!(ids, vec!["new", "old"]);
    }

    #[tokio::test]
    async fn returns_nothing_when_the_user_has_no_links() {
        let repository = Arc::new(FakeShareLinkRepository::default());
        let links = ListShareLinksUseCase { share_link_repository: repository }
            .execute(OWNER)
            .await
            .unwrap();
        assert!(links.is_empty());
    }
}

mod delete {
    use super::*;

    #[tokio::test]
    async fn deletes_the_link_when_it_belongs_to_the_user() {
        let repository =
            Arc::new(FakeShareLinkRepository::with(vec![link("l", OWNER, "jfsl_a", 100)]));

        DeleteShareLinkUseCase { share_link_repository: repository.clone() }
            .execute("l", OWNER)
            .await
            .unwrap();

        assert!(repository.all().is_empty());
    }

    #[tokio::test]
    async fn a_link_that_is_not_the_users_is_not_found_and_kept() {
        let repository =
            Arc::new(FakeShareLinkRepository::with(vec![link("l", OWNER, "jfsl_a", 100)]));
        let use_case = DeleteShareLinkUseCase { share_link_repository: repository.clone() };

        for (id, user_id) in [("l", STRANGER), ("missing", OWNER)] {
            let err = use_case.execute(id, user_id).await.unwrap_err();
            assert_eq!(err.code(), ErrorCode::NotFound);
            assert_eq!(err.to_string(), "Share link not found");
        }
        assert_eq!(repository.all().len(), 1);
    }
}

mod shared_summary {
    use super::*;

    const RAW: &str = "jfsl_ffeeddccbbaa99887766554433221100ffeeddccbbaa9988";

    fn application(id: &str, status: ApplicationStatus, updated: TimeDelta) -> Application {
        Application { status, updated_at: now() - updated, ..application_owned_by(id, OWNER) }
    }

    fn round(
        id: &str,
        application_id: &str,
        outcome: InterviewRoundOutcome,
        scheduled_in: Option<TimeDelta>,
    ) -> InterviewRound {
        InterviewRound {
            id: id.to_string(),
            application_id: application_id.to_string(),
            r#type: InterviewRoundType::Phone,
            scheduled_at: scheduled_in.map(|offset| now() + offset),
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome,
            push_notification_sent_at: None,
            created_at: DateTime::<Utc>::UNIX_EPOCH,
            updated_at: DateTime::<Utc>::UNIX_EPOCH,
        }
    }

    struct Fixture {
        links: Arc<FakeShareLinkRepository>,
        use_case: GetSharedSummaryUseCase,
    }

    fn fixture(applications: Vec<Application>, rounds: Vec<InterviewRound>) -> Fixture {
        let links = Arc::new(FakeShareLinkRepository::with(vec![link("l", OWNER, RAW, 100)]));
        let applications = Arc::new(FakeApplicationRepository::with(applications));
        let rounds = Arc::new(
            FakeInterviewRoundRepository::with(rounds).with_applications(applications.clone()),
        );
        let use_case = GetSharedSummaryUseCase {
            share_link_repository: links.clone(),
            application_repository: applications,
            interview_round_repository: rounds,
        };
        Fixture { links, use_case }
    }

    #[tokio::test]
    async fn returns_none_when_no_link_has_the_token() {
        let fixture = fixture(vec![], vec![]);

        let summary = fixture.use_case.execute("jfsl_unknown").await.unwrap();

        assert_eq!(summary, None);
        assert_eq!(fixture.links.all()[0].last_used_at, None);
    }

    #[tokio::test]
    async fn looks_the_link_up_by_the_hash_of_the_raw_token_and_records_the_use() {
        let fixture = fixture(vec![], vec![]);

        let summary = fixture.use_case.execute(RAW).await.unwrap().unwrap();

        assert_eq!(summary.total_applications, 0);
        assert!(fixture.links.all()[0].last_used_at.is_some());
    }

    #[tokio::test]
    async fn computes_status_counts_totals_upcoming_interviews_and_recent_activity() {
        let day = TimeDelta::days(1);
        let foreign = Application {
            status: ApplicationStatus::Offered,
            updated_at: now(),
            ..application_owned_by("foreign", STRANGER)
        };
        let fixture = fixture(
            vec![
                application("a1", ApplicationStatus::Applied, day),
                application("a2", ApplicationStatus::Applied, day * 30),
                application("a3", ApplicationStatus::Interviewing, day * 6),
                application("a4", ApplicationStatus::Rejected, day * 8),
                foreign,
            ],
            vec![
                round("upcoming", "a3", InterviewRoundOutcome::Pending, Some(day)),
                round("past", "a3", InterviewRoundOutcome::Pending, Some(-day)),
                round("unscheduled", "a3", InterviewRoundOutcome::Pending, None),
                round("decided", "a1", InterviewRoundOutcome::Passed, Some(day)),
                round("foreign", "foreign", InterviewRoundOutcome::Pending, Some(day)),
            ],
        );
        let before = now();

        let summary = fixture.use_case.execute(RAW).await.unwrap().unwrap();

        let counts: Vec<(&str, usize)> =
            summary.status_counts.iter().map(|c| (c.status.as_str(), c.count)).collect();
        assert_eq!(
            counts,
            vec![
                ("draft", 0),
                ("applied", 2),
                ("interviewing", 1),
                ("offered", 0),
                ("accepted", 0),
                ("rejected", 1),
                ("withdrawn", 0),
            ]
        );
        assert_eq!(summary.total_applications, 4);
        assert_eq!(summary.total_interviews, 4);
        assert_eq!(summary.upcoming_interviews, 1);
        assert_eq!(summary.applications_updated_last_7_days, 2);
        assert!(summary.generated_at >= before && summary.generated_at <= now());
    }
}
