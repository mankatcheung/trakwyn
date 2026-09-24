import fetch from './expoFetch';
import { CHAT_STREAM_URL, ERROR_CODES } from '../../../constants';
import {
  getValidAccessToken,
  recoverFromUnauthorized,
  traceHeaders,
} from '../../../graphql/client';
import { ANALYTICS_EVENTS, addBreadcrumb, captureEvent } from '../../../lib/analytics';
import { getNetworkMessage } from '../../../lib/errors';
import { buildUserAgent } from '../../../lib/userAgent';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Sign in again to continue.';

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
  /** The key this turn would have used was paused at its monthly limit and the user's opt-in fallback picked another. Arrives before any text. */
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

const userAgent = buildUserAgent();

/**
 * A 400 (message missing or over the API's `CHAT.MAX_MESSAGE_CHARS`) and a
 * 413 (body over the route's limit) carry a JSON `{ error }` worth showing;
 * anything else stays a plain transport error. Duck-typed on `json`, since
 * the streaming `expo/fetch` response is what arrives here.
 */
async function toRequestError(response: {
  status: number;
  json?: () => Promise<unknown>;
}): Promise<Error> {
  if ((response.status === 400 || response.status === 413) && response.json) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    if (typeof body?.error === 'string') {
      return new ChatStreamError(body.error, ERROR_CODES.VALIDATION);
    }
  }
  return new Error(`Chat stream request failed with status ${response.status}`);
}

function openStream(accessToken: string | null, body: string, signal?: AbortSignal) {
  return fetch(CHAT_STREAM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userAgent ? { 'user-agent': userAgent } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...traceHeaders(CHAT_STREAM_URL),
    },
    body,
    signal,
  });
}

/**
 * Consumes the `/chat/stream` SSE endpoint, ported from apps/web's
 * lib/chatStream.ts. React Native's stock global `fetch` buffers the whole
 * response before resolving — it cannot expose `response.body` as an
 * incrementally-readable stream — so this uses `expo/fetch` (SDK 50+),
 * which is backed by native URL loading (NSURLSession/OkHttp) and does
 * support streaming reads. Bearer auth replaces web's `credentials:
 * 'include'`, since there's no cookie jar on the API's domain to send.
 */
export async function streamChatMessage({
  conversationId,
  message,
  onDelta,
  onFallback,
  signal,
}: StreamChatMessageParams): Promise<void> {
  const body = JSON.stringify({ conversationId, message });

  // What a stream breadcrumb says about the reply so far (JEF-367): how long
  // it ran and whether any text had arrived — never the text itself.
  const startedAt = Date.now();
  let receivedText = false;
  const streamState = () => ({ elapsed_ms: Date.now() - startedAt, received_text: receivedText });

  // Counted at the send, not at a successful reply: how often the assistant
  // is reached for is the question, and a send that errors is part of it.
  // The message itself is never included.
  captureEvent(ANALYTICS_EVENTS.ASSISTANT_USED, { new_conversation: !conversationId });

  // This is not gqlRequest, so none of its refresh-on-UNAUTHORIZED applies:
  // the route answers an expired bearer with a plain 401 JSON body, and a
  // user who has sat in the chat screen for fifteen minutes holds exactly
  // that. Ask for a known-good token first, and recover the same way
  // gqlRequest does if the server still says no (a session revoked elsewhere).
  const sentWith = await getValidAccessToken();
  let response = await openStream(sentWith, body, signal);
  if (response.status === 401 && sentWith) {
    // The stream reopening is the mobile equivalent of a reconnect, and it
    // is worth having in the trail behind a later crash: a chat screen that
    // reopens its stream repeatedly is a session going wrong, not a slow
    // reply.
    addBreadcrumb('Chat stream reopening after 401');
    const recovery = await recoverFromUnauthorized(sentWith);
    if (recovery.kind === 'unreachable') {
      throw new ChatStreamError(getNetworkMessage(), ERROR_CODES.NETWORK_ERROR);
    }
    if (recovery.kind === 'retry') response = await openStream(recovery.token, body, signal);
  }

  // A 401 that survived recovery means the session really is gone — say so,
  // instead of the generic "Something went wrong" a bare Error turns into.
  if (response.status === 401) {
    throw new ChatStreamError(SESSION_EXPIRED_MESSAGE, ERROR_CODES.UNAUTHORIZED);
  }
  if (!response.ok || !response.body) {
    throw await toRequestError(response);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (error) {
        // The connection went mid-reply. A read the user cancelled is not a
        // drop, and saying it was would make every "stop" look like a bad
        // network.
        if (!signal?.aborted) addBreadcrumb('Chat stream dropped', streamState());
        throw error;
      }
      const { done, value } = chunk;
      if (done) {
        // The server always ends a reply with `done`; a stream that just
        // stops was cut off somewhere between here and the model.
        addBreadcrumb('Chat stream closed before done', streamState());
        return;
      }

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
          receivedText = true;
          onDelta(text);
        } else if (frame.event === 'fallback') {
          onFallback?.(JSON.parse(frame.data) as { from: string; to: string });
        } else if (frame.event === 'error') {
          const err = JSON.parse(frame.data) as { code: string; message: string };
          // The code only: the message can quote the user's own provider.
          addBreadcrumb('Chat stream error frame', { code: err.code, ...streamState() });
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
