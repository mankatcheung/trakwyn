import { createFileRoute } from '@tanstack/react-router';
import { NewDraftForm } from '../-components/NewDraftForm';

export const Route = createFileRoute(
  '/_authenticated/applications/$applicationId/cover-letters/new',
)({
  component: NewCoverLetterDraftPage,
});

export function NewCoverLetterDraftPage() {
  const { applicationId } = Route.useParams();
  return <NewDraftForm applicationId={applicationId} type="cover_letter" />;
}
