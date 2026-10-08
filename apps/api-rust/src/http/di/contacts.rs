use crate::http::container::Container;
use crate::use_cases::contacts::{
    CreateContactUseCase, DeleteContactUseCase, GetContactsUseCase, UpdateContactUseCase,
};

impl Container {
    pub fn create_contact_use_case(&self) -> CreateContactUseCase {
        CreateContactUseCase {
            application_repository: self.application_repository.clone(),
            contact_repository: self.contact_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_contacts_use_case(&self) -> GetContactsUseCase {
        GetContactsUseCase {
            application_repository: self.application_repository.clone(),
            contact_repository: self.contact_repository.clone(),
        }
    }

    pub fn update_contact_use_case(&self) -> UpdateContactUseCase {
        UpdateContactUseCase {
            application_repository: self.application_repository.clone(),
            contact_repository: self.contact_repository.clone(),
        }
    }

    pub fn delete_contact_use_case(&self) -> DeleteContactUseCase {
        DeleteContactUseCase {
            application_repository: self.application_repository.clone(),
            contact_repository: self.contact_repository.clone(),
        }
    }
}
