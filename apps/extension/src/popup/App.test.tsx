import { act } from 'react';
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
    runtime: {
      getURL: (path: string) => `chrome-extension://id/${path}`,
      sendMessage: vi.fn(),
    },
    tabs: {
      query: vi.fn(async () => [{ id: 1 }]),
      sendMessage: vi.fn(async () => ({ jobData: null })),
    },
  });
  vi.mocked(getAuth).mockResolvedValue({
    token: 'tok',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 10 * 60_000,
  });
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

  it('renews an expired session through the background worker before loading', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    rendered = await render(<App />);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'REFRESH_TOKEN' });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('shows the sign-in form when an expired session cannot be renewed', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(false);

    rendered = await render(<App />);

    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
  });
});

describe('popup App — Google and GitHub sign-in (JEF-383)', () => {
  beforeEach(() => {
    vi.mocked(getAuth).mockResolvedValue(null);
  });

  function providerButton(label: string): HTMLButtonElement {
    const button = [...rendered!.container.querySelectorAll('button')].find(
      (b) => b.textContent === `Continue with ${label}`,
    );
    if (!button) throw new Error(`No ${label} button`);
    return button;
  }

  async function click(button: HTMLButtonElement) {
    await act(async () => {
      button.click();
    });
  }

  it('offers both providers on the sign-in screen', async () => {
    rendered = await render(<App />);

    expect(providerButton('Google')).toBeTruthy();
    expect(providerButton('GitHub')).toBeTruthy();
  });

  it('asks the background worker to run the sign-in, then loads the account', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: true });
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    rendered = await render(<App />);

    await click(providerButton('GitHub'));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OAUTH_LOGIN',
      provider: 'github',
    });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('returns to the sign-in screen with no error when the user cancels', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: false, cancelled: true });
    rendered = await render(<App />);

    await click(providerButton('Google'));

    expect(rendered.container.querySelector('.error-box')).toBeNull();
    expect(providerButton('Google').disabled).toBe(false);
  });

  it('shows the error when the sign-in fails', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      ok: false,
      cancelled: false,
      error: 'That linked account no longer exists.',
    });
    rendered = await render(<App />);

    await click(providerButton('Google'));

    expect(rendered.container.querySelector('.error-box')?.textContent).toBe(
      'That linked account no longer exists.',
    );
  });
});
