import type { Meta, StoryObj } from '@storybook/react-vite';
import { BriefcaseIcon } from 'lucide-react';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  render: () => (
    <EmptyState
      className="py-12"
      icon={<BriefcaseIcon size={40} />}
      message="No applications yet."
      action={
        <a
          href="#"
          className="mt-2 inline-block text-blue-800 dark:text-blue-400 hover:underline text-sm"
        >
          Add your first one →
        </a>
      }
    />
  ),
};

export const NoIconNoAction: Story = {
  render: () => (
    <EmptyState
      className="py-12"
      message="No offers yet. Add an offer to start comparing compensation packages."
    />
  ),
};

export const Compact: Story = {
  render: () => (
    <EmptyState
      size="compact"
      className="py-8"
      message="Log an offer on an application to see compensation trends here."
    />
  ),
};
