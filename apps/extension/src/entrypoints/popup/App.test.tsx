import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { render, type Rendered } from '../../__tests__/render';
import { App } from './App';
import { DEFAULT_API_URL, DEFAULT_WEB_URL } from '../../constants';
import {
  ApiError,
  createApplication,
  getPopupBootstrap,
  login,
  logout,
  parseJobDescription,
} from '../../lib/api';
import { getAuth, getCachedUser, getPersistedRefreshToken, setCachedUser } from '../../lib/storage';
import { captureEvent, captureException } from '../../lib/observability/report';

vi.mock('../../lib/storage', () => ({
  getAuth: vi.fn(),
  getPersistedRefreshToken: vi.fn(async () => null),
  getCachedUser: vi.fn(async () => null),
  setCachedUser: vi.fn(async () => undefined),
}));

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return {
    ...actual,
    login: vi.fn(),
    logout: vi.fn(),
    createApplication: vi.fn(),
    getPopupBootstrap: vi.fn(),
    parseJobDescription: vi.fn(),
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

/** The API's answer as the popup opens. */
function signedIn(aiAvailable = false) {
  vi.mocked(getPopupBootstrap).mockResolvedValue({ user, aiAvailable });
}

let rendered: Rendered | undefined;

/**
 * `browser.*` methods are overloaded (promise and callback forms), and
 * `vi.spyOn` types them by the last, callback one. The popup uses the promise form.
 */
type AsyncSpy = MockInstance<(...args: unknown[]) => Promise<unknown>>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

/** A promise the test settles, to hold the popup at "the API has not answered yet". */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    signedIn();

    rendered = await render(<App />);
    const text = rendered.container.textContent ?? '';

    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).not.toContain(DEFAULT_API_URL);
    expect(text).not.toMatch(/API:/);
    expect(rendered.container.querySelector('input')).toBeNull();
  });

  it('signs out and shows the sign-in form when the token is rejected', async () => {
    vi.mocked(getPopupBootstrap).mockRejectedValue(new ApiError('Unauthorized', 'UNAUTHORIZED'));

    rendered = await render(<App />);

    expect(logout).toHaveBeenCalledOnce();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
    expect(rendered.container.querySelector('.error-text')).toBeNull();
  });

  it('shows a retryable error for other failures', async () => {
    vi.mocked(getPopupBootstrap).mockRejectedValue(new ApiError('Network down', 'INTERNAL_ERROR'));

    rendered = await render(<App />);

    expect(logout).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('.error-text')?.textContent).toBe('Network down');
  });

  it('shows the sign-in form without calling the API when signed out', async () => {
    vi.mocked(getAuth).mockResolvedValue(null);

    rendered = await render(<App />);

    expect(getPopupBootstrap).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('renews an expired session through the background worker before loading', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    runtimeSendMessage.mockResolvedValue(true);
    signedIn();

    rendered = await render(<App />);

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'REFRESH_TOKEN' });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('shows the sign-in form when an expired session cannot be renewed', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    runtimeSendMessage.mockResolvedValue(false);

    rendered = await render(<App />);

    expect(getPopupBootstrap).not.toHaveBeenCalled();
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
    signedIn();
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
    signedIn();
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
    signedIn();
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
    signedIn();
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
    signedIn();

    rendered = await render(<App />);

    expect(runtimeSendMessage).toHaveBeenCalledWith({ type: 'REFRESH_TOKEN' });
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('shows the sign-in form when the persisted session cannot be restored', async () => {
    vi.mocked(getPersistedRefreshToken).mockResolvedValue('persisted-refresh');
    runtimeSendMessage.mockResolvedValue(false);

    rendered = await render(<App />);

    expect(getPopupBootstrap).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('does not ask the background to restore when nothing is persisted', async () => {
    rendered = await render(<App />);

    expect(runtimeSendMessage).not.toHaveBeenCalled();
  });
});

describe('popup App — error reporting (JEF-387)', () => {
  it('reports a job board page the parsers could not read', async () => {
    signedIn();
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
    signedIn();
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
    vi.mocked(getPopupBootstrap).mockRejectedValue(bug);

    rendered = await render(<App />);

    expect(captureException).toHaveBeenCalledExactlyOnceWith(bug, { action: 'load_account' });
    expect(rendered.container.querySelector('.error-text')).not.toBeNull();
  });

  it('does not report the API saying no', async () => {
    vi.mocked(getPopupBootstrap).mockRejectedValue(new ApiError('Boom', 'INTERNAL_ERROR'));

    rendered = await render(<App />);

    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('popup App — AI parsing (JEF-420)', () => {
  const tabUrl = 'https://jobs.example.com/1';
  const complete = { company: 'Monument', role: 'Engineer', jobUrl: tabUrl };

  beforeEach(() => {
    vi.mocked(parseJobDescription).mockReset();
  });

  /** The content script answers job data and page text; `jobData` null means the parsers found nothing. */
  function pageWith(jobData: unknown, aiAvailable = true) {
    spyAsync(browser.tabs, 'query').mockResolvedValue([{ id: 1, url: tabUrl } as Browser.tabs.Tab]);
    spyAsync(browser.tabs, 'sendMessage').mockImplementation(async (_id, message) =>
      (message as { type: string }).type === 'GET_PAGE_TEXT' ? 'Posting text' : { jobData },
    );
    signedIn(aiAvailable);
  }

  const button = (label: string) =>
    [...rendered!.container.querySelectorAll('button')].find((b) => b.textContent === label);

  const field = (id: string) => rendered!.container.querySelector<HTMLInputElement>(`#${id}`)!;

  it('shows the built-in result and sends nothing to the AI until asked', async () => {
    pageWith(complete);

    rendered = await render(<App />);

    expect(parseJobDescription).not.toHaveBeenCalled();
    expect(rendered.container.textContent).toContain('Monument');
    expect(button('Read with parser')!.disabled).toBe(false);
    expect(button('Read with AI')!.disabled).toBe(false);
  });

  it('disables "Read with AI" and links to settings when there is no default AI key', async () => {
    pageWith(complete, false);

    rendered = await render(<App />);

    expect(button('Read with AI')!.disabled).toBe(true);
    expect(button('Read with parser')!.disabled).toBe(false);
    expect(
      rendered.container.querySelector<HTMLAnchorElement>('a[href$="/settings/ai"]'),
    ).not.toBeNull();
  });

  it('keeps "Read with AI" disabled, with no settings link, while the check runs (JEF-457)', async () => {
    pageWith(complete);
    const answer = deferred<{ user: typeof user; aiAvailable: boolean }>();
    vi.mocked(getPopupBootstrap).mockReturnValue(answer.promise);

    rendered = await render(<App />);

    expect(button('Read with AI')!.disabled).toBe(true);
    expect(button('Read with AI')!.getAttribute('aria-busy')).toBe('true');
    expect(button('Read with parser')!.disabled).toBe(false);
    expect(rendered.container.querySelector('a[href$="/settings/ai"]')).toBeNull();

    await act(async () => answer.resolve({ user, aiAvailable: true }));

    expect(button('Read with AI')!.disabled).toBe(false);
  });

  it('reads the page with the AI when asked, and lets the user edit it', async () => {
    pageWith(null);
    vi.mocked(parseJobDescription).mockResolvedValue({
      company: 'Globex',
      role: 'Designer',
      location: null,
      description: null,
    });

    rendered = await render(<App />);
    await act(async () => button('Read with AI')!.click());

    expect(parseJobDescription).toHaveBeenCalledExactlyOnceWith('Posting text');
    expect(field('clip-company').value).toBe('Globex');
    expect(field('clip-role').value).toBe('Designer');
  });

  it('lets the AI answer replace the built-in one', async () => {
    pageWith(complete);
    vi.mocked(parseJobDescription).mockResolvedValue({
      company: 'Globex',
      role: 'Staff Engineer',
      location: null,
      description: null,
    });

    rendered = await render(<App />);
    await act(async () => button('Read with AI')!.click());

    expect(field('clip-role').value).toBe('Staff Engineer');
    expect(field('clip-company').value).toBe('Globex');
  });

  it('keeps the clip and says why when the AI fails', async () => {
    pageWith(complete);
    vi.mocked(parseJobDescription).mockRejectedValue(
      new ApiError('Add your AI provider key in Trakwyn settings.', 'AI_NOT_CONFIGURED'),
    );

    rendered = await render(<App />);
    await act(async () => button('Read with AI')!.click());

    expect(rendered.container.querySelector('[role="status"]')?.textContent).toContain(
      'AI provider key',
    );
    expect(rendered.container.textContent).toContain('Monument');
    expect(button('Read with AI')!.disabled).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('"Read with parser" drops the AI result and reads the page again', async () => {
    pageWith(complete);
    vi.mocked(parseJobDescription).mockResolvedValue({
      company: 'Globex',
      role: 'Staff Engineer',
      location: null,
      description: null,
    });

    rendered = await render(<App />);
    await act(async () => button('Read with AI')!.click());
    await act(async () => button('Read with parser')!.click());

    expect(rendered.container.textContent).toContain('Monument');
    expect(rendered.container.querySelector('#clip-role')).toBeNull();
  });
});

describe('popup App — links to the web app (JEF-428)', () => {
  const tabUrl = 'https://jobs.example.com/1';

  beforeEach(() => {
    spyAsync(browser.tabs, 'query').mockResolvedValue([{ id: 1, url: tabUrl } as Browser.tabs.Tab]);
    spyAsync(browser.tabs, 'sendMessage').mockResolvedValue({
      jobData: { company: 'Monument', role: 'Engineer', jobUrl: tabUrl },
    });
    signedIn();
    vi.mocked(createApplication).mockResolvedValue({
      id: 'app-1',
      company: 'Monument',
      role: 'Engineer',
      status: 'APPLIED',
    } as Awaited<ReturnType<typeof createApplication>>);
  });

  it('opens the saved application on the web app, not the API host', async () => {
    rendered = await render(<App />);
    const save = [...rendered.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Save as Application',
    )!;
    await act(async () => save.click());

    const link = [...rendered.container.querySelectorAll('a')].find((a) =>
      a.textContent?.startsWith('Open application'),
    );
    expect(link?.getAttribute('href')).toBe(`${DEFAULT_WEB_URL}/applications/app-1`);
  });

  it('links to AI settings on the web app', async () => {
    rendered = await render(<App />);

    expect(rendered.container.querySelector('a[href$="/settings/ai"]')?.getAttribute('href')).toBe(
      `${DEFAULT_WEB_URL}/settings/ai`,
    );
  });
});

describe('popup App — showing the clip before the API answers (JEF-457)', () => {
  const tabUrl = 'https://jobs.example.com/1';
  let answer: Deferred<{ user: typeof user; aiAvailable: boolean }>;

  beforeEach(() => {
    spyAsync(browser.tabs, 'query').mockResolvedValue([{ id: 1, url: tabUrl } as Browser.tabs.Tab]);
    spyAsync(browser.tabs, 'sendMessage').mockResolvedValue({
      jobData: { company: 'Monument', role: 'Engineer', jobUrl: tabUrl },
    });
    answer = deferred();
    vi.mocked(getPopupBootstrap).mockReturnValue(answer.promise);
  });

  const saveButton = () =>
    [...rendered!.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Save as Application',
    )!;

  it('shows the parsed clip while the account request is still pending', async () => {
    rendered = await render(<App />);

    expect(rendered.container.textContent).toContain('Monument');
    expect(rendered.container.textContent).toContain('Engineer');
    expect(rendered.container.querySelector('.spinner')).toBeNull();
    expect(rendered.container.querySelector('[aria-label="Loading your account"]')).not.toBeNull();
  });

  it('keeps Save disabled until the API confirms the user', async () => {
    rendered = await render(<App />);
    expect(saveButton().disabled).toBe(true);

    await act(async () => answer.resolve({ user, aiAvailable: false }));

    expect(saveButton().disabled).toBe(false);
    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('asks the API once as it opens', async () => {
    rendered = await render(<App />);
    await act(async () => answer.resolve({ user, aiAvailable: false }));

    expect(getPopupBootstrap).toHaveBeenCalledOnce();
  });

  it('shows the cached user at once, then the API answer in its place', async () => {
    vi.mocked(getCachedUser).mockResolvedValueOnce({ ...user, name: 'Ada (cached)' });

    rendered = await render(<App />);
    expect(rendered.container.querySelector('.user-name')?.textContent).toBe('Ada (cached)');
    expect(saveButton().disabled).toBe(true);

    await act(async () => answer.resolve({ user, aiAvailable: false }));

    expect(rendered.container.querySelector('.user-name')?.textContent).toBe('Ada Lovelace');
    expect(setCachedUser).toHaveBeenCalledExactlyOnceWith(user);
  });

  it('ends on sign-in, not the cached user, when the API rejects the session', async () => {
    vi.mocked(getCachedUser).mockResolvedValueOnce(user);

    rendered = await render(<App />);
    await act(async () => answer.reject(new ApiError('Unauthorized', 'UNAUTHORIZED')));

    expect(logout).toHaveBeenCalledOnce();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
    expect(rendered.container.textContent).not.toContain('Ada Lovelace');
    expect(setCachedUser).not.toHaveBeenCalled();
  });

  it('shows the clip while an expired session is renewed, then loads the account', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    const renewal = deferred<boolean>();
    runtimeSendMessage.mockReturnValue(renewal.promise);

    rendered = await render(<App />);

    expect(rendered.container.textContent).toContain('Monument');
    expect(getPopupBootstrap).not.toHaveBeenCalled();

    await act(async () => renewal.resolve(true));
    await act(async () => answer.resolve({ user, aiAvailable: false }));

    expect(rendered.container.textContent).toContain('Ada Lovelace');
  });

  it('goes to sign-in when the expired session cannot be renewed', async () => {
    vi.mocked(getAuth).mockResolvedValue({ token: 'tok', refreshToken: 'r', expiresAt: 0 });
    const renewal = deferred<boolean>();
    runtimeSendMessage.mockReturnValue(renewal.promise);

    rendered = await render(<App />);
    await act(async () => renewal.resolve(false));

    expect(getPopupBootstrap).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('stays signed out when the account answers after the user signed out', async () => {
    rendered = await render(<App />);
    const signOut = [...rendered.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Sign out',
    )!;
    await act(async () => signOut.click());

    await act(async () => answer.resolve({ user, aiAvailable: true }));

    expect(rendered.container.querySelector('input[type="password"]')).not.toBeNull();
    expect(setCachedUser).not.toHaveBeenCalled();
  });
});
