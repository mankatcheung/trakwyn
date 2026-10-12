use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::contact::Contact;
use crate::use_cases::clock::now;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{ContactRepository, CreateContactData, UpdateContactData};

#[derive(Default)]
pub struct FakeContactRepository {
    contacts: Mutex<Vec<Contact>>,
}

impl FakeContactRepository {
    pub fn with(contacts: Vec<Contact>) -> Self {
        Self { contacts: Mutex::new(contacts) }
    }

    pub fn all(&self) -> Vec<Contact> {
        self.contacts.lock().unwrap().clone()
    }
}

#[async_trait]
impl ContactRepository for FakeContactRepository {
    async fn find_all_by_application_id(&self, application_id: &str) -> DomainResult<Vec<Contact>> {
        let mut contacts: Vec<Contact> = self
            .all()
            .into_iter()
            .filter(|contact| contact.application_id == application_id)
            .collect();
        contacts.sort_by_key(|contact| contact.created_at);
        Ok(contacts)
    }

    async fn count_by_application_id(&self, application_id: &str) -> DomainResult<i64> {
        Ok(self.find_all_by_application_id(application_id).await?.len() as i64)
    }

    async fn find_by_id(&self, id: &str) -> DomainResult<Option<Contact>> {
        Ok(self.all().into_iter().find(|contact| contact.id == id))
    }

    async fn create(&self, data: CreateContactData) -> DomainResult<Contact> {
        let timestamp = now();
        let contact = Contact {
            id: data.id,
            application_id: data.application_id,
            name: data.name,
            role: data.role,
            email: data.email,
            phone: data.phone,
            linkedin_url: data.linkedin_url,
            notes: data.notes,
            created_at: timestamp,
            updated_at: timestamp,
        };
        self.contacts.lock().unwrap().push(contact.clone());
        Ok(contact)
    }

    async fn update(&self, id: &str, data: UpdateContactData) -> DomainResult<Contact> {
        let mut contacts = self.contacts.lock().unwrap();
        let contact = contacts
            .iter_mut()
            .find(|contact| contact.id == id)
            .ok_or_else(|| DomainError::internal(format!("no contact {id:?} to update")))?;

        if let Some(name) = data.name {
            contact.name = name;
        }
        if let Some(role) = data.role {
            contact.role = role;
        }
        if let Some(email) = data.email {
            contact.email = email;
        }
        if let Some(phone) = data.phone {
            contact.phone = phone;
        }
        if let Some(linkedin_url) = data.linkedin_url {
            contact.linkedin_url = linkedin_url;
        }
        if let Some(notes) = data.notes {
            contact.notes = notes;
        }
        contact.updated_at = now();
        Ok(contact.clone())
    }

    async fn delete(&self, id: &str, _application_id: &str) -> DomainResult<()> {
        self.contacts.lock().unwrap().retain(|contact| contact.id != id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data(id: &str) -> CreateContactData {
        CreateContactData {
            id: id.to_string(),
            application_id: "app-1".to_string(),
            name: "Jane Doe".to_string(),
            role: Some("Recruiter".to_string()),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn stores_updates_and_deletes_a_contact() {
        let repository = FakeContactRepository::default();
        repository.create(data("c1")).await.unwrap();
        repository.create(data("c2")).await.unwrap();

        let updated = repository
            .update(
                "c1",
                UpdateContactData {
                    email: Some(Some("jane@example.com".to_string())),
                    role: Some(None),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        assert_eq!(updated.name, "Jane Doe");
        assert_eq!(updated.role, None);
        assert_eq!(updated.email.as_deref(), Some("jane@example.com"));
        assert_eq!(repository.count_by_application_id("app-1").await.unwrap(), 2);
        assert_eq!(repository.count_by_application_id("app-2").await.unwrap(), 0);

        repository.delete("c1", "app-1").await.unwrap();

        assert_eq!(repository.find_by_id("c1").await.unwrap(), None);
        let listed = repository.find_all_by_application_id("app-1").await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "c2");
    }
}
