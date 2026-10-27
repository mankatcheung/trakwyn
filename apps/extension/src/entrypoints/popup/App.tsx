import { useState, useEffect, useRef } from 'react';
import { browser } from 'wxt/browser';
import { getAuth, getCachedUser, getPersistedRefreshToken, setCachedUser } from '../../lib/storage';
import {
  ApiError,
  login,
  logout,
  createApplication,
  getPopupBootstrap,
  isUnauthorizedError,
  type CurrentUser,
  type PopupBootstrap,
} from '../../lib/api';
import type { JobData, ParsedJobPage } from '../../lib/parsers/types';
import { parserHealthProperties } from '../../lib/parsers/health';
import { readTabWithAi } from '../../lib/aiRead';
import { captureEvent, captureException } from '../../lib/observability/report';
import { markSinceOpen, timed } from '../../lib/startupTiming';
import type { OAuthLoginResponse } from '../background';
import {
  CONTENT_MESSAGES,
  DEFAULT_WEB_URL,
  OAUTH_PROVIDERS,
  OBSERVABILITY_EVENTS,
  REFRESH_LEEWAY_MS,
  RUNTIME_MESSAGES,
  type OAuthProvider,
} from '../../constants';
import { UserHeader } from './UserHeader';
import { ClipCard } from './ClipCard';
import { ReadButtons, type AiAvailability, type ReadMethod } from './ReadButtons';

interface ReadyScreen {
  type: 'ready';
  clip: Clip;
  /** Where the user adds the AI key that "Read with AI" needs. */
  settingsUrl: string;
}

type Screen =
  | { type: 'loading'; message?: string }
  | { type: 'login'; error?: string }
  | ReadyScreen
  | { type: 'saving' }
  | { type: 'saved'; appId: string; appUrl: string; company: string; role: string }
  | { type: 'error'; message: string };

/** The tab being clipped. Absent when the page has no content script. */
interface ClipTab {
  id: number;
  url: string;
}

interface Clip {
  /** What the clip shows: the built-in result, or that merged with the AI's. */
  jobData: JobData | null;
  /** The built-in parser's result, which an AI read is merged into. */
  builtin: JobData | null;
  tab: ClipTab | null;
  /** The AI changed or filled part of the clip, so the user confirms it before saving. */
  aiSuggested: boolean;
  /** Which read is running. */
  busy: ReadMethod | null;
  /** Counts reads, so a new result starts the editable draft over. */
  readId: number;
  /** Dismissible: why the AI result is missing. */
  notice?: string;
}

async function readActiveTab(): Promise<{ jobData: JobData | null; tab: ClipTab | null }> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { jobData: null, tab: null };
  try {
    const response: Partial<ParsedJobPage> | undefined = await browser.tabs.sendMessage(tab.id, {
      type: CONTENT_MESSAGES.GET_JOB_DATA,
    });
    // A job board whose markup changed shows up as a spike of these (JEF-387).
    const unhealthy = response?.parserHealth && parserHealthProperties(response.parserHealth);
    if (unhealthy) void captureEvent(OBSERVABILITY_EVENTS.PARSER_RESULT, { ...unhealthy });
    return {
      // The generic parser can leave `company` undefined despite its type
      jobData: response?.jobData
        ? {
            ...response.jobData,
            company: response.jobData.company ?? '',
            role: response.jobData.role ?? '',
          }
        : null,
      tab: tab.url ? { id: tab.id, url: tab.url } : null,
    };
  } catch {
    // No content script on this page — there's no job data to clip
    return { jobData: null, tab: null };
  }
}

/**
 * Asks the AI to read the tab and merges its answer into the built-in result
 * (JEF-420). A failure keeps the clip and says why, never a dead end.
 */
async function readWithAi(clip: Clip): Promise<Clip> {
  if (!clip.tab) return { ...clip, busy: null };
  try {
    const { jobData, filled } = await readTabWithAi(clip.tab.id, clip.tab.url, clip.builtin);
    return {
      ...clip,
      jobData,
      aiSuggested: filled.length > 0,
      busy: null,
      readId: clip.readId + 1,
    };
  } catch (err) {
    reportUnexpected(err, 'ai_read');
    const notice = err instanceof Error ? err.message : 'The AI read failed.';
    return { ...clip, busy: null, notice };
  }
}

/** Runs the built-in parser again, dropping any AI result. */
async function readWithParser(clip: Clip): Promise<Clip> {
  const { jobData } = await readActiveTab();
  return {
    ...clip,
    jobData,
    builtin: jobData,
    aiSuggested: false,
    busy: null,
    readId: clip.readId + 1,
  };
}

