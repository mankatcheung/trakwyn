import { createFileRoute } from '@tanstack/react-router';
import { TermsPage } from '../features/legal/pages/TermsPage';

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of Service — Trakwyn' },
      { name: 'description', content: 'The terms that govern your use of Trakwyn.' },
    ],
  }),
  component: TermsPage,
});
