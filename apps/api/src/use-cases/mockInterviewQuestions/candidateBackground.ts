import { AI_PROMPT_INPUT } from '#src/use-cases/constants.js';
import type { IExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import {
  formatUserProfile,
  isUserProfileEmpty,
  loadUserProfile,
  type UserProfileRepositories,
} from '#src/use-cases/shared/userProfile.js';
import { wrapUntrustedContent } from '#src/use-cases/shared/wrapUntrustedContent.js';

export interface CandidateBackgroundDeps extends UserProfileRepositories {
  extractDocumentTextUseCase: IExtractDocumentTextUseCase;
}

export interface CandidateBackgroundRequest {
  userId: string;
  /** Send the user's profile (work experience, education, skills) to the model. */
  useProfile: boolean;
  /** One of the user's own documents whose text is sent to the model. */
  documentId?: string;
}

export interface CandidateBackground {
  /** The prompt block; empty when there is nothing to send. */
  text: string;
  usedProfile: boolean;
  usedDocument: boolean;
}

/**
 * What the model may know about the candidate (JEF-394): their stored profile,
 * the text of one chosen document, or both. Both are the user's own free text,
 * so each is capped and fenced as untrusted data. The profile is only read when
 * asked for, because it goes to the user's own AI provider.
 *
 * A foreign or missing document id surfaces `ExtractDocumentTextUseCase`'s
 * `NotFoundError` / `ForbiddenError`.
 */
export async function buildCandidateBackground(
  deps: CandidateBackgroundDeps,
  request: CandidateBackgroundRequest,
): Promise<CandidateBackground> {
  const [profile, document] = await Promise.all([
    request.useProfile ? loadUserProfile(deps, request.userId) : Promise.resolve(null),
    request.documentId
      ? deps.extractDocumentTextUseCase.execute({
          userId: request.userId,
          documentId: request.documentId,
        })
      : Promise.resolve(null),
  ]);

  const profileText =
    profile && !isUserProfileEmpty(profile)
      ? formatUserProfile(profile).slice(0, AI_PROMPT_INPUT.MOCK_INTERVIEW_PROFILE_MAX_CHARS)
      : '';
  const documentText =
    document?.text.trim().slice(0, AI_PROMPT_INPUT.MOCK_INTERVIEW_RESUME_MAX_CHARS) ?? '';

  const blocks = [
    ...(profileText
      ? [`\nCandidate profile (entered by the candidate):\n${wrapUntrustedContent(profileText)}`]
      : []),
    ...(documentText
      ? [`\nCandidate resume (uploaded by the candidate):\n${wrapUntrustedContent(documentText)}`]
      : []),
  ];

  return {
    text: blocks.join('\n'),
    usedProfile: Boolean(profileText),
    usedDocument: Boolean(documentText),
  };
}
