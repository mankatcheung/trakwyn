import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { OAuthProviderLogo } from '#/features/auth/components/OAuthProviderLogo';

describe('OAuthProviderLogo', () => {
  it('draws the four-colour Google mark, hidden from assistive tech', () => {
    const { container } = render(<OAuthProviderLogo provider="google" />);

    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('role', 'presentation');
    expect(svg.querySelectorAll('path')).toHaveLength(4);
    expect(svg).not.toHaveClass('fill-current');
  });

  it('draws the one-colour GitHub mark that follows the text colour', () => {
    const { container } = render(<OAuthProviderLogo provider="github" />);

    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
    expect(svg).toHaveClass('fill-current');
  });

  it('switches mark when the provider changes, and when it renders again unchanged', () => {
    const { container, rerender } = render(<OAuthProviderLogo provider="github" />);
    rerender(<OAuthProviderLogo provider="github" />);
    expect(container.querySelectorAll('path')).toHaveLength(1);

    rerender(<OAuthProviderLogo provider="google" />);
    expect(container.querySelectorAll('path')).toHaveLength(4);

    rerender(<OAuthProviderLogo provider="google" />);
    expect(container.querySelectorAll('path')).toHaveLength(4);

    rerender(<OAuthProviderLogo provider="github" />);
    expect(container.querySelector('svg')).toHaveClass('h-5', 'w-5', 'fill-current');
  });

  it('is 20px square by default and takes a size class from the caller', () => {
    const { container, rerender } = render(<OAuthProviderLogo provider="google" />);
    expect(container.querySelector('svg')).toHaveClass('h-5', 'w-5');

    rerender(<OAuthProviderLogo provider="google" className="size-8" />);
    expect(container.querySelector('svg')).toHaveClass('size-8');
    expect(container.querySelector('svg')).not.toHaveClass('h-5');

    rerender(<OAuthProviderLogo provider="github" className="size-8" />);
    expect(container.querySelector('svg')).toHaveClass('size-8', 'fill-current');
  });
});
