import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { gqlClient } from '#/graphql/client';
import { getErrorMessage } from '#/lib/errors';
import { useLocale } from '#/lib/i18n';
import { proseToTiptapDoc } from '#/lib/proseToTiptapDoc';
import {
  documentDraftsQueryKey,
  documentDraftsQueryOptions,
  type DocumentDraft,
} from '../-documentQueries';
import { invalidateSectionCounts } from '../-sectionCounts';

export type DraftType = 'cover_letter' | 'resume';

const CREATE_DRAFT_MUTATION = `
  mutation CreateDocumentDraft($input: CreateDocumentDraftInput!) {
    createDocumentDraft(input: $input) {
      id
      applicationId
      type
      title
    }
  }
`;

/** A draft with nothing in it. An unknown text (a list that did not say) is not blank. */
export function isBlankDraft(draft: Pick<DocumentDraft, 'plainText'>): boolean {
  return draft.plainText !== undefined && draft.plainText.trim().length === 0;
}

/** The most recently updated blank draft of this type, if any. */
export function findBlankDraft(
  drafts: readonly DocumentDraft[],
  type: DraftType,
): DocumentDraft | undefined {
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
 * "Create new" for a resume or cover letter (JEF-506): opens the blank draft
 * this application already has instead of piling up another, otherwise
 * creates one. The list is read fresh, so a draft made in another tab is seen,
 * and a second click while the first runs does nothing.
 */
export function useCreateOrOpenDraft(applicationId: string, type: DraftType): CreateOrOpenDraft {
  const { t } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runningRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDraft = (draftId: string) =>
    navigate({
      to: '/applications/$applicationId/documents/$draftId',
      params: { applicationId, draftId },
    });

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPending(true);
    setError(null);
    try {
      const { documentDrafts } = await qc.fetchQuery({
        ...documentDraftsQueryOptions(applicationId),
        staleTime: 0,
      });
      const blank = findBlankDraft(documentDrafts, type);
      if (blank) {
        await openDraft(blank.id);
        return;
      }

      const { contentJson, plainText } = proseToTiptapDoc('');
      const res = await gqlClient.request<{
        createDocumentDraft: { id: string; applicationId: string };
      }>(CREATE_DRAFT_MUTATION, {
        input: {
          applicationId,
          type,
          title: type === 'cover_letter' ? t('documents.cover_letter') : t('documents.resume'),
          contentJson,
          plainText,
          sourceDocumentId: null,
        },
      });
      void qc.invalidateQueries({ queryKey: documentDraftsQueryKey(applicationId) });
      void invalidateSectionCounts(qc, applicationId);
      await openDraft(res.createDocumentDraft.id);
    } catch (err) {
      // The API's own message, so a quota failure names the limit.
      setError(getErrorMessage(err));
    } finally {
      runningRef.current = false;
      setPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openDraft only closes over applicationId and navigate
  }, [applicationId, type, qc, navigate, t]);

  return { run, pending, error };
}
