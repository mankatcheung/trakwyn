import { CHAT_STREAM_URL } from '#/graphql/client';
import { ERROR_CODES } from '#/constants';

export class ChatStreamError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

export interface StreamChatMessageParams {
  conversationId: string;
  message: string;
  /** Called once per incremental chunk of assistant text, in arrival order. */
  onDelta: (text: string) => void;
  /**
   * The key this turn would have used was paused at its monthly limit and the
   * user's opt-in fallback picked another (JEF-258). Arrives before any text.
   */
  onFallback?: (fallback: { from: string; to: string }) => void;
  signal?: AbortSignal;
}

interface SSEFrame {
  event: string;
  data: string;
}

function parseFrame(raw: string): SSEFrame | null {
  const eventLine = raw.split('\n').find((l) => l.startsWith('event:'));
  const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
  if (!eventLine || !dataLine) return null;
  return { event: eventLine.slice(6).trim(), data: dataLine.slice(5).trim() };
}

/**
 * A 400 (message missing or over `CHAT.MAX_MESSAGE_CHARS`) and a 413 (body
 * over the route's limit) carry a JSON `{ error }` the user can act on —
 * surfaced as a `ChatStreamError` with the VALIDATION code so the chat pane
 * shows it instead of "Something went wrong". Anything else stays a plain
 * transport error.
 */
async function toRequestError(response: Response): Promise<Error> {
  if (response.status === 400 || response.status === 413) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (typeof body?.error === 'string') {
      return new ChatStreamError(body.error, ERROR_CODES.VALIDATION);
    }
  }
  return new Error(`Chat stream request failed with status ${response.status}`);
}

/**
 * Consumes the `/chat/stream` SSE endpoint (JEF-239) — a plain `fetch()` +
 * `ReadableStream` reader, not `gqlClient`, since this isn't a GraphQL
 * request and needs incremental delivery `graphql-request` doesn't support.
 * `onDelta` fires per text chunk; the promise resolves once the server sends
 * `done`, or rejects with a `ChatStreamError` (carrying the same domain
 * error `code` the rest of the app switches on, e.g. `AI_NOT_CONFIGURED`)
 * on a server-reported `error` event, or a plain `Error` on a transport
 * failure (non-2xx response, network error).
 *
 * Unlike `gqlClient`, this does not retry on an expired access token — a
 * 401 here surfaces as a plain error rather than transparently refreshing
 * and retrying. Acceptable for now: a chat send is a short-lived action, and
 * `gqlClient`'s refresh dance is tied to GraphQL error shapes this endpoint
 * doesn't produce.
 */
export async function streamChatMessage({
  conversationId,
  message,
  onDelta,
  onFallback,
  signal,
}: StreamChatMessageParams): Promise<void> {
  const response = await fetch(CHAT_STREAM_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw await toRequestError(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const frame = parseFrame(raw);
        if (!frame) continue;

        if (frame.event === 'delta') {
          const { text } = JSON.parse(frame.data) as { text: string };
          onDelta(text);
        } else if (frame.event === 'fallback') {
          onFallback?.(JSON.parse(frame.data) as { from: string; to: string });
        } else if (frame.event === 'error') {
          const err = JSON.parse(frame.data) as { code: string; message: string };
          throw new ChatStreamError(err.message, err.code);
        } else if (frame.event === 'done') {
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
