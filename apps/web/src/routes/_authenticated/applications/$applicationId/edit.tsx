import { createFileRoute } from '@tanstack/react-router';
import { applicationQueryOptions } from './-application-query';
import { EditApplicationPage } from './-components/EditApplicationPage';

export const Route = createFileRoute('/_authenticated/applications/$applicationId/edit')({
  loader: ({ context: { queryClient }, params: { applicationId } }) =>
    queryClient.query({ ...applicationQueryOptions(applicationId), staleTime: 'static' }),
  component: EditApplicationPage,
});
