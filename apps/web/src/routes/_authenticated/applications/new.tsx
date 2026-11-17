import { createFileRoute } from '@tanstack/react-router';
import { NewApplicationPage } from '../../../features/applications/pages/NewApplicationPage';

export const Route = createFileRoute('/_authenticated/applications/new')({
  component: NewApplicationPage,
});
