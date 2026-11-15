import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { JobApplicationRef } from '#src/http/schema/types/ApplicationType.js';
import { ApplicationStatusEnum } from '#src/http/schema/types/enums/ApplicationStatusEnum.js';
import {
  BulkRestoreResultRef,
  EmptyTrashResultRef,
} from '#src/http/schema/types/TrashActionResultTypes.js';
import {
  CreateApplicationInput,
  UpdateApplicationInput,
  MoveApplicationOnBoardInput,
} from '#src/http/schema/types/inputs/ApplicationInputs.js';
import type { ApplicationStatus } from '#src/domain/application/ApplicationStatus.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createApplication', (t) =>
  t.field({
    type: JobApplicationRef,
    args: {
      input: t.arg({ type: CreateApplicationInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.createApplication(ctx.user.sub, {
        company: args.input.company,
        role: args.input.role,
        status: (args.input.status as ApplicationStatus) ?? undefined,
        jobUrl: args.input.jobUrl ?? undefined,
        location: args.input.location ?? undefined,
        salaryRange: args.input.salaryRange ?? undefined,
        description: args.input.description ?? undefined,
        postingText: args.input.postingText ?? undefined,
        starred: args.input.starred ?? undefined,
        source: args.input.source ?? undefined,
        followUpAt: args.input.followUpAt ? new Date(args.input.followUpAt) : undefined,
        tags: args.input.tags ?? undefined,
      });
    },
  }),
);

builder.mutationField('updateApplication', (t) =>
  t.field({
    type: JobApplicationRef,
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateApplicationInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.updateApplication(ctx.user.sub, args.id, {
        company: args.input.company ?? undefined,
        role: args.input.role ?? undefined,
        status: (args.input.status as ApplicationStatus) ?? undefined,
        jobUrl: args.input.jobUrl,
        location: args.input.location,
        salaryRange: args.input.salaryRange,
        description: args.input.description,
        postingText: args.input.postingText,
        starred: args.input.starred ?? undefined,
        source: args.input.source,
        tags: args.input.tags ?? undefined,
        followUpAt:
          args.input.followUpAt !== undefined
            ? args.input.followUpAt
              ? new Date(args.input.followUpAt)
              : null
            : undefined,
      });
    },
  }),
);

builder.mutationField('moveApplicationOnBoard', (t) =>
  t.field({
    type: [JobApplicationRef],
    description:
      'Place a card in a kanban column. Returns the destination column in its new order.',
    args: {
      input: t.arg({ type: MoveApplicationOnBoardInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.moveApplicationOnBoard(ctx.user.sub, {
        applicationId: String(args.input.applicationId),
        toStatus: args.input.toStatus as ApplicationStatus,
        orderedIds: (args.input.orderedIds as string[]).map(String),
      });
    },
  }),
);

builder.mutationField('deleteApplication', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.deleteApplication(ctx.user.sub, args.id);
    },
  }),
);

builder.mutationField('restoreApplication', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.restoreApplication(ctx.user.sub, String(args.id));
    },
  }),
);

builder.mutationField('permanentlyDeleteApplication', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.permanentlyDeleteApplication(ctx.user.sub, String(args.id));
    },
  }),
);

builder.mutationField('bulkRestoreApplications', (t) =>
  t.field({
    type: BulkRestoreResultRef,
    args: {
      ids: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.bulkRestoreApplications(ctx.user.sub, args.ids as string[]);
    },
  }),
);

builder.mutationField('emptyTrash', (t) =>
  t.field({
    type: EmptyTrashResultRef,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.emptyTrash(ctx.user.sub);
    },
  }),
);

builder.mutationField('bulkUpdateApplications', (t) =>
  t.field({
    type: [JobApplicationRef],
    args: {
      ids: t.arg.idList({ required: true }),
      status: t.arg({ type: ApplicationStatusEnum, required: false }),
      starred: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.bulkUpdateApplications(ctx.user.sub, args.ids as string[], {
        status: (args.status as ApplicationStatus) ?? undefined,
        starred: args.starred ?? undefined,
      });
    },
  }),
);

builder.mutationField('bulkAddTagToApplications', (t) =>
  t.field({
    type: [JobApplicationRef],
    args: {
      ids: t.arg.idList({ required: true }),
      tag: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.bulkAddTagToApplications(
        ctx.user.sub,
        args.ids as string[],
        args.tag,
      );
    },
  }),
);

builder.mutationField('bulkDeleteApplications', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      ids: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { applicationResolver } = ctx.diScope.cradle;
      return applicationResolver.bulkDeleteApplications(ctx.user.sub, args.ids as string[]);
    },
  }),
);
