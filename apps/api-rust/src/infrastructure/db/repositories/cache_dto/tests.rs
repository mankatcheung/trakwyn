//! Both directions of compatibility with `apps/api`'s cache: this crate reads
//! what that one stored, and stores what that one would have.

use std::fmt::Debug;

use chrono::{DateTime, Utc};
use serde_json::Value;

use super::fixtures::*;
use super::*;

fn at(text: &str) -> DateTime<Utc> {
    text.parse().unwrap()
}

fn d0() -> DateTime<Utc> {
    at("2026-09-01T10:00:00.000Z")
}

fn d1() -> DateTime<Utc> {
    at("2026-09-02T11:30:15.250Z")
}

/// `fixture` is what Node cached for `entity`.
fn assert_compatible<D>(fixture: &str, entity: D::Entity)
where
    D: CacheDto,
    D::Entity: Clone + PartialEq + Debug,
{
    let read: D = serde_json::from_str(fixture).expect("Node's entry deserializes");
    assert_eq!(read.into_entity(), entity, "read what Node cached");

    let written = serde_json::to_value(D::from_entity(entity)).unwrap();
    let node: Value = serde_json::from_str(fixture).unwrap();
    assert_eq!(written, node, "wrote what Node would have cached");
}

fn api_token(scope: ApiTokenScope, last_used_at: Option<DateTime<Utc>>) -> ApiToken {
    ApiToken {
        id: "tok1".to_string(),
        user_id: "user1".to_string(),
        name: "CI token".to_string(),
        token_hash: "hash1".to_string(),
        scope,
        last_used_at,
        created_at: d0(),
    }
}

#[test]
fn api_token_in_both_shapes() {
    assert_compatible::<ApiTokenDto>(API_TOKEN_0, api_token(ApiTokenScope::Read, Some(d1())));
    assert_compatible::<ApiTokenDto>(API_TOKEN_1, api_token(ApiTokenScope::Full, None));
}

#[test]
fn api_token_with_user_email() {
    assert_compatible::<ApiTokenWithUserEmailDto>(
        API_TOKEN_WITH_EMAIL_0,
        ApiTokenWithUserEmail {
            token: api_token(ApiTokenScope::Read, Some(d1())),
            user_email: "ada@example.com".to_string(),
        },
    );
}

fn application() -> Application {
    Application {
        id: "app1".to_string(),
        user_id: "user1".to_string(),
        company: "Acme".to_string(),
        role: "Engineer".to_string(),
        status: ApplicationStatus::Interviewing,
        job_url: Some("https://acme.test/jobs/1".to_string()),
        location: Some("Remote".to_string()),
        salary_range: Some("100-120k".to_string()),
        description: Some("Build things".to_string()),
        applied_at: Some(d0()),
        starred: true,
        source: Some("LinkedIn".to_string()),
        follow_up_at: Some(d1()),
        tags: vec!["rust".to_string(), "remote".to_string()],
        reminder_sent_at: Some(d1()),
        board_position: 3,
        deleted_at: None,
        created_at: d0(),
        updated_at: d1(),
    }
}

#[test]
fn application_in_every_shape() {
    assert_compatible::<ApplicationDto>(APPLICATION_0, application());
    assert_compatible::<ApplicationDto>(
        APPLICATION_1,
        Application {
            status: ApplicationStatus::Draft,
            starred: false,
            tags: vec![],
            job_url: None,
            location: None,
            salary_range: None,
            description: None,
            applied_at: None,
            source: None,
            follow_up_at: None,
            reminder_sent_at: None,
            ..application()
        },
    );
    assert_compatible::<ApplicationDto>(
        APPLICATION_2,
        Application { deleted_at: Some(d1()), ..application() },
    );
}

