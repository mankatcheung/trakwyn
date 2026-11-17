import { describe, it, expect } from 'vitest';
import { proseToTiptapDoc } from '#/features/documents/lib/editor/proseToTiptapDoc';

const parse = (json: string) => JSON.parse(json) as { type: string; content: unknown[] };

describe('proseToTiptapDoc', () => {
  it('makes one paragraph per line', () => {
    expect(parse(proseToTiptapDoc('First\nSecond').contentJson)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    });
  });

  it('never emits an empty text node, which the editor rejects on load', () => {
    const { contentJson } = proseToTiptapDoc('A\n\nB');

    expect(parse(contentJson).content[1]).toEqual({ type: 'paragraph' });
    expect(JSON.stringify(parse(contentJson))).not.toContain('"text":""');
  });

  it('produces a valid empty document for empty input', () => {
    const { contentJson, plainText } = proseToTiptapDoc('   ');

    expect(plainText).toBe('');
    expect(parse(contentJson)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});
