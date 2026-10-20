import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StaleChunkReloader } from '#/components/StaleChunkReloader';

const reload = vi.fn();

describe('StaleChunkReloader', () => {
  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
      configurable: true,
    });
  });

  it('reloads for a failed dynamic import', () => {
    render(
      <StaleChunkReloader
        error={new Error('Failed to fetch dynamically imported module: /assets/applications-x.js')}
      />,
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves other errors alone', () => {
    render(<StaleChunkReloader error={new Error('render blew up')} />);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once, not once per re-render', () => {
    const error = new Error('Importing a module script failed.');
    const { rerender } = render(<StaleChunkReloader error={error} />);
    rerender(<StaleChunkReloader error={error} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not loop when the reload did not fix it', () => {
    const error = new Error('Importing a module script failed.');
    render(<StaleChunkReloader error={error} />);
    render(<StaleChunkReloader error={new Error('Importing a module script failed.')} />);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own', () => {
    const { container } = render(<StaleChunkReloader error={new Error('x')} />);
    expect(container).toBeEmptyDOMElement();
  });
});
