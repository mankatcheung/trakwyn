import { defaultFieldResolver, type GraphQLSchema } from 'graphql';
import type { GraphQLContext } from '#src/http/context.js';

/**
 * The only root fields an account scheduled for deletion may use (JEF-463):
 * read who it is (`me` carries `deletionScheduledAt`), cancel, confirm a link
 * it already has, and sign out or keep the session alive while deciding.
 * Everything else is refused with `ACCOUNT_DELETION_SCHEDULED`.
 */
export const ALLOWED_WHILE_DELETION_SCHEDULED: ReadonlySet<string> = new Set([
  'me',
  'cancelAccountDeletion',
  'confirmAccountDeletion',
  'logout',
  'refreshToken',
  'refreshTokenMobile',
]);

/**
 * Puts the deletion wall in front of every other root field, the same way and
 * for the same reasons as `enforceEmailVerification`: on the resolvers rather
 * than a Mercurius hook (which cannot stop a request), a signed-out request
 * left to the resolver's own check, and each field refused on its own.
 */
export function enforceAccountActive(schema: GraphQLSchema): GraphQLSchema {
  for (const rootType of [schema.getQueryType(), schema.getMutationType()]) {
    if (!rootType) continue;
    for (const [name, field] of Object.entries(rootType.getFields())) {
      if (ALLOWED_WHILE_DELETION_SCHEDULED.has(name)) continue;
      const resolve = field.resolve ?? defaultFieldResolver;
      field.resolve = async (source, args, context: GraphQLContext, info) => {
        if (context.user) {
          await context.diScope.cradle.assertAccountActiveUseCase.execute(context.user.sub);
        }
        return resolve(source, args, context, info);
      };
    }
  }
  return schema;
}
