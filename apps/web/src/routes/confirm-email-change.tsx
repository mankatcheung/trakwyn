import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ConfirmEmailChangePage } from '../features/auth/pages/ConfirmEmailChangePage';

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute('/confirm-email-change')({
  validateSearch: searchSchema,
  component: ConfirmEmailChangePage,
});
