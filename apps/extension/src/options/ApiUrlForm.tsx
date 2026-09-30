import { useEffect, useState } from 'react';
import { clearAuth, getApiUrl, setApiUrl } from '../lib/storage';
import { DEFAULT_API_URL } from '../constants';

type Status = { type: 'idle' } | { type: 'saved' } | { type: 'invalid' };

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Where the extension sends its GraphQL requests — a developer setting. */
export function ApiUrlForm() {
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [status, setStatus] = useState<Status>({ type: 'idle' });

  useEffect(() => {
    getApiUrl().then((current) => {
      setUrl(current);
      setSavedUrl(current);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = url.trim();
    if (!isHttpUrl(next)) {
      setStatus({ type: 'invalid' });
      return;
    }
    await setApiUrl(next);
    // A token issued by one API means nothing to another
    if (next !== savedUrl) await clearAuth();
    setSavedUrl(next);
    setStatus({ type: 'saved' });
  }

  return (
    <form onSubmit={handleSubmit} className="container form">
      <div className="field">
        <label htmlFor="api-url">API URL</label>
        <input
          id="api-url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setStatus({ type: 'idle' });
          }}
          placeholder={DEFAULT_API_URL}
        />
      </div>
      {status.type === 'invalid' && (
        <div className="error-box">Enter a full http:// or https:// URL.</div>
      )}
      {status.type === 'saved' && <p className="muted">Saved.</p>}
      <button type="submit" className="btn btn-primary">
        Save
      </button>
    </form>
  );
}
