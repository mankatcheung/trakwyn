import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ResetPasswordPage } from '../features/auth/pages/ResetPasswordPage';

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute('/reset-password')({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});
