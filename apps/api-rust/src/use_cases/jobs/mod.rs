pub mod application_staleness;
pub mod bulk_add_tag_to_applications;
pub mod bulk_delete_applications;
pub mod bulk_restore_applications;
pub mod bulk_update_applications;
pub mod bulk_validation;
pub mod create_application;
pub mod delete_application;
pub mod empty_trash;
pub mod get_application;
pub mod get_application_section_counts;
pub mod get_applications;
pub mod get_applications_page;
pub mod list_trashed_applications;
pub mod move_application_on_board;
pub mod permanently_delete_application;
pub mod purge_expired_applications;
pub mod restore_application;
pub mod update_application;

pub use bulk_add_tag_to_applications::*;
pub use bulk_delete_applications::*;
pub use bulk_restore_applications::*;
pub use bulk_update_applications::*;
pub use create_application::*;
pub use delete_application::*;
pub use empty_trash::*;
pub use get_application::*;
pub use get_application_section_counts::*;
pub use get_applications::*;
pub use get_applications_page::*;
pub use list_trashed_applications::*;
pub use move_application_on_board::*;
pub use permanently_delete_application::*;
pub use purge_expired_applications::*;
pub use restore_application::*;
pub use update_application::*;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_board;
#[cfg(test)]
mod tests_bulk;
#[cfg(test)]
mod tests_trash;
#[cfg(test)]
mod tests_update;
