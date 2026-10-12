use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::*;
use crate::domain::contact::Contact;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{
    application_owned_by, sequential_ids, FakeApplicationRepository, FakeContactRepository,
};

const OWNER: &str = "user-owner";
const STRANGER: &str = "user-stranger";
const APPLICATION: &str = "app-1";

struct Fixture {
    applications: Arc<FakeApplicationRepository>,
    contacts: Arc<FakeContactRepository>,
}

impl Fixture {
    fn new(contacts: Vec<Contact>) -> Self {
        Self {
            applications: Arc::new(FakeApplicationRepository::with(vec![application_owned_by(
                APPLICATION,
                OWNER,
            )])),
            contacts: Arc::new(FakeContactRepository::with(contacts)),
        }
    }

    fn create(&self) -> CreateContactUseCase {
        CreateContactUseCase {
            application_repository: self.applications.clone(),
            contact_repository: self.contacts.clone(),
            generate_id: sequential_ids("id"),
        }
    }

    fn get(&self) -> GetContactsUseCase {
        GetContactsUseCase {
            application_repository: self.applications.clone(),
            contact_repository: self.contacts.clone(),
        }
    }

    fn update(&self) -> UpdateContactUseCase {
        UpdateContactUseCase {
            application_repository: self.applications.clone(),
            contact_repository: self.contacts.clone(),
        }
    }

    fn delete(&self) -> DeleteContactUseCase {
        DeleteContactUseCase {
            application_repository: self.applications.clone(),
            contact_repository: self.contacts.clone(),
        }
    }
}

fn contact(id: &str, application_id: &str, created_at_s: i64) -> Contact {
    let created_at = DateTime::<Utc>::from_timestamp(created_at_s, 0).unwrap();
    Contact {
        id: id.to_string(),
        application_id: application_id.to_string(),
        name: format!("name of {id}"),
        role: Some("Recruiter".to_string()),
        email: Some("jane@example.com".to_string()),
        phone: None,
        linkedin_url: None,
        notes: None,
        created_at,
        updated_at: created_at,
    }
}

mod create {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> CreateContactInput {
        CreateContactInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
            name: "Jane Doe".to_string(),
            role: Some("Recruiter".to_string()),
            email: Some("jane@example.com".to_string()),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn creates_a_contact_with_the_given_data() {
        let fixture = Fixture::new(vec![]);

        let created = fixture.create().execute(input(OWNER, APPLICATION)).await.unwrap();

        assert_eq!(created.id, "id-1");
        assert_eq!(created.application_id, APPLICATION);
        assert_eq!(created.name, "Jane Doe");
        assert_eq!(created.role.as_deref(), Some("Recruiter"));
        assert_eq!(created.email.as_deref(), Some("jane@example.com"));
        assert_eq!(created.phone, None);
        assert_eq!(created.linkedin_url, None);
        assert_eq!(created.notes, None);
        assert_eq!(fixture.contacts.all(), vec![created]);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(input(OWNER, "missing")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
        assert!(fixture.contacts.all().is_empty());
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![]);

        let err = fixture.create().execute(input(STRANGER, APPLICATION)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(err.to_string(), "Forbidden");
        assert!(fixture.contacts.all().is_empty());
    }
}

mod get {
    use super::*;

    fn input(user_id: &str, application_id: &str) -> GetContactsInput {
        GetContactsInput {
            user_id: user_id.to_string(),
            application_id: application_id.to_string(),
        }
    }

    #[tokio::test]
    async fn returns_the_applications_contacts_oldest_first() {
        let fixture = Fixture::new(vec![
            contact("new", APPLICATION, 200),
            contact("old", APPLICATION, 100),
            contact("other", "app-2", 50),
        ]);

        let contacts = fixture.get().execute(input(OWNER, APPLICATION)).await.unwrap();

        let ids: Vec<&str> = contacts.iter().map(|contact| contact.id.as_str()).collect();
        assert_eq!(ids, vec!["old", "new"]);
    }

    #[tokio::test]
    async fn fails_when_the_application_does_not_exist() {
        let err = Fixture::new(vec![]).get().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Application not found");
    }

    #[tokio::test]
    async fn refuses_someone_elses_application() {
        let fixture = Fixture::new(vec![contact("c", APPLICATION, 100)]);
        let err = fixture.get().execute(input(STRANGER, APPLICATION)).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod update {
    use super::*;

    fn input(user_id: &str, contact_id: &str) -> UpdateContactInput {
        UpdateContactInput {
            user_id: user_id.to_string(),
            contact_id: contact_id.to_string(),
            name: Some("Janet Doe".to_string()),
            role: Some(None),
            phone: Some(Some("555-0100".to_string())),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn writes_only_the_named_fields() {
        let fixture = Fixture::new(vec![contact("c", APPLICATION, 100)]);

        let updated = fixture.update().execute(input(OWNER, "c")).await.unwrap();

        assert_eq!(updated.name, "Janet Doe");
        assert_eq!(updated.role, None);
        assert_eq!(updated.phone.as_deref(), Some("555-0100"));
        assert_eq!(updated.email.as_deref(), Some("jane@example.com"));
        assert_eq!(fixture.contacts.all(), vec![updated]);
    }

    #[tokio::test]
    async fn fails_when_the_contact_does_not_exist() {
        let err = Fixture::new(vec![]).update().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Contact not found");
    }

    #[tokio::test]
    async fn refuses_a_contact_on_someone_elses_application() {
        let fixture = Fixture::new(vec![contact("c", APPLICATION, 100)]);

        let err = fixture.update().execute(input(STRANGER, "c")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.contacts.all()[0].name, "name of c");
    }

    #[tokio::test]
    async fn refuses_a_contact_whose_application_is_gone() {
        let fixture = Fixture::new(vec![contact("orphan", "app-trashed", 100)]);
        let err = fixture.update().execute(input(OWNER, "orphan")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
    }
}

mod delete {
    use super::*;

    fn input(user_id: &str, contact_id: &str) -> DeleteContactInput {
        DeleteContactInput { user_id: user_id.to_string(), contact_id: contact_id.to_string() }
    }

    #[tokio::test]
    async fn removes_the_contact() {
        let fixture =
            Fixture::new(vec![contact("c", APPLICATION, 100), contact("keep", APPLICATION, 200)]);

        fixture.delete().execute(input(OWNER, "c")).await.unwrap();

        let ids: Vec<String> = fixture.contacts.all().into_iter().map(|c| c.id).collect();
        assert_eq!(ids, vec!["keep"]);
    }

    #[tokio::test]
    async fn fails_when_the_contact_does_not_exist() {
        let err = Fixture::new(vec![]).delete().execute(input(OWNER, "missing")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        assert_eq!(err.to_string(), "Contact not found");
    }

    #[tokio::test]
    async fn refuses_a_contact_on_someone_elses_application() {
        let fixture = Fixture::new(vec![contact("c", APPLICATION, 100)]);

        let err = fixture.delete().execute(input(STRANGER, "c")).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.contacts.all().len(), 1);
    }

    #[tokio::test]
    async fn refuses_a_contact_whose_application_is_gone() {
        let fixture = Fixture::new(vec![contact("orphan", "app-trashed", 100)]);
        let err = fixture.delete().execute(input(OWNER, "orphan")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Forbidden);
        assert_eq!(fixture.contacts.all().len(), 1);
    }
}
