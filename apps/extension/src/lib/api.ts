import { getAuth, setAuth, clearAuth, getApiUrl } from './storage';
import { AUTH_HEADER, COOKIES, API_ERROR_CODES } from '../constants';

export interface JobApplication {
  id: string;
  company: string;
  role: string;
  jobUrl?: string;
  description?: string;
  source?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** A GraphQL error, carrying the API's `extensions.code` when it sent one. */
export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof ApiError && err.code === API_ERROR_CODES.UNAUTHORIZED;
}

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const apiUrl = await getApiUrl();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `${AUTH_HEADER.BEARER_PREFIX}${token}`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
  };
  if (json.errors?.length) {
    const [first] = json.errors;
    throw new ApiError(first.message, first.extensions?.code);
  }
  if (!json.data) throw new Error('No data returned');
  return json.data;
}

async function authedGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const auth = await getAuth();
  if (!auth) throw new ApiError('Not authenticated', API_ERROR_CODES.UNAUTHORIZED);
  return gql<T>(query, variables, auth.token);
}

const LOGIN = `mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { success totpRequired accessToken } }`;
const ME = `query Me { me { id email name avatarUrl } }`;
const REFRESH = `mutation { refreshToken }`;
const CREATE_APPLICATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id company role status }
  }
`;

export async function login(email: string, password: string): Promise<void> {
  // Sets HttpOnly cookies for the API origin as a side effect; the access
  // token is also returned directly in the response, which is the
  // supported way for non-web clients to read it (see LoginResultType.ts).
  const data = await gql<{
    login: { success: boolean; totpRequired: boolean; accessToken: string | null };
  }>(LOGIN, { email, password });

  if (data.login.totpRequired) {
    throw new Error(
      "This account has two-factor authentication enabled, which the extension doesn't support yet — log in on the web app instead.",
    );
  }
  if (!data.login.accessToken) throw new Error('Login failed');

  // Decode the JWT to get its expiry (payload is base64 URL-encoded)
  const [, payload] = data.login.accessToken.split('.');
  const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
    exp: number;
  };

  await setAuth({ token: data.login.accessToken, expiresAt: exp * 1000 });
}

export async function logout(): Promise<void> {
  await clearAuth();
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const data = await authedGql<{ me: CurrentUser | null }>(ME);
  if (!data.me) throw new ApiError('Not authenticated', API_ERROR_CODES.UNAUTHORIZED);
  return data.me;
}

export async function refreshToken(): Promise<boolean> {
  try {
    const apiUrl = await getApiUrl();
    await gql<{ refreshToken: boolean }>(REFRESH);
    const cookie = await chrome.cookies.get({ url: apiUrl, name: COOKIES.ACCESS_TOKEN });
    if (!cookie) return false;

    const [, payload] = cookie.value.split('.');
    const { exp } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp: number;
    };
    await setAuth({ token: cookie.value, expiresAt: exp * 1000 });
    return true;
  } catch {
    await clearAuth();
    return false;
  }
}

export async function createApplication(input: {
  company: string;
  role: string;
  jobUrl?: string;
  description?: string;
  source?: string;
}): Promise<JobApplication> {
  const data = await authedGql<{ createApplication: JobApplication }>(CREATE_APPLICATION, {
    input,
  });
  return data.createApplication;
}
