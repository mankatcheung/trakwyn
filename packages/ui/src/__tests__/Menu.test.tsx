import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, type MenuItem } from '../Menu';

/**
 * jsdom ships no `matchMedia`, and the component treats its absence as
 * "narrow" — so every desktop test has to say so explicitly.
 */
function stubViewport(wide: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: wide,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

const ITEMS: MenuItem[] = [
  { id: 'edit', label: 'Edit monthly limit' },
  { id: 'test', label: 'Test key' },
  { id: 'default', label: 'Make default' },
  { id: 'remove', label: 'Remove key', destructive: true, separated: true },
];

function renderMenu(props: Partial<React.ComponentProps<typeof Menu>> = {}) {
  const onSelect = props.onSelect ?? vi.fn();
  render(
    <Menu
      label="Key actions"
      items={props.items ?? ITEMS}
      onSelect={onSelect}
      align={props.align}
      trigger={(triggerProps) => (
        <button type="button" {...triggerProps}>
          More actions
        </button>
      )}
    />,
  );
  return { onSelect };
}

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
};

describe('Menu', () => {
  it('renders only the trigger until opened', () => {
    stubViewport(true);
    renderMenu();

    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('marks the trigger as a menu button and tracks its expanded state', async () => {
    stubViewport(true);
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'More actions' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await openMenu();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows every item with its label', async () => {
    stubViewport(true);
    renderMenu();
    await openMenu();

    expect(screen.getByRole('menu', { name: 'Key actions' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    expect(screen.getByRole('menuitem', { name: 'Remove key' })).toBeInTheDocument();
  });

  it('reports the chosen item and closes', async () => {
    stubViewport(true);
    const { onSelect } = renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: 'Test key' }));

    expect(onSelect).toHaveBeenCalledWith('test');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    stubViewport(true);
    renderMenu();
    await openMenu();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus();
  });

  it('closes when a click lands outside it', async () => {
    stubViewport(true);
    render(<div data-testid="outside">elsewhere</div>);
    renderMenu();
    await openMenu();

    await userEvent.click(screen.getByTestId('outside'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('stays open when a click lands inside it', async () => {
    stubViewport(true);
    renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('menu', { name: 'Key actions' }));

    expect(screen.getByRole('menu', { name: 'Key actions' })).toBeInTheDocument();
  });

  describe('keyboard', () => {
    it('opens on ArrowDown with the first item focused', async () => {
      stubViewport(true);
      renderMenu();
      screen.getByRole('button', { name: 'More actions' }).focus();

      await userEvent.keyboard('{ArrowDown}');

      expect(screen.getByRole('menuitem', { name: 'Edit monthly limit' })).toHaveFocus();
    });

    it('opens on ArrowUp with the last item focused', async () => {
      stubViewport(true);
      renderMenu();
      screen.getByRole('button', { name: 'More actions' }).focus();

      await userEvent.keyboard('{ArrowUp}');

      expect(screen.getByRole('menuitem', { name: 'Remove key' })).toHaveFocus();
    });

    it('moves down the list and wraps at the end', async () => {
      stubViewport(true);
      renderMenu();
      await openMenu();

      await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Remove key' })).toHaveFocus();

      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Edit monthly limit' })).toHaveFocus();
    });

    it('jumps to the ends with Home and End', async () => {
      stubViewport(true);
      renderMenu();
      await openMenu();

      await userEvent.keyboard('{End}');
      expect(screen.getByRole('menuitem', { name: 'Remove key' })).toHaveFocus();

      await userEvent.keyboard('{Home}');
      expect(screen.getByRole('menuitem', { name: 'Edit monthly limit' })).toHaveFocus();
    });

    it('skips a disabled item when moving', async () => {
      stubViewport(true);
      renderMenu({
        items: [
          { id: 'a', label: 'First' },
          { id: 'b', label: 'Second', disabled: true },
          { id: 'c', label: 'Third' },
        ],
      });
      await openMenu();

      await userEvent.keyboard('{ArrowDown}');

      expect(screen.getByRole('menuitem', { name: 'Third' })).toHaveFocus();
    });

    it('closes on Tab without choosing anything', async () => {
      stubViewport(true);
      const { onSelect } = renderMenu();
      await openMenu();

      await userEvent.tab();

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('disabled items', () => {
    it('does not report a disabled item as chosen', async () => {
      stubViewport(true);
      const { onSelect } = renderMenu({
        items: [{ id: 'a', label: 'Unavailable', disabled: true }],
      });
      await openMenu();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Unavailable' }));

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('narrow viewport', () => {
    it('presents the same items as a bottom sheet', async () => {
      stubViewport(false);
      renderMenu();
      await openMenu();

      expect(screen.getByRole('dialog', { name: 'Key actions' })).toBeInTheDocument();
      expect(screen.getAllByRole('menuitem')).toHaveLength(4);
    });

    it('reports the chosen item from the sheet', async () => {
      stubViewport(false);
      const { onSelect } = renderMenu();
      await openMenu();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Make default' }));

      expect(onSelect).toHaveBeenCalledWith('default');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    /** Without matchMedia at all — SSR and older jsdom — the sheet is the safe default. */
    it('falls back to the sheet when matchMedia is unavailable', async () => {
      renderMenu();
      await openMenu();

      expect(screen.getByRole('dialog', { name: 'Key actions' })).toBeInTheDocument();
    });
  });

  describe('escaping a clipping ancestor', () => {
    /**
     * The settings card that hosts this menu sets `overflow-hidden`, which
     * cut an absolutely-positioned dropdown off mid-item. Portalling to the
     * body is what fixes it, so the panel must not live inside the trigger's
     * subtree.
     */
    it('renders the dropdown outside the trigger’s subtree', async () => {
      stubViewport(true);
      const { container } = render(
        <div style={{ overflow: 'hidden' }}>
          <Menu
            label="Key actions"
            items={ITEMS}
            onSelect={vi.fn()}
            trigger={(props) => (
              <button type="button" {...props}>
                More actions
              </button>
            )}
          />
        </div>,
      );

      await openMenu();

      const menu = screen.getByRole('menu', { name: 'Key actions' });
      expect(container).not.toContainElement(menu);
      expect(document.body).toContainElement(menu);
    });

    it('anchors the panel to the viewport rather than to its parent', async () => {
      stubViewport(true);
      renderMenu();

      await openMenu();

      expect(screen.getByRole('menu', { name: 'Key actions' })).toHaveStyle({
        position: 'fixed',
      });
    });

    /**
     * The width came from `min-w-56`, a utility used nowhere in the app, and
     * the app's Tailwind build never scanned this package — so the panel
     * rendered with no width and every label wrapped. It is an inline width
     * now, which no build step can drop.
     */
    it('gives the panel a width that does not depend on the host’s CSS build', async () => {
      stubViewport(true);
      renderMenu();

      await openMenu();

      expect(screen.getByRole('menu', { name: 'Key actions' })).toHaveStyle({ width: '224px' });
    });
  });
  describe('breakpoint', () => {
    /** A viewport of `width` px that answers each `min-width` query honestly. */
    function stubWidth(width: number) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: (query: string) => ({
          matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }),
      });
    }

    const renderAt = (breakpoint?: 'sm' | 'md') =>
      render(
        <Menu
          label="Key actions"
          items={ITEMS}
          breakpoint={breakpoint}
          onSelect={vi.fn()}
          trigger={(triggerProps) => (
            <button type="button" {...triggerProps}>
              More actions
            </button>
          )}
        />,
      );

    it('defaults to switching at sm, so existing menus are unchanged', async () => {
      stubWidth(700);
      renderAt();
      await openMenu();

      expect(screen.getByRole('menu', { name: 'Key actions' })).toHaveStyle({ position: 'fixed' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is a sheet below the md breakpoint when asked to switch at md', async () => {
      stubWidth(700);
      renderAt('md');
      await openMenu();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('is a dropdown from the md breakpoint up when asked to switch at md', async () => {
      stubWidth(768);
      renderAt('md');
      await openMenu();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('menu', { name: 'Key actions' })).toHaveStyle({ position: 'fixed' });
    });
  });

  describe('onClose', () => {
    function renderWithOnClose() {
      const onClose = vi.fn();
      render(
        <div>
          <p>elsewhere</p>
          <Menu
            label="Actions"
            items={ITEMS}
            onSelect={vi.fn()}
            onClose={onClose}
            trigger={(triggerProps) => (
              <button type="button" {...triggerProps}>
                More actions
              </button>
            )}
          />
        </div>,
      );
      return onClose;
    }

    it('is told when an item is chosen', async () => {
      stubViewport(true);
      const onClose = renderWithOnClose();
      await openMenu();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Test key' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is told when Escape closes it', async () => {
      stubViewport(true);
      const onClose = renderWithOnClose();
      await openMenu();

      await userEvent.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is told when a click outside closes it', async () => {
      stubViewport(true);
      const onClose = renderWithOnClose();
      await openMenu();

      await userEvent.click(screen.getByText('elsewhere'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('is not told while it is only opening', async () => {
      stubViewport(true);
      const onClose = renderWithOnClose();
      await openMenu();

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('keepOpen and current', () => {
    const PANES = {
      root: [
        { id: 'star', label: 'Star' },
        { id: 'status', label: 'Change status', keepOpen: true },
      ],
      status: [
        { id: 'back', label: 'Change status', keepOpen: true },
        { id: 'applied', label: 'Applied', current: true },
        { id: 'offer', label: 'Offer' },
      ],
    } satisfies Record<string, MenuItem[]>;

    function Panes({ onSelect }: { onSelect: (id: string) => void }) {
      const [pane, setPane] = useState<keyof typeof PANES>('root');
      return (
        <Menu
          label="Actions"
          items={PANES[pane]}
          onSelect={(id) => {
            if (id === 'status') setPane('status');
            else if (id === 'back') setPane('root');
            else onSelect(id);
          }}
          trigger={(triggerProps) => (
            <button type="button" {...triggerProps}>
              More actions
            </button>
          )}
        />
      );
    }

    it('stays open after a keepOpen item, so the consumer can swap the items', async () => {
      stubViewport(true);
      render(<Panes onSelect={vi.fn()} />);
      await openMenu();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));

      expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Applied' })).toBeInTheDocument();
    });

    it('puts focus on the first item of the new pane', async () => {
      stubViewport(true);
      render(<Panes onSelect={vi.fn()} />);
      await openMenu();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));

      expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
    });

    it('still closes and reports a normal item from the second pane', async () => {
      stubViewport(true);
      const onSelect = vi.fn();
      render(<Panes onSelect={onSelect} />);
      await openMenu();

      await userEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));
      await userEvent.click(screen.getByRole('menuitem', { name: 'Offer' }));

      expect(onSelect).toHaveBeenCalledWith('offer');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('marks the current item for assistive tech and leaves the others unmarked', async () => {
      stubViewport(true);
      render(<Panes onSelect={vi.fn()} />);
      await openMenu();
      await userEvent.click(screen.getByRole('menuitem', { name: 'Change status' }));

      expect(screen.getByRole('menuitem', { name: 'Applied' })).toHaveAttribute(
        'aria-current',
        'true',
      );
      expect(screen.getByRole('menuitem', { name: 'Offer' })).not.toHaveAttribute('aria-current');
    });
  });
});
