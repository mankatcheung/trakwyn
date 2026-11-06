import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The shared "new draft" form asked which type to create. There are no
 * new-draft pages any more (JEF-506): "Create new" on a tab opens the editor.
 * An old link lands on the Resumes tab.
 */
export const Route = createFileRoute('/_authenticated/applications/$applicationId/documents/new')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/applications/$applicationId',
      params: { applicationId: params.applicationId },
      search: { section: 'resumes' },
      replace: true,
    });
  },
});
