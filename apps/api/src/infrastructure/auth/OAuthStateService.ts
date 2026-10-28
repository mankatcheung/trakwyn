import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { OAuthProviderName } from '#src/domain/oauthAccount/OAuthAccount.js';
import { ENV, OAUTH } from '#src/infrastructure/config/constants.js';

export type OAuthMode = 'login' | 'link' | 'reauth';

export interface OAuthState {
  provider: OAuthProviderName;
  mode: OAuthMode;
  userId?: string;
  /** The session a `reauth` step-up refreshes (JEF-463). */
  sessionId?: string;
  returnTo?: string;
  nonce: string;
  exp: number;
}

/**
 * Lets a signed-in client start an OAuth step-up in a browser that carries
 * none of its credentials (JEF-463): the mobile app's in-app browser has no
 * cookie and cannot send a bearer header. Minted by a GraphQL mutation, which
 * did authenticate the caller, and good for one short window.
 */
export interface ReauthTicket {
  typ: typeof REAUTH_TICKET_TYPE;
  userId: string;
  sessionId: string;
  exp: number;
}

/** Tags a ticket so it can never be read as a state, nor a state as a ticket. */
const REAUTH_TICKET_TYPE = 'reauth_ticket';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Signs/verifies the short-lived `state` param carried through the OAuth
 * redirect dance. Stateless (HMAC over the payload) so it needs no server-side
 * storage and works across restarts/instances — reuses JWT_SECRET rather than
 * introducing a new secret.
 */
export class OAuthStateService {
  private get secret(): string {
    return process.env[ENV.JWT_SECRET] ?? '';
  }

  /**
   * Returns the signed state and the nonce inside it. The caller needs the
   * nonce separately so it can be stored in a cookie: the signature proves we
   * minted this state, and the cookie is what proves we minted it for *this*
   * browser (JEF-198).
   */
  issue(
    provider: OAuthProviderName,
    mode: OAuthMode,
    userId?: string,
    returnTo?: string,
    sessionId?: string,
  ): { state: string; nonce: string } {
    const nonce = randomBytes(16).toString('hex');
    const payload: OAuthState = {
      provider,
      mode,
      userId,
      sessionId,
      returnTo,
      nonce,
      exp: Date.now() + OAUTH.STATE_TTL_MS,
    };
    return { state: this.sign(payload), nonce };
  }

  verify(state: string): OAuthState {
    const payload = this.open(state) as OAuthState & { typ?: unknown };
    if (payload.typ !== undefined) throw new Error('Not an OAuth state');
    return payload;
  }

  issueReauthTicket(userId: string, sessionId: string): string {
    const payload: ReauthTicket = {
      typ: REAUTH_TICKET_TYPE,
      userId,
      sessionId,
      exp: Date.now() + OAUTH.REAUTH_TICKET_TTL_MS,
    };
    return this.sign(payload);
  }

  verifyReauthTicket(ticket: string): ReauthTicket {
    const payload = this.open(ticket) as Partial<ReauthTicket>;
    if (
      payload.typ !== REAUTH_TICKET_TYPE ||
      typeof payload.userId !== 'string' ||
      typeof payload.sessionId !== 'string'
    ) {
      throw new Error('Not a reauth ticket');
    }
    return payload as ReauthTicket;
  }

  private sign(payload: object): string {
    const encodedPayload = base64url(JSON.stringify(payload));
    return `${encodedPayload}.${this.signature(encodedPayload)}`;
  }

  /** Checks the signature and expiry, then returns the payload. */
  private open(token: string): { exp: number } {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new Error('Malformed OAuth state');
    }
    const given = Buffer.from(signature);
    const expected = Buffer.from(this.signature(encodedPayload));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new Error('Invalid OAuth state signature');
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as {
      exp: number;
    };
    if (payload.exp < Date.now()) {
      throw new Error('OAuth state expired');
    }
    return payload;
  }

  private signature(encodedPayload: string): string {
    return createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');
  }
}
