import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The shared "new draft" form asked which type to create. Each type has its
 * own form now (JEF-396); an old link lands on the resume one, matching where
 * the old `?section=documents` lands.
 */
export const Route = createFileRoute('/_authenticated/applications/$applicationId/documents/new')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/applications/$applicationId/resumes/new',
      params: { applicationId: params.applicationId },
      replace: true,
    });
  },
});
