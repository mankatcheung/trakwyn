import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, type Rendered } from '../__tests__/render';
import { App } from './App';
import { ApiError, getCurrentUser, logout } from '../lib/api';
import { getAuth } from '../lib/storage';

vi.mock('../lib/storage', () => ({
  getAuth: vi.fn(),
  getApiUrl: vi.fn(async () => 'https://api.example.com/graphql'),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    login: vi.fn(),
    logout: vi.fn(),
    createApplication: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
};

let rendered: Rendered | undefined;

beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    tabs: {
      query: vi.fn(async () => [{ id: 1 }]),
      sendMessage: vi.fn(async () => ({ jobData: null })),
    },
  });
  vi.mocked(getAuth).mockResolvedValue({ token: 'tok', expiresAt: Date.now() + 60_000 });
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('popup App', () => {
  it('shows the signed-in user and no API URL', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    rendered = await render(<App />);
    const text = rendered.container.textContent ?? '';

    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).not.toContain('api.example.com');
    expect(text).not.toMatch(/API:/);
    expect(rendered.container.querySelector('input')).toBeNull();
  });

  it('signs out and shows the sign-in form when the token is rejected', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError('Unauthorized', 'UNAUTHORIZED'));

    rendered = await render(<App />);

    expect(logout).toHaveBeenCalledOnce();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
    expect(rendered.container.querySelector('.error-text')).toBeNull();
  });

  it('shows a retryable error for other failures', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError('Network down', 'INTERNAL_ERROR'));

    rendered = await render(<App />);

    expect(logout).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('.error-text')?.textContent).toBe('Network down');
  });

  it('shows the sign-in form without calling the API when signed out', async () => {
    vi.mocked(getAuth).mockResolvedValue(null);

    rendered = await render(<App />);

    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
  });
});
