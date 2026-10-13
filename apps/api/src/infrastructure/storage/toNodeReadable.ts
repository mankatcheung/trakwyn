import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/**
 * A web `ReadableStream` (what `fetch` and `@vercel/blob`'s `get` hand back) as
 * the Node `Readable` that `StoredObject` carries. The two `ReadableStream`
 * types describe the same runtime object but do not unify in the type checker.
 */
export function toNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(stream as unknown as NodeWebReadableStream<Uint8Array>);
}
