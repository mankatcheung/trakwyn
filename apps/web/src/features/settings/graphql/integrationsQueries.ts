import { graphql } from '#/graphql/generated';

/** Documents for Settings → Integrations: API tokens, MCP clients and share links. */

export const API_TOKENS_QUERY = graphql(`
  query ApiTokens {
    apiTokens {
      id
      name
      scope
      lastUsedAt
      createdAt
    }
  }
`);

export const CREATE_API_TOKEN = graphql(`
  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) {
      id
      name
      token
      scope
      createdAt
    }
  }
`);

export const DELETE_API_TOKEN = graphql(`
  mutation DeleteApiToken($id: ID!) {
    deleteApiToken(id: $id)
  }
`);

export const MCP_OAUTH_GRANTS_QUERY = graphql(`
  query McpOAuthGrants {
    mcpOAuthGrants {
      id
      clientName
      scope
      authorizedAt
      lastUsedAt
    }
  }
`);

export const REVOKE_MCP_OAUTH_GRANT = graphql(`
  mutation RevokeMcpOAuthGrant($id: ID!) {
    revokeMcpOAuthGrant(id: $id)
  }
`);

export const SHARE_LINKS_QUERY = graphql(`
  query ShareLinks {
    shareLinks {
      id
      name
      lastUsedAt
      createdAt
    }
  }
`);

export const CREATE_SHARE_LINK = graphql(`
  mutation CreateShareLink($name: String!) {
    createShareLink(name: $name) {
      id
      name
      token
      createdAt
    }
  }
`);

export const DELETE_SHARE_LINK = graphql(`
  mutation DeleteShareLink($id: ID!) {
    deleteShareLink(id: $id)
  }
`);
