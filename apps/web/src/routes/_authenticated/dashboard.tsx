import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from './-components/DashboardPage';
import { DashboardPending } from './-components/DashboardPending';
import { prefetchDashboard } from './-dashboardQueries';

export * from './-dashboardQueries';

/** How long the loader may run before the skeleton replaces the old page. */
const DASHBOARD_PENDING_MS = 150;

export const Route = createFileRoute('/_authenticated/dashboard')({
  // Joins the requests the guard started alongside its gate check, rather
  // than starting a second round (JEF-535).
  loader: ({ context: { queryClient } }) => prefetchDashboard(queryClient, { speculative: false }),
  pendingComponent: DashboardPending,
  pendingMs: DASHBOARD_PENDING_MS,
  component: DashboardPage,
});
