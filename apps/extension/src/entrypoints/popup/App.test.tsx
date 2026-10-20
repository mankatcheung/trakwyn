import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { render, type Rendered } from '../../__tests__/render';
import { App } from './App';
import { ApiError, getCurrentUser, login, logout } from '../../lib/api';
import { getAuth, getPersistedRefreshToken } from '../../lib/storage';
import { captureEvent, captureException } from '../../lib/observability/report';

vi.mock('../../lib/storage', () => ({
  getAuth: vi.fn(),
  getPersistedRefreshToken: vi.fn(async () => null),
  getApiUrl: vi.fn(async () => 'https://api.example.com/graphql'),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    login: vi.fn(),
    logout: vi.fn(),
    createApplication: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

vi.mock('../../lib/observability/report', () => ({
  captureEvent: vi.fn(async () => undefined),
  captureException: vi.fn(async () => undefined),
}));

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
};

let rendered: Rendered | undefined;

/**
 * `browser.*` methods are overloaded (promise and callback forms), and
 * `vi.spyOn` types them by the last, callback one. The popup uses the promise form.
 */
type AsyncSpy = MockInstance<(...args: unknown[]) => Promise<unknown>>;

function spyAsync<T extends object>(target: T, method: keyof T & string): AsyncSpy {
  return vi.spyOn(target, method as never) as unknown as AsyncSpy;
}

let runtimeSendMessage: AsyncSpy;

beforeEach(() => {
  fakeBrowser.reset();
  runtimeSendMessage = spyAsync(browser.runtime, 'sendMessage').mockResolvedValue(undefined);
  spyAsync(browser.tabs, 'query').mockResolvedValue([{ id: 1 } as Browser.tabs.Tab]);
  spyAsync(browser.tabs, 'sendMessage').mockResolvedValue({ jobData: null });
  vi.mocked(getAuth).mockResolvedValue({
    token: 'tok',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 10 * 60_000,
  });
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
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
    runtimeSendMessage.mockResolvedValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    rendered = await render(<App />);

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'REFRESH_TOKEN' });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('shows the sign-in form when an expired session cannot be renewed', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    runtimeSendMessage.mockResolvedValue(false);

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
    runtimeSendMessage.mockResolvedValue({ ok: true });
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    rendered = await render(<App />);

    await click(providerButton('GitHub'));

    expect(runtimeSendMessage).toHaveBeenCalledWith({
      type: 'OAUTH_LOGIN',
      provider: 'github',
      keepSignedIn: false,
    });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('returns to the sign-in screen with no error when the user cancels', async () => {
    runtimeSendMessage.mockResolvedValue({ ok: false, cancelled: true });
    rendered = await render(<App />);

    await click(providerButton('Google'));

    expect(rendered.container.querySelector('.error-box')).toBeNull();
    expect(providerButton('Google').disabled).toBe(false);
  });

  it('shows the error when the sign-in fails', async () => {
    runtimeSendMessage.mockResolvedValue({
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

describe('popup App — Keep me signed in (JEF-421)', () => {
  beforeEach(() => {
    vi.mocked(getAuth).mockResolvedValue(null);
    vi.mocked(getPersistedRefreshToken).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.mocked(getPersistedRefreshToken).mockResolvedValue(null);
  });

  function keepSignedInBox(): HTMLInputElement {
    const box = rendered!.container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!box) throw new Error('No Keep me signed in checkbox');
    return box;
  }

  async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('offers an unticked "Keep me signed in" box on the sign-in screen', async () => {
    rendered = await render(<App />);

    expect(rendered.container.textContent).toContain('Keep me signed in');
    expect(keepSignedInBox().checked).toBe(false);
  });

  it('keeps the session in memory only when the box is left unticked', async () => {
    vi.mocked(login).mockResolvedValue(undefined);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    rendered = await render(<App />);
    await type(rendered.container.querySelector('input[type="email"]')!, 'ada@example.com');
    await type(rendered.container.querySelector('input[type="password"]')!, 'pw');

    await act(async () => {
      rendered!.container.querySelector('form')!.requestSubmit();
    });

    expect(login).toHaveBeenCalledWith('ada@example.com', 'pw', false);
  });

  it('passes a ticked box to the password sign-in', async () => {
    vi.mocked(login).mockResolvedValue(undefined);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    rendered = await render(<App />);
    await act(async () => {
      keepSignedInBox().click();
    });
    await type(rendered.container.querySelector('input[type="email"]')!, 'ada@example.com');
    await type(rendered.container.querySelector('input[type="password"]')!, 'pw');

    await act(async () => {
      rendered!.container.querySelector('form')!.requestSubmit();
    });

    expect(login).toHaveBeenCalledWith('ada@example.com', 'pw', true);
  });

  it('passes a ticked box to the Google/GitHub sign-in', async () => {
    runtimeSendMessage.mockResolvedValue({ ok: true });
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    rendered = await render(<App />);
    await act(async () => {
      keepSignedInBox().click();
    });

    await act(async () => {
      [...rendered!.container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Continue with Google')!
        .click();
    });

    expect(runtimeSendMessage).toHaveBeenCalledWith({
      type: 'OAUTH_LOGIN',
      provider: 'google',
      keepSignedIn: true,
    });
  });

  it('restores a persisted session through the background worker after a browser restart', async () => {
    vi.mocked(getPersistedRefreshToken).mockResolvedValue('persisted-refresh');
    runtimeSendMessage.mockResolvedValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    rendered = await render(<App />);

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'REFRESH_TOKEN' });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('shows the sign-in form when the persisted session cannot be restored', async () => {
    vi.mocked(getPersistedRefreshToken).mockResolvedValue('persisted-refresh');
    runtimeSendMessage.mockResolvedValue(false);

    rendered = await render(<App />);

    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('does not ask the background to restore when nothing is persisted', async () => {
    rendered = await render(<App />);

    expect(runtimeSendMessage).not.toHaveBeenCalled();
  });
});

describe('popup App — error reporting (JEF-387)', () => {
  it('reports a job board page the parsers could not read', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    spyAsync(browser.tabs, 'sendMessage').mockResolvedValue({
      jobData: null,
      parserHealth: {
        board: 'linkedin',
        onJobPage: true,
        parser: 'none',
        siteParserFailed: true,
        missingFields: ['company', 'role', 'description'],
      },
    });

    rendered = await render(<App />);

    expect(captureEvent).toHaveBeenCalledExactlyOnceWith('parser_result', {
      board: 'linkedin',
      parser: 'none',
      site_parser_failed: true,
      missing_fields: ['company', 'role', 'description'],
    });
  });

  it('reports nothing for a healthy parse, and none of the job itself', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    spyAsync(browser.tabs, 'sendMessage').mockResolvedValue({
      jobData: { company: 'Monument', role: 'Engineer', jobUrl: 'https://example.com/1' },
      parserHealth: {
        board: 'linkedin',
        onJobPage: true,
        parser: 'linkedin',
        siteParserFailed: false,
        missingFields: ['description'],
      },
    });

    rendered = await render(<App />);

    expect(rendered.container.textContent).toContain('Monument');
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it('reports a failure it did not expect', async () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'id')");
    vi.mocked(getCurrentUser).mockRejectedValue(bug);

    rendered = await render(<App />);

    expect(captureException).toHaveBeenCalledExactlyOnceWith(bug, { action: 'load_account' });
    expect(rendered.container.querySelector('.error-text')).not.toBeNull();
  });

  it('does not report the API saying no', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new ApiError('Boom', 'INTERNAL_ERROR'));

    rendered = await render(<App />);

    expect(captureException).not.toHaveBeenCalled();
  });
});
