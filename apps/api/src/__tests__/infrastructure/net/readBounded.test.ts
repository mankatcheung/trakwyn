import { describe, it, expect, vi } from 'vitest';
import { readBounded } from '#src/infrastructure/net/readBounded.js';

function streamOf(chunks: string[], onCancel?: () => void): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe('readBounded', () => {
  it('returns an empty string for a missing body', async () => {
    await expect(readBounded(null, 100)).resolves.toBe('');
  });

  it('returns the whole body when it fits', async () => {
    await expect(readBounded(streamOf(['hello ', 'world']), 100)).resolves.toBe('hello world');
  });

  it('stops at the byte limit, cutting inside a chunk if needed', async () => {
    await expect(readBounded(streamOf(['abcdef', 'ghij']), 8)).resolves.toBe('abcdefgh');
  });

  it('cancels the underlying stream once the limit is reached', async () => {
    const onCancel = vi.fn();
    const infinite = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(1024)));
      },
      cancel: onCancel,
    });

    const text = await readBounded(infinite, 2048);

    expect(text.length).toBe(2048);
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not split a multi-byte character across the limit', async () => {
    // "é" is two bytes; a 3-byte budget covers "a" + "é" but not the second "é".
    const text = await readBounded(streamOf(['aéé']), 3);
    expect(text).toBe('aé');
  });
});
