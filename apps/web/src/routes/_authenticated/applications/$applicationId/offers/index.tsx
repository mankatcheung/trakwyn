import { createFileRoute } from '@tanstack/react-router';
import { ApplicationOffersPage } from '../../../../../features/offers/pages/ApplicationOffersPage';

export const Route = createFileRoute('/_authenticated/applications/$applicationId/offers/')({
  component: ApplicationOffersPage,
});
