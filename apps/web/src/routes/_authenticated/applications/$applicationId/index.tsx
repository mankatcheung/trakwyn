import { createFileRoute } from '@tanstack/react-router';
import { applicationQueryOptions } from './-application-query';
import { ApplicationDetailPage } from './-components/ApplicationDetailPage';
import { sectionSearchSchema } from './-sections';

export const Route = createFileRoute('/_authenticated/applications/$applicationId/')({
  // The open section lives in the URL, not component state: on a phone the
  // index and a section are separate screens, so Back has to leave the section
  // rather than the application (JEF-208).
  validateSearch: sectionSearchSchema,
  loader: ({ context: { queryClient }, params: { applicationId } }) =>
    queryClient.query({ ...applicationQueryOptions(applicationId), staleTime: 'static' }),
  component: ApplicationDetailPage,
});
