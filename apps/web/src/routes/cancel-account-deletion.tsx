import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CancelAccountDeletionPage } from './-components/CancelAccountDeletionPage';

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute('/cancel-account-deletion')({
  validateSearch: searchSchema,
  component: CancelAccountDeletionPage,
});
