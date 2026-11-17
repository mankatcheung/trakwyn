import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { VerifyEmailPage } from '../features/verification/pages/VerifyEmailPage';

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute('/verify-email')({
  validateSearch: searchSchema,
  component: VerifyEmailPage,
});
