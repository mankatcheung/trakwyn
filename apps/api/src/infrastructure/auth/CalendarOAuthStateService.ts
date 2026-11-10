import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { CalendarProvider } from '#src/domain/calendarConnection/CalendarConnection.js';
import { ENV, CALENDAR_OAUTH } from '#src/infrastructure/config/constants.js';

export interface CalendarOAuthState {
  provider: CalendarProvider;
  userId: string;
  nonce: string;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Signs/verifies the `state` param for the calendar-connect redirect.
 *
 * A sibling of `OAuthStateService`, not a reuse of it: that service's
 * `OAuthState` is typed to login's `OAuthProviderName` ('google' | 'github')
 * and always carries a login/link `mode`, neither of which fits a calendar
 * connection — there is no calendar "login", and mixing the two providers'
 * name unions would let a Google *login* state be replayed as a Google
 * *calendar* state (or vice versa) at the type level.
 */
export class CalendarOAuthStateService {
  private get secret(): string {
    return process.env[ENV.JWT_SECRET] ?? '';
  }

  issue(provider: CalendarProvider, userId: string): { state: string; nonce: string } {
    const nonce = randomBytes(16).toString('hex');
    const payload: CalendarOAuthState = {
      provider,
      userId,
      nonce,
      exp: Date.now() + CALENDAR_OAUTH.STATE_TTL_MS,
    };
    const encodedPayload = base64url(JSON.stringify(payload));
    return { state: `${encodedPayload}.${this.signature(encodedPayload)}`, nonce };
  }

  verify(state: string): CalendarOAuthState {
    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) {
      throw new Error('Malformed calendar OAuth state');
    }
    // Constant-time, like `OAuthStateService`: a plain `!==` leaks how many
    // leading characters of a forged signature were right.
    const given = Buffer.from(signature);
    const expected = Buffer.from(this.signature(encodedPayload));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new Error('Invalid calendar OAuth state signature');
    }
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString(),
    ) as CalendarOAuthState;
    if (payload.exp < Date.now()) {
      throw new Error('Calendar OAuth state expired');
    }
    return payload;
  }

  private signature(encodedPayload: string): string {
    return createHmac('sha256', this.secret).update(encodedPayload).digest('base64url');
  }
}
