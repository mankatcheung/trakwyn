import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './Spinner';
import { Button } from './Button';

const meta = {
  title: 'Feedback/Spinner',
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {
  render: () => <Spinner />,
};

export const InlineWithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm text-stone-400">
      <Spinner />
      Generating…
    </div>
  ),
};

export const InsideAButton: Story = {
  render: () => (
    <Button disabled className="flex items-center gap-2">
      <Spinner tone="white" />
      Signing in…
    </Button>
  ),
};

export const StandaloneMd: Story = {
  render: () => (
    <div className="flex justify-center py-4 text-stone-400">
      <Spinner size="md" />
    </div>
  ),
};
