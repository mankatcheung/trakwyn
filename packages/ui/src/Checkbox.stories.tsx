import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

const meta = {
  title: 'Forms/Checkbox',
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => (
    <label className="flex items-center gap-2 text-sm text-stone-900 dark:text-stone-100">
      <Checkbox defaultChecked />
      Follow-up reminder emails
    </label>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Checkbox size="md" defaultChecked />
      <Checkbox size="sm" defaultChecked />
    </div>
  ),
};

export const StarToggle: Story = {
  render: () => (
    <label className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-stone-300">
      <Checkbox tone="yellow" defaultChecked />
      Star this application
    </label>
  ),
};
