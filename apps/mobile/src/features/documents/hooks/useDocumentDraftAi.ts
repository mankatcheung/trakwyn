import { useMutation } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import {
  GENERATE_INTO_DOCUMENT_DRAFT_MUTATION,
  POLISH_DOCUMENT_DRAFT_MUTATION,
} from '../graphql/draftOperations';

export interface PolishInput {
  draftId: string;
  /** The text on screen right now, unsaved edits included. */
  plainText: string;
  instructions: string | null;
}

/** Suggests a better version of the text. Saves nothing (JEF-506). */
export function usePolishDocumentDraft() {
  return useMutation({
    mutationFn: (input: PolishInput) =>
      gqlRequest<{ polishDocumentDraft: { markdown: string } }>(
        POLISH_DOCUMENT_DRAFT_MUTATION,
        input,
      ).then((data) => data.polishDocumentDraft.markdown),
  });
}

export interface GenerateIntoInput {
  draftId: string;
  instructions: string | null;
  /** At most one of this application's resumes; neither means the saved profile alone. */
  resumeDocumentId?: string | null;
  resumeDraftId?: string | null;
}

export interface GeneratedContent {
  contentJson: string;
  plainText: string;
}

/** Writes a first version from the profile. Saves nothing: the editor saves what it takes. */
export function useGenerateIntoDocumentDraft() {
  return useMutation({
    mutationFn: (input: GenerateIntoInput) =>
      gqlRequest<{ generateIntoDocumentDraft: GeneratedContent }>(
        GENERATE_INTO_DOCUMENT_DRAFT_MUTATION,
        {
          draftId: input.draftId,
          instructions: input.instructions,
          resumeDocumentId: input.resumeDocumentId ?? null,
          resumeDraftId: input.resumeDraftId ?? null,
        },
      ).then((data) => data.generateIntoDocumentDraft),
  });
}
