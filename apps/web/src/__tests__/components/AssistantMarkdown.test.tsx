import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssistantMarkdown } from '#/routes/_authenticated/assistant/-components/AssistantMarkdown';

describe('AssistantMarkdown', () => {
  it('renders bold, italic, and inline code as their own elements', () => {
    render(<AssistantMarkdown content="**bold** _italic_ `code`" />);

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
  });

  it('renders a bullet list as list items', () => {
    render(<AssistantMarkdown content={'- one\n- two'} />);

    expect(screen.getByText('one').closest('li')).not.toBeNull();
    expect(screen.getByText('two').closest('li')).not.toBeNull();
  });

  it('renders a heading', () => {
    render(<AssistantMarkdown content="## Section" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument();
  });

  it('opens links in a new tab with a safe rel attribute', () => {
    render(<AssistantMarkdown content="[docs](https://example.com)" />);

    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
