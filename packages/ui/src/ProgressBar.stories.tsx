import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressBar } from './ProgressBar';

const meta = {
  title: 'Feedback/ProgressBar',
  component: ProgressBar,
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  render: () => (
    <div className="w-64">
      <ProgressBar value={3} max={5} />
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div className="w-64">
      <ProgressBar value={0} max={5} />
    </div>
  ),
};

export const Complete: Story = {
  render: () => (
    <div className="w-64">
      <ProgressBar value={5} max={5} tone="complete" />
    </div>
  ),
};
