import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { applicationsPageQueryOptions } from '../../../features/applications/graphql/applicationsPageQueries';
import { ApplicationsPage } from '../../../features/applications/pages/ApplicationsPage';

const searchSchema = z.object({
  status: z.string().optional(),
  starred: z.boolean().optional(),
  likelyGhosted: z.boolean().optional(),
});

export const Route = createFileRoute('/_authenticated/applications/')({
  validateSearch: searchSchema,
  // searchTerm is local-only component state (always '' on a fresh navigation),
  // so only status/starred — the URL-driven filters — need to be loader deps.
  loaderDeps: ({ search }) => ({
    status: search.status,
    starred: search.starred,
    likelyGhosted: search.likelyGhosted,
  }),
  loader: ({ context: { queryClient }, deps }) =>
    queryClient.infiniteQuery({
      ...applicationsPageQueryOptions(deps.status, deps.starred, '', deps.likelyGhosted),
      staleTime: 'static',
    }),
  component: ApplicationsPage,
});
