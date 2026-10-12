pub mod compute_resume_match_score;

pub use compute_resume_match_score::{
    ComputeResumeMatchScoreInput, ComputeResumeMatchScoreUseCase, ResumeMatchScore,
};

#[cfg(test)]
mod tests;
