use std::sync::Arc;

use chrono::{DateTime, Datelike, Utc};

use super::js_string::utf16_prefix;
use crate::domain::education::Education;
use crate::domain::skill::Skill;
use crate::domain::work_experience::WorkExperience;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{EducationRepository, SkillRepository, WorkExperienceRepository};

/// How much of a role's or a course's description reaches a prompt.
const DESCRIPTION_MAX_CHARS: usize = 200;
/// The heading a skill with no category is listed under.
const UNCATEGORISED: &str = "General";
const ONGOING: &str = "Present";

/// The user's stored background (work experience, education and skills) as
/// both the records themselves and the prose block that goes into a prompt.
///
/// The records are returned alongside the prose because generating a resume
/// needs to check the model's output against them: prose alone cannot tell
/// you whether an employer the model named is one the user actually entered.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UserProfile {
    pub work_experiences: Vec<WorkExperience>,
    pub educations: Vec<Education>,
    pub skills: Vec<Skill>,
}

pub async fn load_user_profile(
    work_experience_repository: &Arc<dyn WorkExperienceRepository>,
    education_repository: &Arc<dyn EducationRepository>,
    skill_repository: &Arc<dyn SkillRepository>,
    user_id: &str,
) -> DomainResult<UserProfile> {
    Ok(UserProfile {
        work_experiences: work_experience_repository.find_all_by_user_id(user_id).await?,
        educations: education_repository.find_all_by_user_id(user_id).await?,
        skills: skill_repository.find_all_by_user_id(user_id).await?,
    })
}

pub fn is_user_profile_empty(profile: &UserProfile) -> bool {
    profile.work_experiences.is_empty()
        && profile.educations.is_empty()
        && profile.skills.is_empty()
}

/// A date as `apps/api` prints it into a prompt: `toLocaleDateString()` on a
/// server whose locale is `en-US` and whose time zone is UTC, which is how
/// it is deployed (`M/D/YYYY`, no padding).
fn locale_date(date: DateTime<Utc>) -> String {
    format!("{}/{}/{}", date.month(), date.day(), date.year())
}

fn period(start: DateTime<Utc>, end: Option<DateTime<Utc>>) -> String {
    let end = end.map_or_else(|| ONGOING.to_string(), locale_date);
    format!("{} – {end}", locale_date(start))
}

/// Whether JavaScript would treat this object key as an array index, which
/// it enumerates before every other key, in numeric order.
fn array_index(key: &str) -> Option<u32> {
    let index: u32 = key.parse().ok()?;
    (index != u32::MAX && index.to_string() == key).then_some(index)
}

/// Skills grouped by category, in the order `apps/api` lists the groups: it
/// collects them into a plain object and walks `Object.entries`, so
/// categories that look like integers come first in numeric order and the
/// rest follow in the order they were first seen.
fn skills_by_category(skills: &[Skill]) -> Vec<(&str, Vec<String>)> {
    let mut groups: Vec<(&str, Vec<String>)> = Vec::new();
    for skill in skills {
        let category = skill.category.as_deref().unwrap_or(UNCATEGORISED);
        let label = match skill.proficiency.as_deref().filter(|level| !level.is_empty()) {
            Some(proficiency) => format!("{} ({proficiency})", skill.name),
            None => skill.name.clone(),
        };
        match groups.iter_mut().find(|(existing, _)| *existing == category) {
            Some((_, names)) => names.push(label),
            None => groups.push((category, vec![label])),
        }
    }
    // Stable, so the non-index keys keep their first-seen order.
    groups.sort_by_key(|(category, _)| match array_index(category) {
        Some(index) => (0, index),
        None => (1, 0),
    });
    groups
}