fn user() -> User {
    User {
        id: "user1".to_string(),
        email: "ada@example.com".to_string(),
        password_hash: Some("$2b$10$abc".to_string()),
        name: Some("Ada".to_string()),
        timezone: Some("Europe/London".to_string()),
        target_role: Some("Staff Engineer".to_string()),
        email_verified_at: Some(d0()),
        avatar_key: Some("avatars/user1.png".to_string()),
        weekly_digest_enabled: true,
        digest_frequency: DigestFrequency::Weekly,
        last_digest_sent_at: Some(d1()),
        follow_up_reminders_enabled: true,
        push_notifications_enabled: false,
        weekly_application_goal: 5,
        totp_secret: Some("SECRET".to_string()),
        totp_enabled: true,
        default_llm_provider: Some("anthropic".to_string()),
        custom_ai_prompt: Some("Be brief".to_string()),
        use_cross_application_context: true,
        llm_fallback_when_limited: false,
        backup_email: Some("backup@example.com".to_string()),
        backup_email_verified_at: Some(d1()),
        onboarding_checklist_dismissed_at: Some(d0()),
        created_at: d0(),
        updated_at: d1(),
    }
}

#[test]
fn user_in_every_shape() {
    assert_compatible::<UserDto>(USER_0, user());
    assert_compatible::<UserDto>(
        USER_1,
        User {
            digest_frequency: DigestFrequency::Off,
            weekly_digest_enabled: false,
            password_hash: None,
            name: None,
            timezone: None,
            target_role: None,
            email_verified_at: None,
            avatar_key: None,
            last_digest_sent_at: None,
            totp_secret: None,
            default_llm_provider: None,
            custom_ai_prompt: None,
            backup_email: None,
            backup_email_verified_at: None,
            onboarding_checklist_dismissed_at: None,
            ..user()
        },
    );
}

#[test]
fn note_entity() {
    assert_compatible::<NoteDto>(
        NOTE_0,
        Note {
            id: "note1".to_string(),
            application_id: "app1".to_string(),
            content: "Call back on Friday".to_string(),
            created_at: d0(),
            updated_at: d1(),
        },
    );
}

#[test]
fn document() {
    let document = Document {
        id: "doc1".to_string(),
        application_id: "app1".to_string(),
        name: "cv.pdf".to_string(),
        mime_type: "application/pdf".to_string(),
        size_bytes: 20480,
        storage_key: "documents/doc1.pdf".to_string(),
        document_type: "resume".to_string(),
        version: Some("v2".to_string()),
        source_draft_id: Some("draft1".to_string()),
        created_at: d0(),
    };
    assert_compatible::<DocumentDto>(DOCUMENT_0, document.clone());
    assert_compatible::<DocumentDto>(
        DOCUMENT_1,
        Document {
            id: "doc2".to_string(),
            name: "cover.pdf".to_string(),
            size_bytes: 1,
            storage_key: "documents/doc2.pdf".to_string(),
            document_type: "cover_letter".to_string(),
            version: None,
            source_draft_id: None,
            created_at: d1(),
            ..document
        },
    );
}

#[test]
fn contact() {
    assert_compatible::<ContactDto>(
        CONTACT_0,
        Contact {
            id: "con1".to_string(),
            application_id: "app1".to_string(),
            name: "Grace".to_string(),
            role: Some("Recruiter".to_string()),
            email: Some("grace@acme.test".to_string()),
            phone: Some("+44 20 7946 0000".to_string()),
            linkedin_url: Some("https://linkedin.test/in/grace".to_string()),
            notes: Some("Met at a meetup".to_string()),
            created_at: d0(),
            updated_at: d1(),
        },
    );
    assert_compatible::<ContactDto>(
        CONTACT_1,
        Contact {
            id: "con2".to_string(),
            application_id: "app1".to_string(),
            name: "Alan".to_string(),
            role: None,
            email: None,
            phone: None,
            linkedin_url: None,
            notes: None,
            created_at: d0(),
            updated_at: d0(),
        },
    );
}

#[test]
fn education() {
    assert_compatible::<EducationDto>(
        EDUCATION_0,
        Education {
            id: "edu1".to_string(),
            user_id: "user1".to_string(),
            institution: "MIT".to_string(),
            degree: Some("BSc".to_string()),
            field: Some("CS".to_string()),
            start_date: d0(),
            end_date: Some(d1()),
            description: Some("Thesis on caches".to_string()),
            created_at: d0(),
            updated_at: d1(),
        },
    );
    assert_compatible::<EducationDto>(
        EDUCATION_1,
        Education {
            id: "edu2".to_string(),
            user_id: "user1".to_string(),
            institution: "Oxford".to_string(),
            degree: None,
            field: None,
            start_date: d0(),
            end_date: None,
            description: None,
            created_at: d0(),
            updated_at: d0(),
        },
    );
}

