import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { LanguageRef } from '#src/http/schema/types/LanguageType.js';
import {
  CreateLanguageInput,
  UpdateLanguageInput,
} from '#src/http/schema/types/inputs/LanguageInputs.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createLanguage', (t) =>
  t.field({
    type: LanguageRef,
    args: {
      input: t.arg({ type: CreateLanguageInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { languageResolver } = ctx.diScope.cradle;
      return languageResolver.createLanguage(ctx.user.sub, {
        name: args.input.name,
        proficiency: args.input.proficiency ?? undefined,
      });
    },
  }),
);

builder.mutationField('updateLanguage', (t) =>
  t.field({
    type: LanguageRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateLanguageInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { languageResolver } = ctx.diScope.cradle;
      return languageResolver.updateLanguage(ctx.user.sub, args.id, {
        name: args.input.name ?? undefined,
        proficiency: args.input.proficiency,
      });
    },
  }),
);

builder.mutationField('deleteLanguage', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { languageResolver } = ctx.diScope.cradle;
      await languageResolver.deleteLanguage(ctx.user.sub, args.id);
      return true;
    },
  }),
);
