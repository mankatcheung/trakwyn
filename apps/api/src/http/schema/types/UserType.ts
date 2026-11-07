import { builder } from '#src/http/schema/builder.js';
import type { UserDTO } from '#src/interface-adapters/mappers/UserMapper.js';
import { AiCreditsRef } from '#src/http/schema/types/BillingStatusType.js';
import { OnboardingGoalEnum } from '#src/http/schema/types/enums/OnboardingGoalEnum.js';
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
    phone: t.exposeString('phone', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    profileLinks: t.exposeStringList('profileLinks'),
    avatarUrl: t.exposeString('avatarUrl', { nullable: true }),
    backupEmail: t.exposeString('backupEmail', { nullable: true }),
    backupEmailVerifiedAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (user) => user.backupEmailVerifiedAt?.toISOString() ?? null,
    }),
    aiProviderOrder: t.field({
      type: ['String'],
      description:
        "The providers AI calls try, first to last (JEF-503): 'trakwyn' and/or the ids of the user's own keys. A call never runs on one that is not listed.",
      resolve: (user, _args, ctx) => ctx.diScope.cradle.getAiProviderOrderUseCase.execute(user.id),
    }),
    defaultLlmProvider: t.exposeString('defaultLlmProvider', {
      nullable: true,
      deprecationReason: 'Use aiProviderOrder (JEF-503). Kept for apps already in the stores.',
    }),
    customAiPrompt: t.exposeString('customAiPrompt', { nullable: true }),
    useCrossApplicationContext: t.exposeBoolean('useCrossApplicationContext'),
    llmFallbackWhenLimited: t.exposeBoolean('llmFallbackWhenLimited', {
      deprecationReason: 'Use aiProviderOrder (JEF-503). Kept for apps already in the stores.',
    }),
    aiSource: t.exposeString('aiSource', {
      deprecationReason: 'Use aiProviderOrder (JEF-503). Kept for apps already in the stores.',
    }),
    storageUsedBytes: t.exposeFloat('storageUsedBytes'),
    storageLimitBytes: t.exposeFloat('storageLimitBytes'),
    aiCredits: t.field({ type: AiCreditsRef, resolve: (user) => user.aiCredits }),
    onboardingChecklistDismissedAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (user) => user.onboardingChecklistDismissedAt?.toISOString() ?? null,
    }),
    onboardingGoals: t.field({
      type: [OnboardingGoalEnum],
      resolve: (user) => user.onboardingGoals,
    }),
    onboardingCompletedAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (user) => user.onboardingCompletedAt?.toISOString() ?? null,
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
