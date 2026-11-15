import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { ProjectRef } from '#src/http/schema/types/ProjectType.js';
import {
  CreateProjectInput,
  UpdateProjectInput,
} from '#src/http/schema/types/inputs/ProjectInputs.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createProject', (t) =>
  t.field({
    type: ProjectRef,
    args: {
      input: t.arg({ type: CreateProjectInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { projectResolver } = ctx.diScope.cradle;
      return projectResolver.createProject(ctx.user.sub, {
        name: args.input.name,
        role: args.input.role ?? undefined,
        url: args.input.url ?? undefined,
        startDate: args.input.startDate ?? undefined,
        endDate: args.input.endDate ?? undefined,
        description: args.input.description ?? undefined,
      });
    },
  }),
);

builder.mutationField('updateProject', (t) =>
  t.field({
    type: ProjectRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateProjectInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { projectResolver } = ctx.diScope.cradle;
      return projectResolver.updateProject(ctx.user.sub, args.id, {
        name: args.input.name ?? undefined,
        role: args.input.role,
        url: args.input.url,
        startDate: args.input.startDate,
        endDate: args.input.endDate,
        description: args.input.description,
      });
    },
  }),
);

builder.mutationField('deleteProject', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { projectResolver } = ctx.diScope.cradle;
      await projectResolver.deleteProject(ctx.user.sub, args.id);
      return true;
    },
  }),
);