#[test]
fn skill() {
    assert_compatible::<SkillDto>(
        SKILL_0,
        Skill {
            id: "skill1".to_string(),
            user_id: "user1".to_string(),
            name: "Rust".to_string(),
            category: Some("Languages".to_string()),
            proficiency: Some("expert".to_string()),
            created_at: d0(),
        },
    );
    assert_compatible::<SkillDto>(
        SKILL_1,
        Skill {
            id: "skill2".to_string(),
            user_id: "user1".to_string(),
            name: "Go".to_string(),
            category: None,
            proficiency: None,
            created_at: d1(),
        },
    );
}

#[test]
fn work_experience() {
    assert_compatible::<WorkExperienceDto>(
        WORK_EXPERIENCE_0,
        WorkExperience {
            id: "work1".to_string(),
            user_id: "user1".to_string(),
            company: "Acme".to_string(),
            title: "Engineer".to_string(),
            location: Some("London".to_string()),
            start_date: d0(),
            end_date: Some(d1()),
            description: Some("Built things".to_string()),
            created_at: d0(),
            updated_at: d1(),
        },
    );
    assert_compatible::<WorkExperienceDto>(
        WORK_EXPERIENCE_1,
        WorkExperience {
            id: "work2".to_string(),
            user_id: "user1".to_string(),
            company: "Initech".to_string(),
            title: "Intern".to_string(),
            location: None,
            start_date: d0(),
            end_date: None,
            description: None,
            created_at: d0(),
            updated_at: d0(),
        },
    );
}

#[test]
fn interview_round() {
    assert_compatible::<InterviewRoundDto>(
        INTERVIEW_ROUND_0,
        InterviewRound {
            id: "round1".to_string(),
            application_id: "app1".to_string(),
            r#type: InterviewRoundType::Technical,
            scheduled_at: Some(d1()),
            completed_at: Some(d1()),
            interviewer_name: Some("Grace".to_string()),
            notes: Some("Went well".to_string()),
            outcome: InterviewRoundOutcome::Passed,
            push_notification_sent_at: Some(d0()),
            created_at: d0(),
            updated_at: d1(),
        },
    );
    assert_compatible::<InterviewRoundDto>(
        INTERVIEW_ROUND_1,
        InterviewRound {
            id: "round2".to_string(),
            application_id: "app1".to_string(),
            r#type: InterviewRoundType::Hr,
            scheduled_at: None,
            completed_at: None,
            interviewer_name: None,
            notes: None,
            outcome: InterviewRoundOutcome::Pending,
            push_notification_sent_at: None,
            created_at: d0(),
            updated_at: d0(),
        },
    );
}

#[test]
fn a_timestamp_is_written_the_way_to_iso_string_writes_it() {
    let json = serde_json::to_value(NoteDto::from_entity(Note {
        id: "n".to_string(),
        application_id: "a".to_string(),
        content: String::new(),
        created_at: at("2026-09-01T10:00:00Z"),
        updated_at: at("2026-09-01T10:00:00.250Z"),
    }))
    .unwrap();

    assert_eq!(json["createdAt"], "2026-09-01T10:00:00.000Z");
    assert_eq!(json["updatedAt"], "2026-09-01T10:00:00.250Z");
}

#[test]
fn an_entry_with_an_unknown_enum_value_does_not_deserialize() {
    let bad_scope = API_TOKEN_0.replace(r#""scope":"read""#, r#""scope":"admin""#);
    assert!(serde_json::from_str::<ApiTokenDto>(&bad_scope).is_err());

    let bad_status = APPLICATION_0.replace("interviewing", "ghosted");
    assert!(serde_json::from_str::<ApplicationDto>(&bad_status).is_err());
}

#[test]
fn an_entry_missing_a_field_does_not_deserialize() {
    let without_title = WORK_EXPERIENCE_0.replace(r#""title":"Engineer","#, "");
    assert!(serde_json::from_str::<WorkExperienceDto>(&without_title).is_err());
}
