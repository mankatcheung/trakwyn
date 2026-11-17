import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPage } from '../features/legal/pages/PrivacyPage';

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy — Trakwyn' },
      {
        name: 'description',
        content: 'How Trakwyn collects, uses, and protects your information.',
      },
    ],
  }),
  component: PrivacyPage,
});
