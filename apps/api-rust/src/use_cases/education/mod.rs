pub mod create_education;
pub mod delete_education;
pub mod update_education;

pub use create_education::{CreateEducationInput, CreateEducationUseCase};
pub use delete_education::{DeleteEducationInput, DeleteEducationUseCase};
pub use update_education::{UpdateEducationInput, UpdateEducationUseCase};

#[cfg(test)]
mod tests;
