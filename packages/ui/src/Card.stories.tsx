import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';
import { Button } from './Button';

const meta = {
  title: 'Layout/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="p-4 space-y-3 max-w-sm">
      <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Add a note</p>
      <textarea
        className="w-full h-20 px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 resize-none"
        placeholder="Add a note…"
        readOnly
      />
      <div className="flex justify-end">
        <Button size="sm">Add note</Button>
      </div>
    </Card>
  ),
};

export const ListRow: Story = {
  render: () => (
    <Card className="px-4 py-3 max-w-sm flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Jane Smith</p>
        <p className="text-xs text-stone-500 dark:text-stone-400">Technical Recruiter</p>
      </div>
      <span className="text-xs text-blue-800 dark:text-blue-400">Edit</span>
    </Card>
  ),
};
