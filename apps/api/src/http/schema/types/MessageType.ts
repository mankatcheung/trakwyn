import { builder } from '#src/http/schema/builder.js';
import type {
  ChatActionProposalDTO,
  MessageDTO,
} from '#src/interface-adapters/mappers/MessageMapper.js';

export const ChatActionProposalRef = builder.objectRef<ChatActionProposalDTO>('ChatActionProposal');

/**
 * A write the assistant proposed (JEF-469). `status` is `pending`,
 * `confirmed`, `dismissed`, `expired` or `failed`; `error` says why a
 * confirmed change failed.
 */
builder.objectType(ChatActionProposalRef, {
  fields: (t) => ({
    id: t.exposeString('id'),
    toolName: t.exposeString('toolName'),
    summary: t.exposeString('summary'),
    status: t.exposeString('status'),
    error: t.exposeString('error', { nullable: true }),
  }),
});

export const MessageRef = builder.objectRef<MessageDTO>('Message');

builder.objectType(MessageRef, {
  fields: (t) => ({
    id: t.exposeString('id'),
    role: t.exposeString('role'),
    content: t.exposeString('content'),
    createdAt: t.exposeString('createdAt'),
    proposals: t.field({ type: [ChatActionProposalRef], resolve: (m) => m.proposals }),
  }),
});
