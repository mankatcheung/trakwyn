pub mod create_contact;
pub mod delete_contact;
pub mod get_contacts;
pub mod update_contact;

pub use create_contact::{CreateContactInput, CreateContactUseCase};
pub use delete_contact::{DeleteContactInput, DeleteContactUseCase};
pub use get_contacts::{GetContactsInput, GetContactsUseCase};
pub use update_contact::{UpdateContactInput, UpdateContactUseCase};

#[cfg(test)]
mod tests;
