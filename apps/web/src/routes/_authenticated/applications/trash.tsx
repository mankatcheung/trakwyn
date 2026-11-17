import { createFileRoute } from '@tanstack/react-router';
import { TrashPage } from '../../../features/applications/pages/TrashPage';
import { trashedApplicationsQueryOptions } from '../../../features/applications/graphql/trashQueries';

// Static segment, so it wins over /applications/$applicationId — ids are
// nanoid strings, which never collide with "trash".
export const Route = createFileRoute('/_authenticated/applications/trash')({
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...trashedApplicationsQueryOptions(), staleTime: 'static' }),
  component: TrashPage,
});
