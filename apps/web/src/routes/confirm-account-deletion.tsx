import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ConfirmAccountDeletionPage } from '../features/account-deletion/pages/ConfirmAccountDeletionPage';

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute('/confirm-account-deletion')({
  validateSearch: searchSchema,
  component: ConfirmAccountDeletionPage,
});
