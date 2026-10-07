use crate::http::container::Container;
use crate::use_cases::jobs::{
    BulkAddTagToApplicationsUseCase, BulkDeleteApplicationsUseCase, BulkRestoreApplicationsUseCase,
    BulkUpdateApplicationsUseCase, CreateApplicationUseCase, DeleteApplicationUseCase,
    GetApplicationSectionCountsUseCase, GetApplicationUseCase, GetApplicationsPageUseCase,
    GetApplicationsUseCase, ListTrashedApplicationsUseCase, MoveApplicationOnBoardUseCase,
    RestoreApplicationUseCase, UpdateApplicationUseCase,
};

impl Container {
    pub fn create_application_use_case(&self) -> CreateApplicationUseCase {
        CreateApplicationUseCase {
            application_repository: self.application_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn get_applications_use_case(&self) -> GetApplicationsUseCase {
        GetApplicationsUseCase { application_repository: self.application_repository.clone() }
    }

    pub fn get_applications_page_use_case(&self) -> GetApplicationsPageUseCase {
        GetApplicationsPageUseCase { application_repository: self.application_repository.clone() }
    }

    pub fn get_application_use_case(&self) -> GetApplicationUseCase {
        GetApplicationUseCase { application_repository: self.application_repository.clone() }
    }

    pub fn update_application_use_case(&self) -> UpdateApplicationUseCase {
        UpdateApplicationUseCase {
            application_repository: self.application_repository.clone(),
            activity_log_repository: self.activity_log_repository.clone(),
            generate_id: self.generate_id.clone(),
            transaction_manager: self.transaction_manager.clone(),
        }
    }

    pub fn delete_application_use_case(&self) -> DeleteApplicationUseCase {
        DeleteApplicationUseCase { application_repository: self.application_repository.clone() }
    }

    pub fn restore_application_use_case(&self) -> RestoreApplicationUseCase {
        RestoreApplicationUseCase { application_repository: self.application_repository.clone() }
    }

    pub fn list_trashed_applications_use_case(&self) -> ListTrashedApplicationsUseCase {
        ListTrashedApplicationsUseCase {
            application_repository: self.application_repository.clone(),
        }
    }

    pub fn bulk_update_applications_use_case(&self) -> BulkUpdateApplicationsUseCase {
        BulkUpdateApplicationsUseCase {
            update_application_use_case: self.update_application_use_case(),
            transaction_manager: self.transaction_manager.clone(),
        }
    }

    pub fn bulk_delete_applications_use_case(&self) -> BulkDeleteApplicationsUseCase {
        BulkDeleteApplicationsUseCase {
            delete_application_use_case: self.delete_application_use_case(),
        }
    }

    pub fn bulk_restore_applications_use_case(&self) -> BulkRestoreApplicationsUseCase {
        BulkRestoreApplicationsUseCase {
            restore_application_use_case: self.restore_application_use_case(),
        }
    }

    pub fn bulk_add_tag_to_applications_use_case(&self) -> BulkAddTagToApplicationsUseCase {
        BulkAddTagToApplicationsUseCase {
            application_repository: self.application_repository.clone(),
            update_application_use_case: self.update_application_use_case(),
            transaction_manager: self.transaction_manager.clone(),
        }
    }

    pub fn move_application_on_board_use_case(&self) -> MoveApplicationOnBoardUseCase {
        MoveApplicationOnBoardUseCase {
            application_repository: self.application_repository.clone(),
            update_application_use_case: self.update_application_use_case(),
            transaction_manager: self.transaction_manager.clone(),
        }
    }

    pub fn get_application_section_counts_use_case(&self) -> GetApplicationSectionCountsUseCase {
        GetApplicationSectionCountsUseCase {
            application_repository: self.application_repository.clone(),
            note_repository: self.note_repository.clone(),
            interview_round_repository: self.interview_round_repository.clone(),
            contact_repository: self.contact_repository.clone(),
            offer_repository: self.offer_repository.clone(),
            document_repository: self.document_repository.clone(),
            document_draft_repository: self.document_draft_repository.clone(),
        }
    }
}
