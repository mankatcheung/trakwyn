import { useState, useEffect } from 'react';
import { getAuth, getApiUrl } from '../lib/storage';
import {
  login,
  logout,
  createApplication,
  getCurrentUser,
  isUnauthorizedError,
  type CurrentUser,
} from '../lib/api';
import type { JobData } from '../lib/parsers/types';
import { UserHeader } from './UserHeader';

type Screen =
  | { type: 'loading' }
  | { type: 'login'; error?: string }
  | { type: 'ready'; jobData: JobData | null; user: CurrentUser }
  | { type: 'saving' }
  | { type: 'saved'; appId: string; appUrl: string; company: string; role: string }
  | { type: 'error'; message: string };

async function readActiveTabJobData(): Promise<JobData | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_JOB_DATA' });
    return response?.jobData ?? null;
  } catch {
    // No content script on this page — there's no job data to clip
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'loading' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const auth = await getAuth();
    if (!auth) {
      setScreen({ type: 'login' });
      return;
    }
    await loadReadyScreen();
  }

  async function loadReadyScreen() {
    try {
      const [user, jobData] = await Promise.all([getCurrentUser(), readActiveTabJobData()]);
      setScreen({ type: 'ready', jobData, user });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        // The stored token was revoked or rejected — start over at sign-in
        await logout();
        setScreen({ type: 'login' });
        return;
      }
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
      setScreen({ type: 'login', error: err instanceof Error ? err.message : 'Login failed' });
    }
  }

  async function handleLogout() {
    await logout();
    setScreen({ type: 'login' });
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
      const apiUrl = await getApiUrl();
      const webUrl = apiUrl.replace('/graphql', '').replace(':3001', ':3000');
      setScreen({
        type: 'saved',
        appId: app.id,
        appUrl: `${webUrl}/applications/${app.id}`,
        company: app.company,
        role: app.role,
      });
    } catch (err) {
      setScreen({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
    }
  }

  if (screen.type === 'loading') {
    return (
      <div className="container center">
        <div className="spinner" />
      </div>
    );
  }

  if (screen.type === 'login') {
    return (
      <div className="container">
        <div className="header">
          <img src={chrome.runtime.getURL('icons/icon48.png')} alt="" className="logo" />
          <h1>Trakwyn</h1>
          <p className="subtitle">Sign in to save job postings</p>
        </div>
        <form onSubmit={handleLogin} className="form">
          {screen.error && <div className="error-box">{screen.error}</div>}
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
  const { jobData, user } = screen;

  return (
    <div className="container">
      <UserHeader user={user} onSignOut={handleLogout} />

      {jobData ? (
        <div className="job-card">
          <div className="job-source">{jobData.source ?? 'Job posting'}</div>
          <h2 className="job-role">{jobData.role}</h2>
          <p className="job-company">{jobData.company}</p>
          {jobData.location && <p className="job-location">📍 {jobData.location}</p>}
          {jobData.description && (
            <p className="job-description">{jobData.description.slice(0, 200)}…</p>
          )}
          <button onClick={() => handleSave(jobData)} className="btn btn-primary btn-full">
            Save as Application
          </button>
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
