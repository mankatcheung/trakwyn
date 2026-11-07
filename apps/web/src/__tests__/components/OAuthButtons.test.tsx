import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OAuthButtons } from '#/components/OAuthButtons';

describe('OAuthButtons', () => {
  it('renders the "or" divider', () => {
    render(<OAuthButtons label="Sign up" />);
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('renders Google OAuth link with the label', () => {
    render(<OAuthButtons label="Sign up" />);
    const link = screen.getByRole('link', { name: /sign up with google/i });
    expect(link).toHaveAttribute('href', '/auth/oauth/google/start');
  });

  it('renders GitHub OAuth link with the label', () => {
    render(<OAuthButtons label="Log in" />);
    const link = screen.getByRole('link', { name: /log in with github/i });
    expect(link).toHaveAttribute('href', '/auth/oauth/github/start');
  });

  it('tells onSelect which provider was picked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<OAuthButtons label="Sign up" onSelect={onSelect} />);

    await user.click(screen.getByRole('link', { name: /sign up with github/i }));

    expect(onSelect).toHaveBeenCalledWith('github');
  });

  it('renders both OAuth buttons', () => {
    render(<OAuthButtons label="Continue" />);
    expect(screen.getByRole('link', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue with github/i })).toBeInTheDocument();
  });
});

describe('OAuthButtons — with an absolute VITE_API_URL (production shape)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('points at the API origin instead of a relative path, so the link works cross-subdomain', async () => {
    // API_ORIGIN is computed once at module load, from import.meta.env —
    // stub before importing, and reset modules so it re-evaluates.
    vi.stubEnv('VITE_API_URL', 'https://api.trakwyn.com/graphql');
    vi.resetModules();
    const { OAuthButtons: OAuthButtonsWithProdEnv } = await import('#/components/OAuthButtons');

    render(<OAuthButtonsWithProdEnv label="Log in" />);

    expect(screen.getByRole('link', { name: /log in with google/i })).toHaveAttribute(
      'href',
      'https://api.trakwyn.com/auth/oauth/google/start',
    );
    expect(screen.getByRole('link', { name: /log in with github/i })).toHaveAttribute(
      'href',
      'https://api.trakwyn.com/auth/oauth/github/start',
    );
  });
});
