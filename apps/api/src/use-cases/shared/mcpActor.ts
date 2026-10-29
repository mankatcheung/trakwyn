/**
 * Who made a change when it came through an MCP client rather than the web
 * app (JEF-466). `apiTokenId` is the credential to revoke: an API token's id,
 * or for an OAuth grant the grant (family) id, which is what the user revokes
 * in Settings. `apiTokenName` is what they would recognise it by: the token's
 * name, or the OAuth client's registered name.
 */
export interface McpActor {
  source: 'mcp';
  apiTokenId: string;
  apiTokenName: string;
}

/**
 * The activity-log payload fields that record `actor`, or nothing for a user
 * acting directly, so a write made in the app logs exactly what it did before.
 */
export function actorPayload(actor: McpActor | undefined): Partial<McpActor> {
  return actor
    ? { source: actor.source, apiTokenId: actor.apiTokenId, apiTokenName: actor.apiTokenName }
    : {};
}
