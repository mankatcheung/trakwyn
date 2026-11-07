import { chatPrompt } from '#src/use-cases/prompts/chat.js';
import { coverLetterPrompt } from '#src/use-cases/prompts/coverLetter.js';
import { parseJobDescriptionPrompt } from '#src/use-cases/prompts/parseJobDescription.js';
import { resumePrompt } from '#src/use-cases/prompts/resume.js';
import { resumeMatchPrompt } from '#src/use-cases/prompts/resumeMatch.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import type { EvalFeature } from '#src/evals/types.js';

/**
 * The prompt each eval feature runs through (JEF-505). A score only means
 * something next to the wording that produced it, so every result and the
 * report carry the prompt's `id@version`: two runs on either side of a prompt
 * change are told apart by it. Typed against `EvalFeature`, so a feature that
 * gets cases must say which prompt it exercises.
 */
const EVAL_PROMPTS = {
  jobDescription: parseJobDescriptionPrompt,
  resumeMatch: resumeMatchPrompt,
  resume: resumePrompt,
  coverLetter: coverLetterPrompt,
  chat: chatPrompt,
} satisfies Record<EvalFeature, PromptDefinition<never>>;

/** `parseJobDescription@1`: the prompt and version a feature's cases run against. */
export function promptRefOf(feature: EvalFeature): string {
  const { id, version } = EVAL_PROMPTS[feature];
  return `${id}@${version}`;
}
