/** Mirrors the API's `ApiTokenScope` enum (`API_TOKEN_SCOPE` in apps/api/src/constants.ts). */
export type ApiTokenScope = 'read' | 'full';

export type ApiToken = {
  id: string;
  name: string;
  scope: ApiTokenScope;
  lastUsedAt: string | null;
  createdAt: string;
};

/** One MCP client the user authorized over OAuth. `id` is the grant id. */
export type McpOAuthGrant = {
  id: string;
  clientName: string;
  scope: ApiTokenScope;
  authorizedAt: string;
  lastUsedAt: string | null;
};

export type CreateApiTokenPayload = {
  id: string;
  name: string;
  token: string;
  scope: string;
  createdAt: string;
};

export type ShareLink = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type CreateShareLinkPayload = {
  id: string;
  name: string;
  token: string;
  createdAt: string;
};
