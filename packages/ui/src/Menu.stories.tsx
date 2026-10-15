import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import {
  ChevronLeftIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
  ZapIcon,
} from 'lucide-react';
import { Menu, type MenuItem } from './Menu';

const meta = {
  title: 'Overlay/Menu',
  component: Menu,
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof Menu>;

const ICON = 16;

/**
 * The case this was built for: a settings row whose actions had grown to four
 * and were collapsing to unlabelled icons on a phone.
 */
export const KeyActions: Story = {
  render: () => (
    <div className="flex justify-end p-8">
      <Menu
        label="Key actions"
        items={[
          { id: 'edit', label: 'Edit monthly limit', icon: <PencilIcon size={ICON} /> },
          { id: 'test', label: 'Test key', icon: <ZapIcon size={ICON} /> },
          { id: 'default', label: 'Make default', icon: <StarIcon size={ICON} /> },
          {
            id: 'remove',
            label: 'Remove key',
            icon: <Trash2Icon size={ICON} />,
            destructive: true,
            separated: true,
          },
        ]}
        onSelect={() => {}}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label="More actions"
            className="flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <EllipsisVerticalIcon size={ICON} />
          </button>
        )}
      />
    </div>
  ),
};

/** A paused key: the recovery action leads, and the rest follow. */
export const PausedKey: Story = {
  render: () => (
    <div className="flex justify-end p-8">
      <Menu
        label="Key actions"
        items={[
          { id: 'raise', label: 'Raise limit & resume', icon: <PencilIcon size={ICON} /> },
          { id: 'test', label: 'Test key', icon: <ZapIcon size={ICON} /> },
          {
            id: 'remove',
            label: 'Remove key',
            icon: <Trash2Icon size={ICON} />,
            destructive: true,
            separated: true,
          },
        ]}
        onSelect={() => {}}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            Actions
          </button>
        )}
      />
    </div>
  ),
};

/** An action that is unavailable rather than absent — skipped by the arrows. */
export const WithDisabledItem: Story = {
  render: () => (
    <div className="p-8">
      <Menu
        label="Row actions"
        align="start"
        items={[
          { id: 'open', label: 'Open' },
          { id: 'duplicate', label: 'Duplicate', disabled: true },
          { id: 'archive', label: 'Archive' },
        ]}
        onSelect={() => {}}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            Actions
          </button>
        )}
      />
    </div>
  ),
};

function TwoPaneDemo() {
  const [pane, setPane] = useState<'actions' | 'status'>('actions');
  const [status, setStatus] = useState('Applied');

  const items: MenuItem[] =
    pane === 'actions'
      ? [
          { id: 'star', label: 'Star', icon: <StarIcon size={ICON} /> },
          { id: 'status', label: 'Change status', keepOpen: true },
          {
            id: 'delete',
            label: 'Delete',
            icon: <Trash2Icon size={ICON} />,
            destructive: true,
            separated: true,
          },
        ]
      : [
          {
            id: 'back',
            label: 'Change status',
            icon: <ChevronLeftIcon size={ICON} />,
            keepOpen: true,
          },
          ...['Applied', 'Interviewing', 'Offer'].map((value) => ({
            id: value,
            label: value,
            current: value === status,
          })),
        ];

  return (
    <div className="flex justify-end p-8">
      <Menu
        label={pane === 'actions' ? 'Actions' : 'Change status'}
        breakpoint="md"
        items={items}
        onClose={() => setPane('actions')}
        onSelect={(id) => {
          if (id === 'status') setPane('status');
          else if (id === 'back') setPane('actions');
          else if (id !== 'star' && id !== 'delete') setStatus(id);
        }}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            aria-label="More actions"
            className="flex size-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <EllipsisVerticalIcon size={20} />
          </button>
        )}
      />
    </div>
  );
}

/**
 * A second pane inside the same menu: the consumer swaps `items` when a
 * `keepOpen` item is chosen, marks the current choice with `current`, and
 * resets the pane from `onClose`. `breakpoint="md"` moves the switch between
 * dropdown and sheet from `sm` (the default) up to `md`.
 */
export const TwoPanes: Story = { render: () => <TwoPaneDemo /> };

/**
 * Below `sm` the same menu opens as a bottom sheet with 52px rows. Narrow the
 * Storybook viewport to see it — the component switches on the viewport, not
 * on a prop.
 */
export const MobileSheet: Story = KeyActions;
