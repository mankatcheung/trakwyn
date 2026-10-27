export type ReadMethod = 'parser' | 'ai';

/** Whether "Read with AI" can work, or `'checking'` until the API answers (JEF-457). */
export type AiAvailability = 'checking' | boolean;

interface ReadButtonsProps {
  /** The method running now, if any; both buttons wait while one does. */
  busy: ReadMethod | null;
  /** The user has a default AI provider with a saved key. */
  aiAvailable: AiAvailability;
  /** Where the user adds a key when `aiAvailable` is false. */
  settingsUrl: string;
  onRead: (method: ReadMethod) => void;
}

/** The user's choice of who reads this posting (JEF-420): the built-in parser or their AI. */
export function ReadButtons({ busy, aiAvailable, settingsUrl, onRead }: ReadButtonsProps) {
  return (
    <div className="read-buttons">
      <div className="read-buttons-row">
        <button
          type="button"
          onClick={() => onRead('parser')}
          disabled={busy !== null}
          className="btn btn-ghost"
        >
          {busy === 'parser' ? 'Reading…' : 'Read with parser'}
        </button>
        <button
          type="button"
          onClick={() => onRead('ai')}
          disabled={busy !== null || aiAvailable !== true}
          aria-busy={aiAvailable === 'checking'}
          title={aiAvailable === 'checking' ? 'Checking for your AI key…' : undefined}
          className="btn btn-ghost"
        >
          {busy === 'ai' ? 'Reading…' : 'Read with AI'}
        </button>
      </div>
      {aiAvailable === false && (
        <p className="muted">
          <a href={settingsUrl} target="_blank" rel="noreferrer">
            Add a default AI key
          </a>{' '}
          to read postings with AI.
        </p>
      )}
    </div>
  );
}
