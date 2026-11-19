import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import {
  readStoredObject,
  StoredObjectTooLargeError,
} from '#src/use-cases/documents/readStoredObject.js';
import { makeStoredObject } from '#src/__tests__/helpers/mocks/documents.js';

describe('readStoredObject', () => {
  it('returns every chunk of the stream as one buffer', async () => {
    const object = {
      stream: Readable.from([Buffer.from('hello '), Buffer.from('world')]),
      size: 11,
    };

    expect((await readStoredObject(object)).toString()).toBe('hello world');
  });

  it('reads a file of exactly the limit', async () => {
    const buffer = await readStoredObject(makeStoredObject('12345'), 5);

    expect(buffer.toString()).toBe('12345');
  });

  it('refuses a declared size over the limit without reading a byte', async () => {
    const object = makeStoredObject('x', 6);

    await expect(readStoredObject(object, 5)).rejects.toBeInstanceOf(StoredObjectTooLargeError);
    expect(object.stream.destroyed).toBe(true);
  });

  it('refuses a body over the limit when the declared size is missing or too small', async () => {
    for (const declared of [null, 1]) {
      const object = makeStoredObject('123456', declared);

      await expect(readStoredObject(object, 5)).rejects.toBeInstanceOf(StoredObjectTooLargeError);
      expect(object.stream.destroyed).toBe(true);
    }
  });

  it('stops reading as soon as the limit is passed', async () => {
    let pulled = 0;
    const stream = Readable.from(
      (function* () {
        for (let i = 0; i < 1000; i++) {
          pulled++;
          yield Buffer.alloc(10);
        }
      })(),
    );

    await expect(readStoredObject({ stream, size: null }, 25)).rejects.toBeInstanceOf(
      StoredObjectTooLargeError,
    );
    expect(pulled).toBeLessThan(10);
  });

  it('reports the limit it enforced', async () => {
    const error = await readStoredObject(makeStoredObject('toolong', null), 3).catch((e) => e);

    expect((error as StoredObjectTooLargeError).maxBytes).toBe(3);
  });
});
