import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ROUTES } from '#src/http/constants.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;

const CREATE_API_TOKEN_MUTATION = `
  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) {
      token
    }
  }
`;

const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) {
      id
      company
    }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

describe('mcp integration', () => {
  let testApp: TestApp;

  async function registerAndGetAccessToken(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
    });
    const body = res.json() as GraphQLResponse<{ register: string }>;
    return body.data!.register;
  }

  async function registerAndGetCookie(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: REGISTER_MUTATION, variables: { email, password: 'correct-horse-1' } },
    });
    const setCookie = res.headers['set-cookie'];
    const accessCookie = Array.isArray(setCookie)
      ? setCookie.find((cookie) => cookie.startsWith('trakwyn_access_token='))
      : setCookie;
    if (!accessCookie) throw new Error('Registration did not set an access cookie');
    return accessCookie.split(';', 1)[0];
  }

  async function createApiToken(accessToken: string, scope?: 'read' | 'full'): Promise<string> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        query: CREATE_API_TOKEN_MUTATION,
        variables: { name: 'MCP integration test token', scope },
      },
    });
    const body = res.json() as GraphQLResponse<{ createApiToken: { token: string } }>;
    return body.data!.createApiToken.token;
  }

  function mcpInject(apiToken: string | null, body: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: ROUTES.MCP,
      headers: apiToken ? { authorization: `Bearer ${apiToken}` } : undefined,
      payload: body,
    });
  }

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  it.each(['GET', 'DELETE'] as const)(
    'answers %s /mcp with 405 and an Allow header, not 404',
    async (method) => {
      const res = await testApp.app.inject({ method, url: ROUTES.MCP });

      // 404 would read as "no such endpoint" and can make a strict client
      // abandon the server before it ever sees the 401 that starts OAuth
      // discovery. 405 says the endpoint is real, just not that way.
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('POST');
    },
  );

  it('rejects a request with no Authorization header', async () => {
    const res = await mcpInject(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: expect.stringContaining('Missing') });
    expect(res.headers['www-authenticate']).toContain('Bearer');
    expect(res.headers['www-authenticate']).toMatch(
      /resource_metadata="http:\/\/localhost:\d+\/.well-known\/oauth-protected-resource"/,
    );
  });

  it('rejects a request with an invalid/unknown API token', async () => {
    const res = await mcpInject('trakwyn_not-a-real-token', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: expect.stringContaining('Invalid') });
  });

  it('publishes protected-resource metadata for MCP clients', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
      headers: { host: 'api.example.com', 'x-forwarded-proto': 'https' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      resource: 'https://api.example.com/mcp',
      authorization_servers: ['https://api.example.com'],
      scopes_supported: ['read', 'full'],
      bearer_methods_supported: ['header'],
    });
  });

  it('publishes authorization-server metadata for MCP clients', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
      headers: { host: 'api.example.com', 'x-forwarded-proto': 'https' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      issuer: 'https://api.example.com',
      authorization_endpoint: 'https://api.example.com/oauth/authorize',
      token_endpoint: 'https://api.example.com/oauth/token',
      revocation_endpoint: 'https://api.example.com/oauth/revoke',
      registration_endpoint: 'https://api.example.com/oauth/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['read', 'full'],
    });
  });

  // The consent endpoints only accept the web app's exact Origin; the global
  // CORS policy is deliberately not what guards them.
  const WEB_ORIGIN = 'http://localhost:3000';
  const REDIRECT_URI = 'http://localhost:6274/oauth/callback';
  // RFC 7636 requires 43-128 characters.
  const CODE_VERIFIER = 'test-code-verifier-padded-to-the-minimum-len';

  // The OAuth endpoints are rate-limited per client IP, so each test speaks
  // from its own address rather than sharing one bucket with every other test.
  let clientIp = '';
  let ipCounter = 0;
  beforeEach(() => {
    ipCounter += 1;
    clientIp = `10.0.0.${ipCounter}`;
  });

  async function registerClient(): Promise<string> {
    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/register',
      payload: { client_name: 'Test MCP Client', redirect_uris: [REDIRECT_URI] },
    });
    expect(res.statusCode).toBe(201);
    return (res.json() as { client_id: string }).client_id;
  }

  async function authorizationParams(clientId: string, scope: 'read' | 'full' = 'read') {
    const { createHash } = await import('node:crypto');
    return {
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope,
      code_challenge: createHash('sha256').update(CODE_VERIFIER).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'state-1',
    };
  }

  /** Renders the consent screen, which is the only source of a consent token. */
  async function consentToken(cookie: string, params: Record<string, string>): Promise<string> {
    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'GET',
      url: `/oauth/authorize/approve?${new URLSearchParams(params).toString()}`,
      headers: { cookie, origin: WEB_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { consent_token: string }).consent_token;
  }

  async function approve(cookie: string, params: Record<string, string>): Promise<string> {
    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/authorize/approve',
      headers: { cookie, origin: WEB_ORIGIN },
      payload: { ...params, approved: true, consent_token: await consentToken(cookie, params) },
    });
    expect(res.statusCode).toBe(200);
    const code = new URL((res.json() as { redirect_to: string }).redirect_to).searchParams.get(
      'code',
    );
    expect(code).toBeTruthy();
    return code!;
  }

  async function exchange(clientId: string, code: string) {
    return testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: CODE_VERIFIER,
      }).toString(),
    });
  }

  async function grantOAuthToken(scope: 'read' | 'full' = 'read') {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId, scope);
    const res = await exchange(clientId, await approve(cookie, params));
    expect(res.statusCode).toBe(200);
    return {
      clientId,
      cookie,
      params,
      ...(res.json() as { access_token: string; refresh_token: string; scope: string }),
    };
  }

  it('accepts the space-delimited scope list a real client sends', async () => {
    const clientId = await registerClient();
    const params = await authorizationParams(clientId);

    // `scope` is a list (RFC 6749 s3.3), and a client that reads our
    // advertised `scopes_supported` asks for everything in it. mcp-remote and
    // Claude's connector both send exactly this.
    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'GET',
      url: `/oauth/authorize?${new URLSearchParams({ ...params, scope: 'read full' }).toString()}`,
    });

    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get('error')).toBeNull();
    // Both requested, so the higher one is granted — and the consent screen is
    // told the resolved scope, not the raw list, so the user sees what they
    // would actually be approving.
    expect(location.searchParams.get('scope')).toBe('full');
  });

  it.each([
    ['read full', 'full'],
    ['full read', 'full'],
    ['read', 'read'],
    ['full', 'full'],
    ['  read   full  ', 'full'],
  ])('resolves scope %j to %j', async (requested, granted) => {
    const clientId = await registerClient();
    const params = await authorizationParams(clientId);

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'GET',
      url: `/oauth/authorize?${new URLSearchParams({ ...params, scope: requested }).toString()}`,
    });

    expect(res.statusCode).toBe(302);
    expect(new URL(res.headers.location as string).searchParams.get('scope')).toBe(granted);
  });

  it.each(['', 'write', 'read write', 'READ'])(
    'refuses the unsupported scope %j back to the client',
    async (scope) => {
      const clientId = await registerClient();
      const params = await authorizationParams(clientId);

      const res = await testApp.app.inject({
        remoteAddress: clientIp,
        method: 'GET',
        url: `/oauth/authorize?${new URLSearchParams({ ...params, scope }).toString()}`,
      });

      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location as string);
      // Reported to the client's registered redirect_uri, which is validated
      // by this point, rather than rendered at the user.
      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(location.searchParams.get('error')).toBe('invalid_scope');
    },
  );

  it('issues a full-scope grant end to end when both scopes are requested', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = { ...(await authorizationParams(clientId)), scope: 'full' };

    const res = await exchange(clientId, await approve(cookie, params));

    expect(res.statusCode).toBe(200);
    const token = res.json() as { access_token: string; scope: string };
    // Echoed back so the client learns what it got (RFC 6749 s5.1).
    expect(token.scope).toBe('full');

    const called = await mcpInject(token.access_token, {
      jsonrpc: '2.0',
      id: 108,
      method: 'tools/call',
      params: { name: 'create_application', arguments: { company: 'Acme', role: 'Dev' } },
    });
    expect((called.json() as JsonRpcResponse).error).toBeUndefined();
  });

  it('registers an MCP client and exchanges a PKCE authorization code', async () => {
    const grant = await grantOAuthToken('read');

    expect(grant.scope).toBe('read');
    expect(grant.refresh_token).toMatch(/^trakwyn_mcp_refresh_/);
    const mcpRes = await mcpInject(grant.access_token, {
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/list',
    });
    expect(mcpRes.statusCode).toBe(200);
  });

  it('never lets a token response be cached', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);

    const res = await exchange(clientId, await approve(cookie, params));

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refuses a consent POST from another origin, so a cross-site page cannot mint a code', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);
    const token = await consentToken(cookie, params);

    // The session cookie is SameSite=None in production, so the browser would
    // attach it here. Origin is what stops the request.
    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/authorize/approve',
      headers: { cookie, origin: 'https://attacker.vercel.app' },
      payload: { ...params, approved: true, consent_token: token },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'invalid_request' });
  });

  it('refuses a consent POST with no Origin header at all', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/authorize/approve',
      headers: { cookie },
      payload: { ...params, approved: true },
    });

    expect(res.statusCode).toBe(403);
  });

  it('refuses a consent POST with no consent token, even from the right origin', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/authorize/approve',
      headers: { cookie, origin: WEB_ORIGIN },
      payload: { ...params, approved: true },
    });

    // `approved: true` on its own is not consent.
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request' });
  });

  it('refuses a consent token minted for a different client', async () => {
    const cookie = await registerAndGetCookie();
    const honestParams = await authorizationParams(await registerClient());
    const attackerParams = await authorizationParams(await registerClient());
    const tokenForHonestClient = await consentToken(cookie, honestParams);

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/authorize/approve',
      headers: { cookie, origin: WEB_ORIGIN },
      payload: { ...attackerParams, approved: true, consent_token: tokenForHonestClient },
    });

    expect(res.statusCode).toBe(400);
  });

  it('refuses to render a consent screen for a signed-out visitor', async () => {
    const params = await authorizationParams(await registerClient());

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'GET',
      url: `/oauth/authorize/approve?${new URLSearchParams(params).toString()}`,
      headers: { origin: WEB_ORIGIN },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'login_required' });
  });

  it('refuses to authorize on a session that has been logged out (JEF-164)', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);
    await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { cookie },
      payload: { query: 'mutation { logout }' },
    });

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'GET',
      url: `/oauth/authorize/approve?${new URLSearchParams(params).toString()}`,
      headers: { cookie, origin: WEB_ORIGIN },
    });

    // The JWT itself is still within its 15 minutes; the blocklist is what
    // stops a dead session from buying a 30-day refresh token.
    expect(res.statusCode).toBe(401);
  });

  it('rejects a replayed authorization code and revokes what the first exchange produced', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);
    const code = await approve(cookie, params);
    const first = await exchange(clientId, code);
    expect(first.statusCode).toBe(200);
    const issued = first.json() as { access_token: string };

    const replay = await exchange(clientId, code);

    expect(replay.statusCode).toBe(400);
    // The code leaked, so the tokens it already produced are suspect too.
    const afterReplay = await mcpInject(issued.access_token, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/list',
    });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('rejects an exchange whose code_verifier does not match the challenge', async () => {
    const clientId = await registerClient();
    const cookie = await registerAndGetCookie();
    const params = await authorizationParams(clientId);
    const code = await approve(cookie, params);

    const res = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        code_verifier: 'a-different-verifier-of-a-permissible-length',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_grant' });
  });

  it('rotates refresh tokens and burns the family when an old one is replayed', async () => {
    const grant = await grantOAuthToken();

    const refreshedRes = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'refresh_token',
        refresh_token: grant.refresh_token,
        client_id: grant.clientId,
      },
    });
    expect(refreshedRes.statusCode).toBe(200);
    const refreshed = refreshedRes.json() as { access_token: string; refresh_token: string };
    expect(refreshed.refresh_token).not.toBe(grant.refresh_token);

    const reusedRes = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'refresh_token',
        refresh_token: grant.refresh_token,
        client_id: grant.clientId,
      },
    });

    expect(reusedRes.statusCode).toBe(400);
    // The access token handed out moments ago dies with the family, rather
    // than staying usable for the rest of its hour.
    const afterBurn = await mcpInject(refreshed.access_token, {
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/list',
    });
    expect(afterBurn.statusCode).toBe(401);
  });

  it('revokes the whole grant when handed an access token', async () => {
    const grant = await grantOAuthToken();

    const revokeRes = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/revoke',
      payload: { token: grant.access_token },
    });
    expect(revokeRes.statusCode).toBe(200);

    const revokedMcpRes = await mcpInject(grant.access_token, {
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/list',
    });
    expect(revokedMcpRes.statusCode).toBe(401);
    // The refresh token must go too, or "revoked" lasts until the next refresh.
    const refreshRes = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'refresh_token',
        refresh_token: grant.refresh_token,
        client_id: grant.clientId,
      },
    });
    expect(refreshRes.statusCode).toBe(400);
  });

  it('accepts a refresh token at the revocation endpoint (RFC 7009)', async () => {
    const grant = await grantOAuthToken();

    const revokeRes = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/revoke',
      payload: { token: grant.refresh_token },
    });
    expect(revokeRes.statusCode).toBe(200);

    // A 200 that revoked nothing would be worse than an error: the client
    // believes it disconnected while the credential stays live for 30 days.
    const stillWorks = await mcpInject(grant.access_token, {
      jsonrpc: '2.0',
      id: 104,
      method: 'tools/list',
    });
    expect(stillWorks.statusCode).toBe(401);
  });

  it('gates write tools on the scope the user consented to, not merely on being authenticated', async () => {
    const readGrant = await grantOAuthToken('read');

    const listed = await mcpInject(readGrant.access_token, {
      jsonrpc: '2.0',
      id: 105,
      method: 'tools/list',
    });
    const tools = (listed.json() as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((tool) => tool.name)).not.toContain('create_application');

    const called = await mcpInject(readGrant.access_token, {
      jsonrpc: '2.0',
      id: 106,
      method: 'tools/call',
      params: { name: 'create_application', arguments: { company: 'Acme', role: 'Dev' } },
    });

    // Consenting to `read` must buy exactly what a read-only API token buys.
    expect((called.json() as JsonRpcResponse).error?.message).toMatch(/read-only/i);
  });

  it('lets a full-scope grant call a write tool', async () => {
    const fullGrant = await grantOAuthToken('full');

    const called = await mcpInject(fullGrant.access_token, {
      jsonrpc: '2.0',
      id: 107,
      method: 'tools/call',
      params: { name: 'create_application', arguments: { company: 'Acme', role: 'Dev' } },
    });

    expect((called.json() as JsonRpcResponse).error).toBeUndefined();
  });

  const GRANTS_QUERY = `
    query McpOAuthGrants {
      mcpOAuthGrants { id clientName scope authorizedAt lastUsedAt }
    }
  `;
  const REVOKE_GRANT_MUTATION = `
    mutation RevokeMcpOAuthGrant($id: ID!) { revokeMcpOAuthGrant(id: $id) }
  `;

  function graphql(cookie: string | null, query: string, variables?: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: cookie ? { cookie } : undefined,
      payload: { query, variables },
    });
  }

  it('lists a grant to the user who authorized it, and revoking it kills the client', async () => {
    const grant = await grantOAuthToken('full');

    const listed = await graphql(grant.cookie, GRANTS_QUERY);
    const grants = (
      listed.json() as GraphQLResponse<{ mcpOAuthGrants: Array<Record<string, unknown>> }>
    ).data!.mcpOAuthGrants;
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ clientName: 'Test MCP Client', scope: 'full' });

    const revoked = await graphql(grant.cookie, REVOKE_GRANT_MUTATION, { id: grants[0].id });
    expect(
      (revoked.json() as GraphQLResponse<{ revokeMcpOAuthGrant: boolean }>).data!
        .revokeMcpOAuthGrant,
    ).toBe(true);

    // The access token stops working immediately...
    const afterRevoke = await mcpInject(grant.access_token, {
      jsonrpc: '2.0',
      id: 200,
      method: 'tools/list',
    });
    expect(afterRevoke.statusCode).toBe(401);

    // ...and the refresh token cannot bring it back, which is the whole point.
    const refreshed = await testApp.app.inject({
      remoteAddress: clientIp,
      method: 'POST',
      url: '/oauth/token',
      payload: {
        grant_type: 'refresh_token',
        refresh_token: grant.refresh_token,
        client_id: grant.clientId,
      },
    });
    expect(refreshed.statusCode).toBe(400);

    // And it disappears from the list rather than lingering as revoked.
    const relisted = await graphql(grant.cookie, GRANTS_QUERY);
    expect(
      (relisted.json() as GraphQLResponse<{ mcpOAuthGrants: unknown[] }>).data!.mcpOAuthGrants,
    ).toEqual([]);
  });

  it("refuses to revoke another user's grant, and leaves it working", async () => {
    const grant = await grantOAuthToken('read');
    const listed = await graphql(grant.cookie, GRANTS_QUERY);
    const grantId = (listed.json() as GraphQLResponse<{ mcpOAuthGrants: Array<{ id: string }> }>)
      .data!.mcpOAuthGrants[0].id;
    const attackerCookie = await registerAndGetCookie();

    const res = await graphql(attackerCookie, REVOKE_GRANT_MUTATION, { id: grantId });

    expect(
      (res.json() as GraphQLResponse<{ revokeMcpOAuthGrant: boolean }>).data!.revokeMcpOAuthGrant,
    ).toBe(false);
    // Not merely refused — the victim's client is untouched.
    const stillWorks = await mcpInject(grant.access_token, {
      jsonrpc: '2.0',
      id: 201,
      method: 'tools/list',
    });
    expect(stillWorks.statusCode).toBe(200);
  });

  it('refuses to list grants without a session', async () => {
    const res = await graphql(null, GRANTS_QUERY);

    const body = res.json() as GraphQLResponse<unknown>;
    expect(body.errors?.[0]?.extensions?.code).toBe('UNAUTHORIZED');
  });

  it('rejects a bearer credential that is not an API token (e.g. a JWT)', async () => {
    const accessToken = await registerAndGetAccessToken();

    const res = await mcpInject(accessToken, { jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for a malformed JSON-RPC envelope', async () => {
    const accessToken = await registerAndGetAccessToken();
    const apiToken = await createApiToken(accessToken);

    const res = await mcpInject(apiToken, { id: 1, method: 'tools/list' });

    expect(res.statusCode).toBe(400);
    const body = res.json() as JsonRpcResponse;
    expect(body.error?.message).toBe('Invalid Request');
  });

  it('lists the advertised tool catalogue via tools/list', async () => {
    const accessToken = await registerAndGetAccessToken();
    const apiToken = await createApiToken(accessToken);

    const res = await mcpInject(apiToken, { jsonrpc: '2.0', id: 42, method: 'tools/list' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as JsonRpcResponse & { result: { tools: Array<{ name: string }> } };
    expect(body.id).toBe(42);
    const toolNames = body.result.tools.map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining(['list_applications', 'get_application', 'list_notes']),
    );
  });

  it('round-trips a tools/call for list_applications scoped to the authenticated user', async () => {
    const accessToken = await registerAndGetAccessToken();
    const apiToken = await createApiToken(accessToken);

    const createRes = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        query: CREATE_APPLICATION_MUTATION,
        variables: { input: { company: 'Acme Corp', role: 'Staff Engineer', status: 'applied' } },
      },
    });
    const createBody = createRes.json() as GraphQLResponse<{
      createApplication: { id: string; company: string };
    }>;
    expect(createBody.errors).toBeUndefined();

    const res = await mcpInject(apiToken, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'list_applications', arguments: {} },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as JsonRpcResponse & {
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(body.id).toBe(7);
    // list_applications returns a page envelope (JEF-172), not a bare array,
    // so a client can follow nextCursor rather than receiving everything.
    const page = JSON.parse(body.result.content[0].text) as {
      items: Array<{ company: string }>;
      hasNextPage: boolean;
      nextCursor: string | null;
    };
    expect(page.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ company: 'Acme Corp' })]),
    );
    expect(page).toMatchObject({ hasNextPage: false, nextCursor: null });
  });

  it('bounds list_applications by limit and hands back a usable cursor', async () => {
    const accessToken = await registerAndGetAccessToken();
    const apiToken = await createApiToken(accessToken);

    for (const company of ['Acme', 'Globex', 'Initech']) {
      await testApp.app.inject({
        method: 'POST',
        url: '/graphql',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          query: CREATE_APPLICATION_MUTATION,
          variables: { input: { company, role: 'Engineer', status: 'applied' } },
        },
      });
    }

    const res = await mcpInject(apiToken, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'list_applications', arguments: { limit: 2 } },
    });

    const body = res.json() as JsonRpcResponse & {
      result: { content: Array<{ text: string }> };
    };
    const page = JSON.parse(body.result.content[0].text) as {
      items: unknown[];
      hasNextPage: boolean;
      nextCursor: string | null;
    };

    expect(page.items).toHaveLength(2);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  describe('write tools and token scope (JEF-176)', () => {
    it('refuses a write tool for a genuinely read-scoped token, end to end', async () => {
      const accessToken = await registerAndGetAccessToken();
      const readToken = await createApiToken(accessToken, 'read');

      const res = await mcpInject(readToken, {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'create_application',
          arguments: { company: 'Acme', role: 'Engineer' },
        },
      });

      const body = res.json() as JsonRpcResponse;
      expect(body.error?.message).toMatch(/read-only/);

      // And nothing was created: the read token can still list, and sees none.
      const listRes = await mcpInject(readToken, {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: { name: 'list_applications', arguments: {} },
      });
      const listBody = listRes.json() as JsonRpcResponse & {
        result: { content: Array<{ text: string }> };
      };
      const page = JSON.parse(listBody.result.content[0].text) as { items: unknown[] };
      expect(page.items).toHaveLength(0);
    });

    it('allows a write tool for a full-scoped token and actually persists', async () => {
      const accessToken = await registerAndGetAccessToken();
      const fullToken = await createApiToken(accessToken, 'full');

      const res = await mcpInject(fullToken, {
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'create_application',
          arguments: { company: 'Globex', role: 'Staff Engineer' },
        },
      });
      const body = res.json() as JsonRpcResponse;
      expect(body.error).toBeUndefined();

      const listRes = await mcpInject(fullToken, {
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: { name: 'list_applications', arguments: {} },
      });
      const listBody = listRes.json() as JsonRpcResponse & {
        result: { content: Array<{ text: string }> };
      };
      const page = JSON.parse(listBody.result.content[0].text) as {
        items: Array<{ company: string }>;
      };
      expect(page.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ company: 'Globex' })]),
      );
    });

    it('hides write tools from a read token in tools/list', async () => {
      const accessToken = await registerAndGetAccessToken();
      const readToken = await createApiToken(accessToken, 'read');

      const res = await mcpInject(readToken, { jsonrpc: '2.0', id: 24, method: 'tools/list' });
      const body = res.json() as JsonRpcResponse & {
        result: { tools: Array<{ name: string }> };
      };
      const names = body.result.tools.map((t) => t.name);

      expect(names).toContain('list_applications');
      expect(names).not.toContain('create_application');
      // `access` is internal and must not leak over the wire.
      expect(body.result.tools.every((t) => !('access' in t))).toBe(true);
    });
  });

  it('returns an INVALID_PARAMS error for get_application with no applicationId', async () => {
    const accessToken = await registerAndGetAccessToken();
    const apiToken = await createApiToken(accessToken);

    const res = await mcpInject(apiToken, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'get_application', arguments: {} },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as JsonRpcResponse;
    expect(body.error).toEqual(
      expect.objectContaining({ message: expect.stringContaining('applicationId is required') }),
    );
  });

  it('returns a METHOD_NOT_FOUND error for an unknown tool', async () => {
    const accessToken = await registerAndGetAccessToken();
    const apiToken = await createApiToken(accessToken);

    const res = await mcpInject(apiToken, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'not_a_real_tool', arguments: {} },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as JsonRpcResponse;
    expect(body.error?.message).toContain('Unknown tool');
  });
});
