import { createFileRoute } from '@tanstack/react-router';
import { AccessibilityPage } from '../features/legal/pages/AccessibilityPage';

export const Route = createFileRoute('/accessibility')({
  head: () => ({
    meta: [
      { title: 'Accessibility — Trakwyn' },
      {
        name: 'description',
        content: 'Trakwyn’s accessibility target and how to report an accessibility barrier.',
      },
    ],
  }),
  component: AccessibilityPage,
});
