import { defaultFieldResolver, type GraphQLSchema } from 'graphql';
import type { GraphQLContext } from '#src/http/context.js';

/**
 * The only root fields a signed-in user whose email is not verified may use
 * (JEF-438): read who they are, verify or ask for another link, fix a
 * mistyped address, and sign out or keep the session alive while they wait.
 * Everything else is refused with `EMAIL_NOT_VERIFIED`.
 */
export const ALLOWED_WHILE_UNVERIFIED: ReadonlySet<string> = new Set([
  'me',
  'verifyEmail',
  'resendVerificationEmail',
  'requestEmailChange',
  'confirmEmailChange',
  'logout',
  'refreshToken',
  'refreshTokenMobile',
]);

/**
 * Puts the verification wall in front of every root field outside
 * `ALLOWED_WHILE_UNVERIFIED`. It lives on the resolvers and not in a Mercurius
 * `preExecution` hook because a hook cannot stop a request: the errors it
 * returns are appended to a result that still runs. A signed-out request is
 * left alone (the resolver's own `Unauthorized` applies), and a field that is
 * refused is refused on its own, so `{ me { id } applications { id } }`
 * still answers `me`.
 *
 * Wrapping the schema's own field objects is the one place the schema is
 * changed after `toSchema()`; it runs once, at module load.
 */
export function enforceEmailVerification(schema: GraphQLSchema): GraphQLSchema {
  for (const rootType of [schema.getQueryType(), schema.getMutationType()]) {
    if (!rootType) continue;
    for (const [name, field] of Object.entries(rootType.getFields())) {
      if (ALLOWED_WHILE_UNVERIFIED.has(name)) continue;
      const resolve = field.resolve ?? defaultFieldResolver;
      field.resolve = async (source, args, context: GraphQLContext, info) => {
        if (context.user) {
          await context.diScope.cradle.assertEmailVerifiedUseCase.execute(context.user.sub);
        }
        return resolve(source, args, context, info);
      };
    }
  }
  return schema;
}
