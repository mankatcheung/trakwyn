import { createFileRoute } from '@tanstack/react-router';
import { applicationQueryOptions } from '../../../../features/application-detail/graphql/applicationQuery';
import { ApplicationDetailPage } from '../../../../features/application-detail/pages/ApplicationDetailPage';
import { sectionSearchSchema } from '../../../../features/application-detail/lib/sections';

export const Route = createFileRoute('/_authenticated/applications/$applicationId/')({
  // The open section lives in the URL, not component state: on a phone the
  // index and a section are separate screens, so Back has to leave the section
  // rather than the application (JEF-208).
  validateSearch: sectionSearchSchema,
  loader: ({ context: { queryClient }, params: { applicationId } }) =>
    queryClient.query({ ...applicationQueryOptions(applicationId), staleTime: 'static' }),
  component: ApplicationDetailPage,
});
