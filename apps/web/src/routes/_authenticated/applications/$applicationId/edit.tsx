import { createFileRoute } from '@tanstack/react-router';
import { applicationQueryOptions } from '../../../../features/application-detail/graphql/applicationQuery';
import { EditApplicationPage } from '../../../../features/application-detail/pages/EditApplicationPage';

export const Route = createFileRoute('/_authenticated/applications/$applicationId/edit')({
  loader: ({ context: { queryClient }, params: { applicationId } }) =>
    queryClient.query({ ...applicationQueryOptions(applicationId), staleTime: 'static' }),
  component: EditApplicationPage,
});
