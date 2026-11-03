export type ReadMethod = 'parser' | 'ai';

interface ReadButtonsProps {
  /** The method running now, if any; both buttons wait while one does. */
  busy: ReadMethod | null;
  onRead: (method: ReadMethod) => void;
}

/**
 * The user's choice of who reads this posting (JEF-420): the built-in parser
 * or the AI. The AI button is always on (JEF-451): Trakwyn AI serves users
 * without a key, and a failure says why and where to go next.
 */
export function ReadButtons({ busy, onRead }: ReadButtonsProps) {
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
          disabled={busy !== null}
          className="btn btn-ghost"
        >
          {busy === 'ai' ? 'Reading…' : 'Read with AI'}
        </button>
      </div>
    </div>
  );
}
