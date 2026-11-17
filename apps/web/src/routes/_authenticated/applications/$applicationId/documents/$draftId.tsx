import { createFileRoute } from '@tanstack/react-router';
import { DraftEditPage } from '../../../../../features/documents/pages/DraftEditPage';

export const Route = createFileRoute(
  '/_authenticated/applications/$applicationId/documents/$draftId',
)({
  component: DraftEditPage,
});
