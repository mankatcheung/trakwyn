import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadUrl } from '#/lib/downloadUrl';

describe('downloadUrl', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clicks a new-tab download link for the URL and removes it again', () => {
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    downloadUrl('https://blob.example/doc.pdf', 'My_Resume.pdf');

    expect(clicked).toHaveLength(1);
    const [a] = clicked;
    expect(a.href).toBe('https://blob.example/doc.pdf');
    expect(a.download).toBe('My_Resume.pdf');
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener');
    expect(a.isConnected).toBe(false);
  });
});
