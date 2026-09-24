import { builder } from '#src/http/schema/builder.js';
import type { UserDTO } from '#src/interface-adapters/mappers/UserMapper.js';

export const UserRef = builder.objectRef<UserDTO>('User');
UserRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email'),
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
    onboardingChecklistDismissedAt: t.field({
      type: 'String',
      nullable: true,
      resolve: (user) => user.onboardingChecklistDismissedAt?.toISOString() ?? null,
    }),
  }),
});
