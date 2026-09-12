import { API_URL } from '../../constants';

/**
 * The integration tier deliberately targets the app's own default API URL
 * rather than a port of its own: src/constants.ts inlines EXPO_PUBLIC_API_URL
 * at build time, so a suite that pointed the client somewhere else would be
 * testing a client the app never ships.
 */
export const API_BASE_URL = API_URL;

export const BOOT_TIMEOUT_MS = 90_000;

declare global {
  // eslint-disable-next-line no-var
  var __TRAKWYN_API__: { reused: boolean; pid?: number; dbFile?: string } | undefined;
}

/** True once the API answers a real GraphQL request — not merely once the port accepts a socket. */
export async function pingApi(): Promise<boolean> {
  try {
    const response = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The same ephemeral configuration ci.yml writes for the Playwright job:
 * a throwaway SQLite file, fake OAuth and LLM providers, and an email
 * provider that logs instead of sending. Nothing here is a secret, which is
 * what lets this tier run on a fork's pull request.
 */
export function apiEnv(dbFile: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: new URL(API_BASE_URL).port || '3001',
    NODE_ENV: 'development',
    DATABASE_URL: `file:${dbFile}`,
    DATABASE_AUTH_TOKEN: '',
    JWT_SECRET: 'integration-only-jwt-secret',
    JWT_REFRESH_SECRET: 'integration-only-refresh-secret',
    TOTP_ENCRYPTION_KEY: 'integration-only-totp-encryption-key',
    LLM_API_KEY_ENCRYPTION_KEY: 'integration-only-llm-encryption-key',
    STORAGE_PROVIDER: 'local',
    CACHE_PROVIDER: 'memory',
    EMAIL_PROVIDER: 'console',
    CORS_ORIGIN: 'http://localhost:3000',
    WEB_APP_ORIGIN: 'http://localhost:3000',
    API_ORIGIN: new URL(API_BASE_URL).origin,
    COOKIE_DOMAIN: '',
    OAUTH_PROVIDER_MODE: 'fake',
    LLM_PROVIDER_MODE: 'fake',
    // Tracing would otherwise try to reach Axiom from a test run.
    AXIOM_TOKEN: '',
    AXIOM_DATASET: '',
    AXIOM_METRICS_DATASET: '',
  };
}
