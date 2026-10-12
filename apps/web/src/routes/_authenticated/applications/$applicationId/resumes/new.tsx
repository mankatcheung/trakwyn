import { createFileRoute } from '@tanstack/react-router';
import { NewDraftForm } from '../-components/NewDraftForm';

export const Route = createFileRoute('/_authenticated/applications/$applicationId/resumes/new')({
  component: NewResumeDraftPage,
});

export function NewResumeDraftPage() {
  const { applicationId } = Route.useParams();
  return <NewDraftForm applicationId={applicationId} type="resume" />;
}
