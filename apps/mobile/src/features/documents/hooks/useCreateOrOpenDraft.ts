import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { gqlRequest } from '../../../graphql/client';
import { getErrorMessage } from '../../../lib/errors';
import { markdownToTiptapDoc } from '../lib/markdownToTiptapDoc';
import { CREATE_DOCUMENT_DRAFT_MUTATION, DOCUMENT_DRAFTS_QUERY } from '../graphql/draftOperations';
import { documentDraftsQueryKey } from './useDocumentDraftQueries';
import type { DocumentDraft, DocumentDraftSummary, DocumentDraftType } from '../types';

/** A draft with nothing in it. An unknown text (a list that did not say) is not blank. */
export function isBlankDraft(draft: Pick<DocumentDraftSummary, 'plainText'>): boolean {
  return draft.plainText !== undefined && draft.plainText.trim().length === 0;
}

/** The most recently updated blank draft of this type, if any. */
export function findBlankDraft(
  drafts: readonly DocumentDraftSummary[],
  type: DocumentDraftType,
): DocumentDraftSummary | undefined {
  return drafts
    .filter((d) => d.type === type && isBlankDraft(d))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export interface CreateOrOpenDraft {
  run: () => Promise<void>;
  pending: boolean;
  error: string | null;
}

/**
 * "Create new" for a resume or cover letter (JEF-508, the mobile twin of web's
 * `useCreateOrOpenDraft`): opens the blank draft this application already has
 * instead of piling up another, otherwise creates one. The list is read fresh,
 * so a draft made on another device is seen, and a second tap while the first
 * runs does nothing. The editor is `documents/<id>`, a sibling of the category
 * screen, so the bare relative push resolves against `[id]/` (JEF-310).
 */
export function useCreateOrOpenDraft(
  applicationId: string,
  type: DocumentDraftType,
): CreateOrOpenDraft {
  const { t } = useTranslation('documents');
  const queryClient = useQueryClient();
  const router = useRouter();
  const runningRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPending(true);
    setError(null);
    const open = (draftId: string) => router.push(`./documents/${draftId}` as never);
    try {
      const drafts = await queryClient.fetchQuery({
        queryKey: documentDraftsQueryKey(applicationId),
        queryFn: () =>
          gqlRequest<{ documentDrafts: DocumentDraftSummary[] }>(DOCUMENT_DRAFTS_QUERY, {
            applicationId,
          }).then((data) => data.documentDrafts),
        staleTime: 0,
      });
      const blank = findBlankDraft(drafts, type);
      if (blank) {
        open(blank.id);
        return;
      }

      const { contentJson, plainText } = markdownToTiptapDoc('');
      const { createDocumentDraft } = await gqlRequest<{ createDocumentDraft: DocumentDraft }>(
        CREATE_DOCUMENT_DRAFT_MUTATION,
        {
          input: {
            applicationId,
            type,
            title: t(type === 'cover_letter' ? 'cover_letter' : 'resume'),
            contentJson,
            plainText,
            sourceDocumentId: null,
          },
        },
      );
      void queryClient.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) });
      open(createDocumentDraft.id);
    } catch (err) {
      // The API's own message, so a quota failure names the limit.
      setError(getErrorMessage(err));
    } finally {
      runningRef.current = false;
      setPending(false);
    }
  }, [applicationId, type, queryClient, router, t]);

  return { run, pending, error };
}
