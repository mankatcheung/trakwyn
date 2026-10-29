import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { MessageRef } from '#src/http/schema/types/MessageType.js';
import { ConversationRef } from '#src/http/schema/types/ConversationType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('conversations', (t) =>
  t.field({
    type: [ConversationRef],
    args: {
      // Bounds the fetch for surfaces that only show a window (the assistant
      // sidebar's ten most recent). Omitted = the user's full history, which
      // is what the history page still wants.
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { listConversationsUseCase, conversationMapper } = ctx.diScope.cradle;
      const conversations = await listConversationsUseCase.execute(
        ctx.user.sub,
        args.limit ?? undefined,
      );
      return conversations.map((c) => conversationMapper.toDTO(c));
    },
  }),
);

builder.queryField('searchConversations', (t) =>
  t.field({
    type: [ConversationRef],
    args: {
      query: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { searchConversationsUseCase, conversationMapper } = ctx.diScope.cradle;
      const conversations = await searchConversationsUseCase.execute(ctx.user.sub, args.query);
      return conversations.map((c) => conversationMapper.toDTO(c));
    },
  }),
);

builder.queryField('chatHistory', (t) =>
  t.field({
    type: [MessageRef],
    args: {
      conversationId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { getChatHistoryUseCase, messageMapper } = ctx.diScope.cradle;
      const messages = await getChatHistoryUseCase.execute({
        userId: ctx.user.sub,
        conversationId: String(args.conversationId),
      });
      return messages.map(({ proposals, ...m }) => messageMapper.toDTO(m, proposals));
    },
  }),
);
