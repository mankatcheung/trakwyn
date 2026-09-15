/**
 * Profile fields, avatar, notification preferences and data import.
 *
 * One of the per-concern modules split out of the former 498-line
 * `userMutations.ts` (JEF-255); `userMutations.ts` still registers them all.
 */

import { DigestFrequencyEnum } from '#src/http/schema/types/enums/DigestFrequencyEnum.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { GraphQLError } from 'graphql';
import { ImportSummaryRef } from '#src/http/schema/types/ImportSummaryType.js';
import { UploadUrlPayloadRef } from '#src/http/schema/types/AuthPayloadType.js';
import { builder } from '#src/http/schema/builder.js';
import { fromCodedError } from '#src/http/errors/AppError.js';

builder.mutationField('updateProfile', (t) =>
  t.boolean({
    args: {
      name: t.arg.string({ required: false }),
      timezone: t.arg.string({ required: false }),
      targetRole: t.arg.string({ required: false }),
      customAiPrompt: t.arg.string({ required: false }),
      useCrossApplicationContext: t.arg.boolean({ required: false }),
      llmFallbackWhenLimited: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.updateProfile(
          ctx.user.sub,
          args.name,
          args.timezone,
          args.targetRole,
          args.customAiPrompt,
          args.useCrossApplicationContext ?? undefined,
          args.llmFallbackWhenLimited ?? undefined,
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('requestAvatarUploadUrl', (t) =>
  t.field({
    type: UploadUrlPayloadRef,
    args: {
      filename: t.arg.string({ required: true }),
      mimeType: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        return await userResolver.requestAvatarUploadUrl(
          ctx.user.sub,
          args.filename,
          args.mimeType,
        );
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('confirmAvatar', (t) =>
  t.string({
    args: {
      storageKey: t.arg.string({ required: true }),
      mimeType: t.arg.string({ required: true }),
      sizeBytes: t.arg.int({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        return await userResolver.confirmAvatar(
          ctx.user.sub,
          args.storageKey,
          args.mimeType,
          args.sizeBytes,
        );
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('removeAvatar', (t) =>
  t.boolean({
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.removeAvatar(ctx.user.sub);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('updateNotificationPreferences', (t) =>
  t.boolean({
    args: {
      weeklyDigestEnabled: t.arg.boolean({ required: false }),
      digestFrequency: t.arg({ type: DigestFrequencyEnum, required: false }),
      followUpRemindersEnabled: t.arg.boolean({ required: false }),
      pushNotificationsEnabled: t.arg.boolean({ required: false }),
      weeklyApplicationGoal: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.updateNotificationPreferences(
          ctx.user.sub,
          args.weeklyDigestEnabled ?? undefined,
          args.followUpRemindersEnabled ?? undefined,
          args.pushNotificationsEnabled ?? undefined,
          args.weeklyApplicationGoal ?? undefined,
          args.digestFrequency ?? undefined,
        );
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('dismissOnboardingChecklist', (t) =>
  t.boolean({
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        await userResolver.dismissOnboardingChecklist(ctx.user.sub);
        return true;
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('importUserData', (t) =>
  t.field({
    type: ImportSummaryRef,
    args: {
      data: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { userResolver } = ctx.diScope.cradle;
      try {
        return await userResolver.importUserData(ctx.user.sub, args.data);
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
