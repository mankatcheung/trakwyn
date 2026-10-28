import { builder } from '#src/http/schema/builder.js';
import type { UserDTO } from '#src/interface-adapters/mappers/UserMapper.js';
import { StepUpMethodEnum } from '#src/http/schema/types/enums/StepUpMethodEnum.js';

export const UserRef = builder.objectRef<UserDTO>('User');
UserRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
    emailVerified: t.exposeBoolean('emailVerified'),
    name: t.exposeString('name', { nullable: true }),
    timezone: t.exposeString('timezone', { nullable: true }),
    targetRole: t.exposeString('targetRole', { nullable: true }),
    avatarUrl: t.exposeString('avatarUrl', { nullable: true }),
    backupEmail: t.exposeString('backupEmail', { nullable: true }),
    backupEmailVerifiedAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (user) => user.backupEmailVerifiedAt?.toISOString() ?? null,
    }),
    defaultLlmProvider: t.exposeString('defaultLlmProvider', { nullable: true }),
    customAiPrompt: t.exposeString('customAiPrompt', { nullable: true }),
    useCrossApplicationContext: t.exposeBoolean('useCrossApplicationContext'),
    llmFallbackWhenLimited: t.exposeBoolean('llmFallbackWhenLimited'),
    storageUsedBytes: t.exposeFloat('storageUsedBytes'),
    storageLimitBytes: t.exposeFloat('storageLimitBytes'),
    onboardingChecklistDismissedAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (user) => user.onboardingChecklistDismissedAt?.toISOString() ?? null,
    }),
    hasPassword: t.exposeBoolean('hasPassword', {
      description: 'False for an account created through Google or GitHub that never set one.',
    }),
    stepUpMethods: t.field({
      type: [StepUpMethodEnum],
      description:
        'How this user confirms it is them before a sensitive change, in the order to offer them (JEF-463).',
      resolve: (user, _args, ctx) => ctx.diScope.cradle.getStepUpMethodsUseCase.execute(user.id),
    }),
    deletionScheduledAt: t.field({
      type: 'String',
      nullable: true,
      description:
        'When the account will be deleted; null unless a deletion is scheduled (JEF-463). While set, only cancelling it is allowed.',
      resolve: (user) => user.deletionScheduledAt?.toISOString() ?? null,
    }),
  }),
});
