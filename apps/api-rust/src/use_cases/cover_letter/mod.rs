pub mod generate_cover_letter;
pub mod generate_cover_letter_draft;

pub use generate_cover_letter::{GenerateCoverLetterInput, GenerateCoverLetterUseCase};
pub use generate_cover_letter_draft::{
    GenerateCoverLetterDraftCommand, GenerateCoverLetterDraftUseCase,
};

#[cfg(test)]
mod tests;
