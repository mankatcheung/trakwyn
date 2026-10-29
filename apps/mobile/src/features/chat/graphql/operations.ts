// Hand-written to match apps/web's assistant/-shared.ts field-for-field —
// codegen is still deferred for apps/mobile (see JEF-261/262).

const CONVERSATION_FIELDS = `
  id
  title
  llmProvider
  llmModel
  createdAt
  updatedAt
`;

export const CONVERSATIONS_QUERY = `
  query Conversations {
    conversations {
      ${CONVERSATION_FIELDS}
    }
  }
`;

export const CHAT_HISTORY_QUERY = `
  query ChatHistory($conversationId: ID!) {
    chatHistory(conversationId: $conversationId) {
      id
      role
      content
      createdAt
      proposals {
        id
        toolName
        summary
        status
        error
      }
    }
  }
`;

const PROPOSAL_FIELDS = `
  id
  toolName
  summary
  status
  error
`;

/** Applies a write the assistant proposed (JEF-469). The server runs what it saved; the app sends only the id. */
export const CONFIRM_CHAT_ACTION_MUTATION = `
  mutation ConfirmChatAction($id: ID!) {
    confirmChatAction(id: $id) {
      ${PROPOSAL_FIELDS}
    }
  }
`;

export const DISMISS_CHAT_ACTION_MUTATION = `
  mutation DismissChatAction($id: ID!) {
    dismissChatAction(id: $id) {
      ${PROPOSAL_FIELDS}
    }
  }
`;

export const CREATE_CONVERSATION_MUTATION = `
  mutation CreateConversation($provider: String, $model: String) {
    createConversation(provider: $provider, model: $model) {
      ${CONVERSATION_FIELDS}
    }
  }
`;

export const DELETE_CONVERSATION_MUTATION = `
  mutation DeleteConversation($id: ID!) {
    deleteConversation(id: $id)
  }
`;
