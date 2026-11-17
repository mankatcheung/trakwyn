import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const { mockStart, mockDone } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockDone: vi.fn(),
}));

vi.mock('nprogress', () => ({
  default: {
    configure: vi.fn(),
    start: mockStart,
    done: mockDone,
  },
}));

let mockStatus: string;

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { status: string }) => unknown }) =>
    select({ status: mockStatus }),
}));

const NavigationProgressBar = (
  await import('#/features/app-shell/components/NavigationProgressBar')
).NavigationProgressBar;

describe('NavigationProgressBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus = 'idle';
  });

  it('renders nothing (null)', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<NavigationProgressBar />);
    });
    expect(result!.container.firstChild).toBeNull();
  });

  it('does not call NProgress.start when status is idle', async () => {
    await act(async () => {
      render(<NavigationProgressBar />);
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('calls NProgress.done on unmount', async () => {
    let unmount: () => void;
    await act(async () => {
      ({ unmount } = render(<NavigationProgressBar />));
    });
    await act(async () => {
      unmount!();
    });
    expect(mockDone).toHaveBeenCalled();
  });
});
