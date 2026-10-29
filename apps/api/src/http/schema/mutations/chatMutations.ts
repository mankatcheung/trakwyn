import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ConversationRef } from '#src/http/schema/types/ConversationType.js';
import { ChatActionProposalRef } from '#src/http/schema/types/MessageType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createConversation', (t) =>
  t.field({
    type: ConversationRef,
    args: {
      provider: t.arg.string({ required: false }),
      model: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { createConversationUseCase, conversationMapper } = ctx.diScope.cradle;
      try {
        const conversation = await createConversationUseCase.execute({
          userId: ctx.user.sub,
          provider: args.provider,
          model: args.model,
        });
        return conversationMapper.toDTO(conversation);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('deleteConversation', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { deleteConversationUseCase } = ctx.diScope.cradle;
      try {
        await deleteConversationUseCase.execute({
          userId: ctx.user.sub,
          conversationId: String(args.id),
        });
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

/**
 * Applies a write the assistant proposed (JEF-469). Only the saved proposal
 * runs: the client sends an id, never a tool or arguments. Not on the
 * email-verification allowlist, so the wall covers it.
 */
builder.mutationField('confirmChatAction', (t) =>
  t.field({
    type: ChatActionProposalRef,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { confirmChatActionUseCase, messageMapper } = ctx.diScope.cradle;
      try {
        const { proposal } = await confirmChatActionUseCase.execute({
          userId: ctx.user.sub,
          proposalId: String(args.id),
        });
        return messageMapper.proposalToDTO(proposal);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('dismissChatAction', (t) =>
  t.field({
    type: ChatActionProposalRef,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { dismissChatActionUseCase, messageMapper } = ctx.diScope.cradle;
      try {
        const { proposal } = await dismissChatActionUseCase.execute({
          userId: ctx.user.sub,
          proposalId: String(args.id),
        });
        return messageMapper.proposalToDTO(proposal);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
