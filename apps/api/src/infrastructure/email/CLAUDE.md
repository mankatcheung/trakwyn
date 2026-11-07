# apps/api/src/infrastructure/email - subsystem notes

Loaded when working under `apps/api/src/infrastructure/email`. The rest of the API notes are in `apps/api/CLAUDE.md` and the layer map is in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## Email

`EMAIL_PROVIDER` is `brevo` (the default) or `console`. `ConsoleEmailService` logs each mail, including its confirm/reset URL. `BrevoEmailService` throws on a blank key, and mail-dependent flows (`RequestEmailChangeUseCase` and friends) surface that as a 500. Only `RegisterUseCase`'s verification send is best-effort.

**Verification-mail abuse limits (JEF-400).** Sign-up is the one unauthenticated route that sends mail, so it is the one a bot can use to spend the shared Brevo quota. Three limiters guard it: `registerRateLimiter` (5 sign-ups per hour per IP, checked in `RegisterUseCase` before the hash and the lookup), and in `SendEmailVerificationUseCase`, `emailVerificationUserRateLimiter` (3 per hour per account) and `emailVerificationGlobalRateLimiter` (100 per day across everyone, which keeps a distributed abuser from starving password-reset mail). Both are checked before the old token is deleted, so a throttled request leaves the emailed link working. The global budget being spent does not block sign-up: `RegisterUseCase` already swallows a failed send, so the account is created and the user can resend later. **The IP and global limits are enforced only when `NODE_ENV=production`** (`productionOnlyLimiter` in `http/di/rate-limiters.ts`); elsewhere their ceiling is `RATE_LIMIT_RELAXED_MAX_ATTEMPTS`, because dev, e2e and the integration suites sign up dozens of users from one address. `di-modules.test.ts` pins both behaviours.
