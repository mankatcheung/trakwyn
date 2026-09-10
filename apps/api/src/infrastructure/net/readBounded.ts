/**
 * Reads at most `maxBytes` of a response body and stops — unlike
 * `response.text()`, which buffers the entire body first no matter how large
 * it is. A user-supplied URL can point at a multi-gigabyte file; the caller
 * only ever wanted the first few kilobytes of it.
 */
export async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) return '';

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;

  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - received;
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      received += slice.byteLength;
      chunks.push(decoder.decode(slice, { stream: true }));
    }
  } finally {
    // Tells the server we are done; without it the connection stays open
    // until the rest of the body has been transferred anyway.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}
