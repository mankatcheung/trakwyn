//! A generated resume, before it becomes editor content.
//!
//! Structured rather than prose because a resume *is* its structure:
//! headings, roles, bullets (JEF-199).

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ResumeExperienceEntry {
    pub company: String,
    pub title: String,
    pub period: Option<String>,
    pub bullets: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ResumeEducationEntry {
    pub institution: String,
    pub qualification: Option<String>,
    pub period: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ResumeSkillGroup {
    pub category: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ResumeContent {
    pub summary: Option<String>,
    pub experience: Vec<ResumeExperienceEntry>,
    pub education: Vec<ResumeEducationEntry>,
    pub skills: Vec<ResumeSkillGroup>,
}
