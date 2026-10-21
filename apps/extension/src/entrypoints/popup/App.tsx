import { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';
import { getAuth, getApiUrl } from '../../lib/storage';
import {
  ApiError,
  login,
  logout,
  createApplication,
  getCurrentUser,
  hasDefaultAiKey,
  isUnauthorizedError,
  type CurrentUser,
} from '../../lib/api';
import type { JobData, ParsedJobPage } from '../../lib/parsers/types';
import { parserHealthProperties } from '../../lib/parsers/health';
import { readTabWithAi } from '../../lib/aiRead';
import { captureEvent, captureException } from '../../lib/observability/report';
import type { OAuthLoginResponse } from '../background';
import {
  CONTENT_MESSAGES,
  OAUTH_PROVIDERS,
  OBSERVABILITY_EVENTS,
  REFRESH_LEEWAY_MS,
  RUNTIME_MESSAGES,
  type OAuthProvider,
} from '../../constants';
import { UserHeader } from './UserHeader';
import { ClipCard } from './ClipCard';
import { ReadButtons, type ReadMethod } from './ReadButtons';

interface ReadyScreen {
  type: 'ready';
  user: CurrentUser;
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
  /** The user has a default AI provider with a saved key (JEF-420). */
  aiAvailable: boolean;
  /** The AI changed or filled part of the clip, so the user confirms it before saving. */
  aiSuggested: boolean;
  /** Which read is running. */
  busy: ReadMethod | null;
  /** Counts reads, so a new result starts the editable draft over. */
  readId: number;
  /** Dismissible: why the AI result is missing. */
  notice?: string;
}

/** The web app's origin, derived from the configured API URL. */
function webUrlOf(apiUrl: string): string {
  return apiUrl.replace('/graphql', '').replace(':3001', ':3000');
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

export function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oauthPending, setOAuthPending] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const auth = await getAuth();
    if (!auth) {
      setScreen({ type: 'login' });
      return;
    }
    // An expired access token is renewed up front by the background worker,
    // which owns the rotating refresh token (JEF-383).
    if (Date.now() > auth.expiresAt - REFRESH_LEEWAY_MS) {
      const refreshed: boolean = await browser.runtime.sendMessage({
        type: RUNTIME_MESSAGES.REFRESH_TOKEN,
      });
      if (!refreshed) {
        setScreen({ type: 'login' });
        return;
      }
    }
    await loadReadyScreen();
  }

  async function loadReadyScreen() {
    try {
      const [user, read, aiAvailable, apiUrl] = await Promise.all([
        getCurrentUser(),
        readActiveTab(),
        // A failed check leaves the AI button disabled: `gql` already reported
        // an unreachable API, and the parser works without it.
        hasDefaultAiKey().catch(() => false),
        getApiUrl(),
      ]);
      const clip: Clip = {
        jobData: read.jobData,
        builtin: read.jobData,
        tab: read.tab,
        aiAvailable,
        aiSuggested: false,
        busy: null,
        readId: 0,
      };
      setScreen({ type: 'ready', user, clip, settingsUrl: `${webUrlOf(apiUrl)}/settings/ai` });
    } catch (err) {
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
      await login(email, password);
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
    await logout();
    setScreen({ type: 'login' });
  }

  async function handleRead(ready: ReadyScreen, method: ReadMethod) {
    const { user, settingsUrl } = ready;
    setScreen({
      type: 'ready',
      user,
      settingsUrl,
      clip: { ...ready.clip, busy: method, notice: undefined },
    });
    const clip = method === 'ai' ? await readWithAi(ready.clip) : await readWithParser(ready.clip);
    setScreen({ type: 'ready', user, settingsUrl, clip });
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
      const webUrl = webUrlOf(await getApiUrl());
      setScreen({
        type: 'saved',
        appId: app.id,
        appUrl: `${webUrl}/applications/${app.id}`,
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
        <button onClick={loadReadyScreen} className="btn btn-ghost">
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
        <button onClick={loadReadyScreen} className="btn btn-ghost">
          Try again
        </button>
      </div>
    );
  }

  // ready screen
  const { user, clip, settingsUrl } = screen;
  const { jobData } = clip;

  return (
    <div className="container">
      <UserHeader user={user} onSignOut={handleLogout} />

      {clip.notice && (
        <div className="error-box" role="status">
          {clip.notice}{' '}
          <button
            className="btn btn-ghost"
            onClick={() => setScreen({ ...screen, clip: { ...clip, notice: undefined } })}
          >
            Dismiss
          </button>
        </div>
      )}

      {clip.tab && (
        <ReadButtons
          busy={clip.busy}
          aiAvailable={clip.aiAvailable}
          settingsUrl={settingsUrl}
          onRead={(method) => handleRead(screen, method)}
        />
      )}

      {jobData ? (
        <ClipCard
          // A new read replaces the clip, so the editable draft starts over
          key={clip.readId}
          jobData={jobData}
          aiSuggested={clip.aiSuggested}
          busy={clip.busy !== null}
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
