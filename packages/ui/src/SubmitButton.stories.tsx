import { useActionState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SubmitButton } from './SubmitButton';

const meta = {
  title: 'Actions/SubmitButton',
  component: SubmitButton,
} satisfies Meta<typeof SubmitButton>;

export default meta;
type Story = StoryObj<typeof SubmitButton>;

function SlowForm() {
  const [count, action] = useActionState(async (n: number) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return n + 1;
  }, 0);
  return (
    <form action={action} className="flex items-center gap-3">
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      <span className="text-sm text-gray-500">Saved {count} times</span>
    </form>
  );
}

/** Click Save: the button disables itself and shows a spinner for 1.5 s. */
export const Default: Story = {
  render: () => <SlowForm />,
};

export const Pending: Story = {
  render: () => (
    <SubmitButton pending pendingLabel="Saving…">
      Save
    </SubmitButton>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <SubmitButton pending>Primary</SubmitButton>
      <SubmitButton pending variant="secondary">
        Secondary
      </SubmitButton>
      <SubmitButton pending variant="destructive">
        Destructive
      </SubmitButton>
    </div>
  ),
};
