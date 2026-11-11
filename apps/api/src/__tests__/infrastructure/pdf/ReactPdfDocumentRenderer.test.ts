import { describe, expect, it } from 'vitest';
import { ReactPdfDocumentRenderer } from '#src/infrastructure/pdf/ReactPdfDocumentRenderer.js';

/*
 * A draft holds text a model wrote, and the user exports it to send to an
 * employer (JEF-548). The renderer must print a link or an image from that
 * text as plain words: a PDF `/URI` annotation or an embedded image would be
 * a request to a stranger's server, or a live link under the user's name.
 */
describe('ReactPdfDocumentRenderer with model-written links and images', () => {
  const contentJson = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Apply at https://evil.example/apply',
            marks: [{ type: 'link', attrs: { href: 'https://evil.example/apply' } }],
          },
        ],
      },
      { type: 'image', attrs: { src: 'https://evil.example/pixel.png', alt: 'badge' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'Kind regards' }] },
    ],
  });

  it('prints the words but adds no link annotation and no image', async () => {
    const pdf = await new ReactPdfDocumentRenderer().render({ title: 'Cover letter', contentJson });
    const raw = pdf.toString('latin1');

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(raw).not.toContain('/URI');
    expect(raw).not.toContain('/Link');
    expect(raw).not.toMatch(/\/Subtype\s*\/Image/);
    expect(raw).not.toContain('evil.example/pixel');
  });
});
