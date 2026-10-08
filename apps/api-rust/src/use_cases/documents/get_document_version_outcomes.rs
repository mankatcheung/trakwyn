use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::use_cases::constants::document_type;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{DocumentRepository, InterviewRoundRepository};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentVersionOutcome {
    pub document_type: String,
    pub version: Option<String>,
    pub application_count: i32,
    pub interview_count: i32,
    /// `interview_count / application_count` as a whole-number percentage
    /// (0 when `application_count` is 0).
    pub interview_rate: i32,
}

pub struct GetDocumentVersionOutcomesInput {
    pub user_id: String,
}

struct Group {
    document_type: String,
    version: Option<String>,
    application_ids: HashSet<String>,
}

/// Turns per-application resume and cover-letter uploads into a longitudinal
/// view: for each (document type, version) pair, how many applications it
/// was attached to and how many of those led to an interview (JEF-58).
///
/// "Led to an interview" means the application has at least one
/// `InterviewRound` record, a directly recorded event, rather than
/// inferring it from the application's status, which is a single mutable
/// field a user could leave stale or skip past.
///
/// `version` is free text and optional at upload time, so documents with no
/// version are grouped together under `version: None` rather than dropped.
/// An empty version joins that group too, and the group reports whichever of
/// the two spellings its first document had.
pub struct GetDocumentVersionOutcomesUseCase {
    pub document_repository: Arc<dyn DocumentRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
}

impl GetDocumentVersionOutcomesUseCase {
    pub async fn execute(
        &self,
        input: GetDocumentVersionOutcomesInput,
    ) -> DomainResult<Vec<DocumentVersionOutcome>> {
        let (documents, interview_rounds) = futures::try_join!(
            self.document_repository.find_all_by_user_id(&input.user_id),
            self.interview_round_repository.find_all_by_user_id(&input.user_id),
        )?;

        let application_ids_with_interview: HashSet<String> =
            interview_rounds.into_iter().map(|round| round.application_id).collect();

        // Groups stay in first-seen order, which the stable sort below keeps
        // among groups of equal size.
        let mut groups: Vec<Group> = Vec::new();
        let mut positions: HashMap<(String, String), usize> = HashMap::new();
        for document in documents {
            if document.document_type != document_type::RESUME
                && document.document_type != document_type::COVER_LETTER
            {
                continue;
            }
            let key =
                (document.document_type.clone(), document.version.clone().unwrap_or_default());
            let position = *positions.entry(key).or_insert_with(|| {
                groups.push(Group {
                    document_type: document.document_type.clone(),
                    version: document.version.clone(),
                    application_ids: HashSet::new(),
                });
                groups.len() - 1
            });
            groups[position].application_ids.insert(document.application_id);
        }

        let mut outcomes: Vec<DocumentVersionOutcome> = groups
            .into_iter()
            .map(|group| {
                let application_count = group.application_ids.len();
                let interview_count = group
                    .application_ids
                    .iter()
                    .filter(|id| application_ids_with_interview.contains(*id))
                    .count();
                let interview_rate = if application_count > 0 {
                    ((interview_count as f64 / application_count as f64) * 100.0).round() as i32
                } else {
                    0
                };
                DocumentVersionOutcome {
                    document_type: group.document_type,
                    version: group.version,
                    application_count: application_count as i32,
                    interview_count: interview_count as i32,
                    interview_rate,
                }
            })
            .collect();
        outcomes.sort_by_key(|outcome| std::cmp::Reverse(outcome.application_count));
        Ok(outcomes)
    }
}
