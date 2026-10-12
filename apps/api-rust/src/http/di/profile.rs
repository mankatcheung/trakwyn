//! Profile sections: work experience, education and skills.

use crate::http::container::Container;
use crate::use_cases::education::{
    CreateEducationUseCase, DeleteEducationUseCase, UpdateEducationUseCase,
};
use crate::use_cases::skills::{CreateSkillUseCase, DeleteSkillUseCase, UpdateSkillUseCase};
use crate::use_cases::work_experience::{
    CreateWorkExperienceUseCase, DeleteWorkExperienceUseCase, UpdateWorkExperienceUseCase,
};

impl Container {
    pub fn create_work_experience_use_case(&self) -> CreateWorkExperienceUseCase {
        CreateWorkExperienceUseCase {
            work_experience_repository: self.work_experience_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn update_work_experience_use_case(&self) -> UpdateWorkExperienceUseCase {
        UpdateWorkExperienceUseCase {
            work_experience_repository: self.work_experience_repository.clone(),
        }
    }

    pub fn delete_work_experience_use_case(&self) -> DeleteWorkExperienceUseCase {
        DeleteWorkExperienceUseCase {
            work_experience_repository: self.work_experience_repository.clone(),
        }
    }

    pub fn create_education_use_case(&self) -> CreateEducationUseCase {
        CreateEducationUseCase {
            education_repository: self.education_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn update_education_use_case(&self) -> UpdateEducationUseCase {
        UpdateEducationUseCase { education_repository: self.education_repository.clone() }
    }

    pub fn delete_education_use_case(&self) -> DeleteEducationUseCase {
        DeleteEducationUseCase { education_repository: self.education_repository.clone() }
    }

    pub fn create_skill_use_case(&self) -> CreateSkillUseCase {
        CreateSkillUseCase {
            skill_repository: self.skill_repository.clone(),
            generate_id: self.generate_id.clone(),
        }
    }

    pub fn update_skill_use_case(&self) -> UpdateSkillUseCase {
        UpdateSkillUseCase { skill_repository: self.skill_repository.clone() }
    }

    pub fn delete_skill_use_case(&self) -> DeleteSkillUseCase {
        DeleteSkillUseCase { skill_repository: self.skill_repository.clone() }
    }
}
