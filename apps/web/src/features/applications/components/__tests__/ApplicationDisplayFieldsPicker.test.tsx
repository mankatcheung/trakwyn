import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ApplicationDisplayFieldsPicker } from '#/features/applications/components/ApplicationDisplayFieldsPicker';
import {
  defaultApplicationDisplayFields,
  type ApplicationDisplayField,
  type ApplicationDisplayFields,
} from '#/features/applications/lib/applicationDisplayFields';

// The picker picks its presentation from `(min-width: 640px)`. setup.ts'
// default matchMedia answers `matches: false` (mobile); the desktop tests
// swap in a stub answering true and afterEach restores the default.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })) as unknown as typeof window.matchMedia;
}

const defaultMatchMedia = () => ({
  matches: false,
  media: '',
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

describe('ApplicationDisplayFieldsPicker', () => {
  const fields: ApplicationDisplayFields = defaultApplicationDisplayFields();
  let onToggle: (field: ApplicationDisplayField) => void;
  let toggleMock: Mock<(field: ApplicationDisplayField) => void>;

  beforeEach(() => {
    toggleMock = vi.fn((_field: ApplicationDisplayField) => {});
    onToggle = toggleMock;
  });

  afterEach(() => {
    window.matchMedia = defaultMatchMedia as unknown as typeof window.matchMedia;
    cleanup();
  });

  describe('desktop — anchored popover', () => {
    beforeEach(() => stubMatchMedia(true));

    it('opens a group panel of checkboxes and toggles fields in place', () => {
      render(<ApplicationDisplayFieldsPicker fields={fields} onToggle={onToggle} />);

      const trigger = screen.getByRole('button', { name: 'Choose which details are shown' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(trigger);

      const panel = screen.getByRole('group', { name: 'Details shown' });
      expect(panel).toHaveTextContent('Company is always shown');
      expect(screen.getAllByRole('checkbox')).toHaveLength(7);

      fireEvent.click(screen.getByRole('checkbox', { name: 'Location' }));
      expect(toggleMock).toHaveBeenCalledWith('location');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on pointer-down outside the picker', () => {
      render(<ApplicationDisplayFieldsPicker fields={fields} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole('button', { name: 'Choose which details are shown' }));
      expect(screen.getByRole('group', { name: 'Details shown' })).toBeInTheDocument();

      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole('group', { name: 'Details shown' })).not.toBeInTheDocument();
    });
  });

  describe('mobile — bottom sheet (JEF-232)', () => {
    // No stub needed: jsdom's matchMedia reports no match below sm.

    it('opens a bottom-sheet dialog instead of an anchored popup', () => {
      render(<ApplicationDisplayFieldsPicker fields={fields} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole('button', { name: 'Choose which details are shown' }));

      const sheet = screen.getByRole('dialog', { name: 'Choose which details are shown' });
      expect(sheet).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Details shown' })).not.toBeInTheDocument();
      // Every field is reachable as its own labelled row.
      for (const label of [
        'Role',
        'Location',
        'Date',
        'Tags',
        'Status',
        'Star',
        'Likely ghosted',
      ]) {
        expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
      }
      expect(sheet).toHaveTextContent('Company is always shown');
    });

    it('toggles a field from its sheet row without dismissing the sheet', () => {
      render(<ApplicationDisplayFieldsPicker fields={fields} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole('button', { name: 'Choose which details are shown' }));
      fireEvent.pointerDown(document.body);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Tags' }));

      expect(toggleMock).toHaveBeenCalledWith('tags');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('dismisses via Escape', () => {
      render(<ApplicationDisplayFieldsPicker fields={fields} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole('button', { name: 'Choose which details are shown' }));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('dismisses via backdrop click', () => {
      render(<ApplicationDisplayFieldsPicker fields={fields} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole('button', { name: 'Choose which details are shown' }));
      const overlay = screen.getByRole('dialog').parentElement!;
      fireEvent.click(overlay.querySelector('[aria-hidden="true"]')!);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
