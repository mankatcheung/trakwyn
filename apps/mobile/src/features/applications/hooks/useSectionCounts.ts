import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { gqlRequest } from '../../../graphql/client';
import { useDocuments } from '../../documents/hooks/useDocumentQueries';
import { useDocumentDrafts } from '../../documents/hooks/useDocumentDraftQueries';
import { APPLICATION_SECTION_COUNTS_QUERY } from '../graphql/operations';
import {
  documentSectionCounts,
  type ApiSectionCounts,
  type SectionCounts,
} from '../lib/sectionCounts';

export const sectionCountsQueryKey = (applicationId: string) =>
  ['sectionCounts', applicationId] as const;

/**
 * The detail screen's section badges. Held back until the API counts and both
 * document lists have arrived, so a badge of 0 that becomes 3 never reads as
 * an empty section for a moment (web does the same).
 *
 * Every sub-screen is pushed over the detail screen, which stays mounted, so
 * nothing refetches when you come back. Rather than have each of the note,
 * interview, contact, offer, document and briefing mutations know about this
 * query, the index refreshes itself whenever it regains focus, the only moment
 * its badges are on screen.
 */
export function useSectionCounts(applicationId: string): SectionCounts | undefined {
  const countsQuery = useQuery({
    queryKey: sectionCountsQueryKey(applicationId),
    queryFn: () =>
      gqlRequest<{ application: { sectionCounts: ApiSectionCounts } }>(
        APPLICATION_SECTION_COUNTS_QUERY,
        { id: applicationId },
      ).then((data) => data.application.sectionCounts),
    enabled: Boolean(applicationId),
  });
  const documentsQuery = useDocuments(applicationId);
  const draftsQuery = useDocumentDrafts(applicationId);

  const { refetch: refetchCounts } = countsQuery;
  const { refetch: refetchDocuments } = documentsQuery;
  const { refetch: refetchDrafts } = draftsQuery;

  // The first focus is the mount, which the queries already cover.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      if (!mounted.current) return;
      void refetchCounts();
      void refetchDocuments();
      void refetchDrafts();
    }, [refetchCounts, refetchDocuments, refetchDrafts]),
  );

  if (!countsQuery.data || !documentsQuery.data || !draftsQuery.data) return undefined;
  return {
    ...countsQuery.data,
    ...documentSectionCounts(documentsQuery.data, draftsQuery.data),
  };
}
