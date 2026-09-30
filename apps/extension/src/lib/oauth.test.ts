import { describe, it, expect } from 'vitest';
import {
  buildOAuthStartUrl,
  isUserCancellation,
  oauthErrorMessage,
  parseOAuthRedirect,
} from './oauth';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const REDIRECT = `https://${EXTENSION_ID}.chromiumapp.org/`;

describe('buildOAuthStartUrl', () => {
  it("points at the API's /start route for the provider, on the GraphQL endpoint's origin", () => {
    const url = new URL(
      buildOAuthStartUrl('https://api.trakwyn.com/graphql', 'github', 'challenge', EXTENSION_ID),
    );

    expect(url.origin).toBe('https://api.trakwyn.com');
    expect(url.pathname).toBe('/auth/oauth/github/start');
  });

  it('asks for the extension platform with the PKCE challenge and extension ID', () => {
    const url = new URL(
      buildOAuthStartUrl('http://localhost:3001/graphql', 'google', 'the-challenge', EXTENSION_ID),
    );

    expect(url.searchParams.get('platform')).toBe('extension');
    expect(url.searchParams.get('codeChallenge')).toBe('the-challenge');
    expect(url.searchParams.get('extensionId')).toBe(EXTENSION_ID);
  });
});

describe('parseOAuthRedirect', () => {
  it('reads the handoff code', () => {
    expect(parseOAuthRedirect(`${REDIRECT}?code=abc.def`)).toEqual({ code: 'abc.def' });
  });

  it('reads an error slug', () => {
    expect(parseOAuthRedirect(`${REDIRECT}?oauthError=email_in_use`)).toEqual({
      error: 'email_in_use',
    });
  });

  it('treats a redirect with neither as a generic failure', () => {
    expect(parseOAuthRedirect(REDIRECT)).toEqual({ error: 'failed' });
  });
});

describe('oauthErrorMessage', () => {
  it('explains a known slug', () => {
    expect(oauthErrorMessage('email_in_use')).toMatch(/already exists/);
  });

  it('falls back to a generic line for an unknown slug rather than echoing it', () => {
    const message = oauthErrorMessage('<script>alert(1)</script>');

    expect(message).toBe("Sign-in didn't work. Please try again.");
  });
});

describe('isUserCancellation', () => {
  it("recognises Chrome's closed-window rejection", () => {
    expect(isUserCancellation(new Error('The user did not approve access.'))).toBe(true);
  });

  it('does not treat other failures as a cancel', () => {
    expect(isUserCancellation(new Error('Authorization page could not be loaded.'))).toBe(false);
    expect(isUserCancellation('did not approve')).toBe(false);
  });
});
