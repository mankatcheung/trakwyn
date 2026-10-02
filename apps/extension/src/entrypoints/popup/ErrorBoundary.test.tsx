import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, type Rendered } from '../../__tests__/render';
import { ErrorBoundary } from './ErrorBoundary';
import { captureException } from '../../lib/observability/report';

vi.mock('../../lib/observability/report', () => ({
  captureException: vi.fn(async () => undefined),
}));

let rendered: Rendered | undefined;

function Broken({ error }: { error: Error }): never {
  throw error;
}

beforeEach(() => {
  vi.mocked(captureException).mockClear();
  // React logs a caught render error; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', async () => {
    rendered = await render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );

    expect(rendered.container.textContent).toBe('All good');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports a render error once and shows a way back', async () => {
    const error = new Error('render failed');

    rendered = await render(
      <ErrorBoundary>
        <Broken error={error} />
      </ErrorBoundary>,
    );

    expect(captureException).toHaveBeenCalledExactlyOnceWith(error, { action: 'render' });
    expect(rendered.container.textContent).toContain('Something went wrong.');
    expect(rendered.container.querySelector('button')?.textContent).toBe('Reload');
    // The error's own message is not shown: it may quote page content.
    expect(rendered.container.textContent).not.toContain('render failed');
  });
});