/**
 * Reports a failure the popup did not expect (JEF-387). An `ApiError` is the
 * API answering (a wrong password, a validation message), and an unreachable
 * API was already reported by `gql`, which `captureException` knows.
 */
function reportUnexpected(err: unknown, action: string): void {
  if (!(err instanceof ApiError)) void captureException(err, { action });
}

/**
 * Who is signed in. The clip shows before the API answers (JEF-457), so this
 * fills in afterwards, from the session's cached user first.
 */
interface Account {
  user: CurrentUser | null;
  /** The API has answered for this session; until then nothing can be saved. */
  confirmed: boolean;
  /** The user has a default AI provider with a saved key (JEF-420). */
  aiAvailable: AiAvailability;
}

const UNCONFIRMED: Account = { user: null, confirmed: false, aiAvailable: 'checking' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'loading' });
  const [account, setAccount] = useState<Account>(UNCONFIRMED);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oauthPending, setOAuthPending] = useState<OAuthProvider | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  // Each load bumps this, so an answer to a superseded one (the user signed
  // out meanwhile) is dropped.
  const loadId = useRef(0);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const [auth, persisted] = await timed('storage', () =>
      Promise.all([getAuth(), getPersistedRefreshToken()]),
    );
    // An expired access token is renewed by the background worker, which owns
    // the rotating refresh token (JEF-383). After a browser restart the session
    // is gone, but a "Keep me signed in" token may restore it (JEF-421).
    const needsRefresh = auth ? Date.now() > auth.expiresAt - REFRESH_LEEWAY_MS : !!persisted;
    if (!auth && !needsRefresh) {
      setScreen({ type: 'login' });
      return;
    }
    // Only the API call waits for the refresh; the clip shows meanwhile.
    const session = needsRefresh
      ? timed('refresh', (): Promise<boolean> =>
          browser.runtime.sendMessage({ type: RUNTIME_MESSAGES.REFRESH_TOKEN }),
        )
      : Promise.resolve(true);
    await loadReadyScreen(session);
  }

  /**
   * Shows the clip from the local parser at once, with the cached user if
   * there is one, then confirms the account with one API request (JEF-457).
   * `session` resolves false when the stored session could not be renewed.
   */
  async function loadReadyScreen(session: Promise<boolean> = Promise.resolve(true)) {
    const id = ++loadId.current;
    const superseded = () => id !== loadId.current;
    const bootstrap: Promise<PopupBootstrap | null> = session.then((ok) =>
      ok ? timed('bootstrap', getPopupBootstrap) : null,
    );
    // Awaited below; this keeps a rejection that lands first from being
    // reported as unhandled.
    bootstrap.catch(() => undefined);

    const [read, cachedUser] = await Promise.all([
      timed('readActiveTab', readActiveTab),
      getCachedUser().catch(() => null),
    ]);
    if (superseded()) return;
    setAccount({ ...UNCONFIRMED, user: cachedUser });
    setScreen({
      type: 'ready',
      clip: {
        jobData: read.jobData,
        builtin: read.jobData,
        tab: read.tab,
        aiSuggested: false,
        busy: null,
        readId: 0,
      },
      settingsUrl: `${DEFAULT_WEB_URL}/settings/ai`,
    });
    markSinceOpen('clip-shown');

    try {
      const result = await bootstrap;
      if (superseded()) return;
      if (!result) {
        // The background could not renew the session and has cleared it
        setScreen({ type: 'login' });
        return;
      }
      setAccount({ user: result.user, confirmed: true, aiAvailable: result.aiAvailable });
      markSinceOpen('account-confirmed');
      await setCachedUser(result.user).catch((err: unknown) => reportUnexpected(err, 'cache_user'));
    } catch (err) {
      if (superseded()) return;
      if (isUnauthorizedError(err)) {
        // The stored token was revoked or rejected — start over at sign-in
        await logout();
        setScreen({ type: 'login' });
        return;
      }
      reportUnexpected(err, 'load_account');
      setScreen({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load your account',
      });
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password, keepSignedIn);
      await loadReadyScreen();
    } catch (err) {
      reportUnexpected(err, 'login');
      setScreen({ type: 'login', error: err instanceof Error ? err.message : 'Login failed' });
    }
  }

  async function handleOAuthLogin(provider: OAuthProvider) {
    setOAuthPending(provider);
    try {
      // Run by the background worker: this popup closes when the sign-in
      // window opens, and the worker stores the session either way.
      const result: OAuthLoginResponse = await browser.runtime.sendMessage({
        type: RUNTIME_MESSAGES.OAUTH_LOGIN,
        provider,
        keepSignedIn,
      });
      if (result.ok) {
        await loadReadyScreen();
      } else {
        setScreen({ type: 'login', error: result.cancelled ? undefined : result.error });
      }
    } finally {
      setOAuthPending(null);
    }
  }

  async function handleLogout() {
    loadId.current++;
    await logout();
    setScreen({ type: 'login' });
  }

  /** Replaces the clip, unless the popup has left the ready screen meanwhile. */
  function updateClip(clip: Clip) {
    setScreen((current) => (current.type === 'ready' ? { ...current, clip } : current));
  }

  async function handleRead(clip: Clip, method: ReadMethod) {
    updateClip({ ...clip, busy: method, notice: undefined });
    updateClip(method === 'ai' ? await readWithAi(clip) : await readWithParser(clip));
  }

  async function handleSave(jobData: JobData) {
    setScreen({ type: 'saving' });
    try {
      const app = await createApplication({
        company: jobData.company,
        role: jobData.role,
        jobUrl: jobData.jobUrl,
        description: jobData.description,
        source: jobData.source,
      });
      setScreen({
        type: 'saved',
        appId: app.id,
        appUrl: `${DEFAULT_WEB_URL}/applications/${app.id}`,
        company: app.company,
        role: app.role,
      });
    } catch (err) {
      reportUnexpected(err, 'save_application');
      setScreen({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
    }
  }

  if (screen.type === 'loading') {
    return (
      <div className="container center">
        <div className="spinner" />
        {screen.message && <p className="muted">{screen.message}</p>}
      </div>
    );
  }

  if (screen.type === 'login') {
    return (
      <div className="container">
        <div className="header">
          <img src={browser.runtime.getURL('/icons/icon48.png')} alt="" className="logo" />
          <h1>Trakwyn</h1>
          <p className="subtitle">Sign in to save job postings</p>
        </div>
        {screen.error && <div className="error-box">{screen.error}</div>}
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
          />
          Keep me signed in
        </label>
        <div className="provider-buttons">
          {OAUTH_PROVIDERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleOAuthLogin(id)}
              disabled={oauthPending !== null}
              className="btn btn-provider btn-full"
            >
              {oauthPending === id ? `Opening ${label}…` : `Continue with ${label}`}
            </button>
          ))}
        </div>
        <div className="divider">
          <span>or</span>
        </div>
        <form onSubmit={handleLogin} className="form">
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full">
            Sign in
          </button>
        </form>
      </div>
    );
  }

  if (screen.type === 'saving') {
    return (
      <div className="container center">
        <div className="spinner" />
        <p className="muted">Saving application…</p>
      </div>
    );
  }

  if (screen.type === 'saved') {
    return (
      <div className="container center">
        <div className="success-icon">✅</div>
        <h2>Saved!</h2>
        <p className="muted">
          <strong>{screen.company}</strong> — {screen.role}
        </p>
        <a href={screen.appUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
          Open application →
        </a>
        <button onClick={() => loadReadyScreen()} className="btn btn-ghost">
          Save another
        </button>
      </div>
    );
  }

  if (screen.type === 'error') {
    return (
      <div className="container center">
        <div className="error-icon">⚠️</div>
        <p className="error-text">{screen.message}</p>
        <button onClick={() => loadReadyScreen()} className="btn btn-ghost">
          Try again
        </button>
      </div>
    );
  }

  // ready screen
  const { clip, settingsUrl } = screen;
  const { jobData } = clip;

  return (
    <div className="container">
      <UserHeader
        // A fresh avatar URL gets a fresh try after a cached, expired one failed
        key={account.user?.avatarUrl ?? ''}
        user={account.user}
        onSignOut={handleLogout}
      />

      {clip.notice && (
        <div className="error-box" role="status">
          {clip.notice}{' '}
          <button
            className="btn btn-ghost"
            onClick={() => updateClip({ ...clip, notice: undefined })}
          >
            Dismiss
          </button>
        </div>
      )}

      {clip.tab && (
        <ReadButtons
          busy={clip.busy}
          aiAvailable={account.aiAvailable}
          settingsUrl={settingsUrl}
          onRead={(method) => handleRead(clip, method)}
        />
      )}

      {jobData ? (
        <ClipCard
          // A new read replaces the clip, so the editable draft starts over
          key={clip.readId}
          jobData={jobData}
          aiSuggested={clip.aiSuggested}
          busy={clip.busy !== null || !account.confirmed}
          onSave={handleSave}
        />
      ) : clip.tab ? (
        <div className="empty-state">
          <p>Couldn't read this page.</p>
        </div>
      ) : (
        <div className="empty-state">
          <p>Navigate to a job posting to clip it.</p>
          <p className="muted">
            Supported: LinkedIn, Indeed, Glassdoor, Greenhouse, Lever, and more.
          </p>
        </div>
      )}
    </div>
  );
}
