import { createFileRoute, redirect } from '@tanstack/react-router';

// The CV profile editor moved out of Settings to its own page (JEF-459). The
// route stays so bookmarks and older links still land somewhere.
export const Route = createFileRoute('/_authenticated/settings/experience')({
  beforeLoad: () => {
    throw redirect({ to: '/profile', replace: true });
  },
});
