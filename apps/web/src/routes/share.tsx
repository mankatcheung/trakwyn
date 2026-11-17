import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SharedSummaryPage } from '../features/share/pages/SharedSummaryPage';

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute('/share')({
  validateSearch: searchSchema,
  component: SharedSummaryPage,
});