/// The prompt-facing rendering. An empty profile renders as an empty string.
pub fn format_user_profile(profile: &UserProfile) -> String {
    let mut lines: Vec<String> = Vec::new();

    if !profile.work_experiences.is_empty() {
        lines.push("Work Experience:".to_string());
        for role in &profile.work_experiences {
            lines.push(format!(
                "- {} at {} ({})",
                role.title,
                role.company,
                period(role.start_date, role.end_date)
            ));
            if let Some(description) = role.description.as_deref().filter(|text| !text.is_empty()) {
                lines.push(format!("  {}", utf16_prefix(description, DESCRIPTION_MAX_CHARS)));
            }
        }
    }

    if !profile.educations.is_empty() {
        lines.push("\nEducation:".to_string());
        for education in &profile.educations {
            lines.push(format!(
                "- {} {} at {} ({})",
                education.degree.as_deref().unwrap_or_default(),
                education.field.as_deref().unwrap_or_default(),
                education.institution,
                period(education.start_date, education.end_date)
            ));
            if let Some(description) =
                education.description.as_deref().filter(|text| !text.is_empty())
            {
                lines.push(format!("  {}", utf16_prefix(description, DESCRIPTION_MAX_CHARS)));
            }
        }
    }

    if !profile.skills.is_empty() {
        lines.push("\nSkills:".to_string());
        for (category, names) in skills_by_category(&profile.skills) {
            lines.push(format!("- {category}: {}", names.join(", ")));
        }
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text).unwrap().with_timezone(&Utc)
    }

    fn role(company: &str, title: &str) -> WorkExperience {
        WorkExperience {
            id: format!("we-{company}"),
            user_id: "user-1".to_string(),
            company: company.to_string(),
            title: title.to_string(),
            location: None,
            start_date: at("2020-01-15T00:00:00Z"),
            end_date: None,
            description: None,
            created_at: at("2020-01-15T00:00:00Z"),
            updated_at: at("2020-01-15T00:00:00Z"),
        }
    }

    fn education(institution: &str) -> Education {
        Education {
            id: format!("ed-{institution}"),
            user_id: "user-1".to_string(),
            institution: institution.to_string(),
            degree: Some("BSc".to_string()),
            field: Some("Computer Science".to_string()),
            start_date: at("2012-09-01T00:00:00Z"),
            end_date: Some(at("2016-06-30T00:00:00Z")),
            description: None,
            created_at: at("2020-01-15T00:00:00Z"),
            updated_at: at("2020-01-15T00:00:00Z"),
        }
    }

    fn skill(name: &str, category: Option<&str>, proficiency: Option<&str>) -> Skill {
        Skill {
            id: format!("sk-{name}"),
            user_id: "user-1".to_string(),
            name: name.to_string(),
            category: category.map(str::to_string),
            proficiency: proficiency.map(str::to_string),
            created_at: at("2020-01-15T00:00:00Z"),
        }
    }

    #[test]
    fn an_empty_profile_renders_as_an_empty_string() {
        let profile = UserProfile::default();

        assert!(is_user_profile_empty(&profile));
        assert_eq!(format_user_profile(&profile), "");
    }

    #[test]
    fn a_profile_with_any_one_section_is_not_empty() {
        let profile = UserProfile { skills: vec![skill("Rust", None, None)], ..Default::default() };

        assert!(!is_user_profile_empty(&profile));
    }

    #[test]
    fn renders_every_section_exactly_as_apps_api_does() {
        let mut ended = role("Globex", "Engineer");
        ended.end_date = Some(at("2019-12-31T00:00:00Z"));
        ended.description = Some("Built billing.".to_string());
        let profile = UserProfile {
            work_experiences: vec![role("Acme", "Senior Engineer"), ended],
            educations: vec![education("State University")],
            skills: vec![
                skill("Rust", Some("Languages"), Some("expert")),
                skill("Mentoring", None, None),
                skill("TypeScript", Some("Languages"), None),
            ],
        };

        assert_eq!(
            format_user_profile(&profile),
            "Work Experience:\n- Senior Engineer at Acme (1/15/2020 – Present)\n- Engineer at Globex (1/15/2020 – 12/31/2019)\n  Built billing.\n\nEducation:\n- BSc Computer Science at State University (9/1/2012 – 6/30/2016)\n\nSkills:\n- Languages: Rust (expert), TypeScript\n- General: Mentoring"
        );
    }

    #[test]
    fn a_missing_degree_and_field_leave_their_spaces_behind() {
        let mut entry = education("Night School");
        entry.degree = None;
        entry.field = None;
        entry.end_date = None;
        let profile = UserProfile { educations: vec![entry], ..Default::default() };

        assert_eq!(
            format_user_profile(&profile),
            "\nEducation:\n-   at Night School (9/1/2012 – Present)"
        );
    }

    #[test]
    fn caps_a_long_description() {
        let mut entry = role("Acme", "Engineer");
        entry.description = Some("d".repeat(500));
        let profile = UserProfile { work_experiences: vec![entry], ..Default::default() };

        assert!(format_user_profile(&profile).ends_with(&format!("\n  {}", "d".repeat(200))));
    }

    #[test]
    fn an_empty_category_is_its_own_group_not_general() {
        let profile = UserProfile {
            skills: vec![skill("A", Some(""), None), skill("B", None, None)],
            ..Default::default()
        };

        assert_eq!(format_user_profile(&profile), "\nSkills:\n- : A\n- General: B");
    }

    #[test]
    fn integer_like_categories_are_listed_first_in_numeric_order() {
        let profile = UserProfile {
            skills: vec![
                skill("A", Some("Tools"), None),
                skill("B", Some("10"), None),
                skill("C", Some("2"), None),
                skill("D", Some("02"), None),
            ],
            ..Default::default()
        };

        assert_eq!(
            format_user_profile(&profile),
            "\nSkills:\n- 2: C\n- 10: B\n- Tools: A\n- 02: D"
        );
    }
}
