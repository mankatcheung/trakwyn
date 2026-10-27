import { describe, it, expect, vi } from 'vitest';
import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  type GraphQLFieldConfigMap,
} from 'graphql';
import {
  ALLOWED_WHILE_UNVERIFIED,
  enforceEmailVerification,
} from '#src/http/emailVerificationGate.js';
import { EmailNotVerifiedError } from '#src/use-cases/errors/DomainError.js';
import type { GraphQLContext } from '#src/http/context.js';

const field = (value: string): GraphQLFieldConfigMap<unknown, GraphQLContext>[string] => ({
  type: GraphQLString,
  resolve: () => value,
});

const buildSchema = () =>
  enforceEmailVerification(
    new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { me: field('me'), applications: field('applications') },
      }),
      mutation: new GraphQLObjectType({
        name: 'Mutation',
        fields: { logout: field('bye'), createApplication: field('created') },
      }),
    }),
  );

const contextFor = (opts: { signedIn: boolean; verified: boolean }) => {
  const execute = vi.fn(async () => {
    if (!opts.verified) throw new EmailNotVerifiedError();
  });
  const context = {
    user: opts.signedIn ? { sub: 'user-1', email: 'a@b.c' } : null,
    diScope: { cradle: { assertEmailVerifiedUseCase: { execute } } },
  } as unknown as GraphQLContext;
  return { context, execute };
};

const run = (source: string, context: GraphQLContext) =>
  graphql({ schema: buildSchema(), source, contextValue: context });

describe('enforceEmailVerification (JEF-438)', () => {
  it('lets an unverified user use the fields needed to verify and sign out', async () => {
    const { context, execute } = contextFor({ signedIn: true, verified: false });

    const query = await run('{ me }', context);
    const mutation = await run('mutation { logout }', context);

    expect(query).toEqual({ data: { me: 'me' } });
    expect(mutation).toEqual({ data: { logout: 'bye' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses any other query or mutation for an unverified user', async () => {
    const { context } = contextFor({ signedIn: true, verified: false });

    const query = await run('{ applications }', context);
    const mutation = await run('mutation { createApplication }', context);

    expect(query.errors?.[0]?.originalError).toBeInstanceOf(EmailNotVerifiedError);
    expect(mutation.errors?.[0]?.originalError).toBeInstanceOf(EmailNotVerifiedError);
    expect(query.data).toEqual({ applications: null });
  });

  it('refuses a disallowed field on its own and still answers an allowed one', async () => {
    const { context } = contextFor({ signedIn: true, verified: false });

    const result = await run('{ me applications }', context);

    expect(result.data).toEqual({ me: 'me', applications: null });
    expect(result.errors).toHaveLength(1);
  });

  it('runs the real resolver for a verified user', async () => {
    const { context, execute } = contextFor({ signedIn: true, verified: true });

    const result = await run('{ applications }', context);

    expect(result).toEqual({ data: { applications: 'applications' } });
    expect(execute).toHaveBeenCalledWith('user-1');
  });

  it('leaves a signed-out request to the resolver, without a lookup', async () => {
    const { context, execute } = contextFor({ signedIn: false, verified: false });

    const result = await run('{ applications }', context);

    expect(result).toEqual({ data: { applications: 'applications' } });
    expect(execute).not.toHaveBeenCalled();
  });

  it('names only fields that exist in the real schema', async () => {
    const { schema } = await import('#src/http/schema/index.js');
    const root = new Set([
      ...Object.keys(schema.getQueryType()!.getFields()),
      ...Object.keys(schema.getMutationType()!.getFields()),
    ]);

    for (const name of ALLOWED_WHILE_UNVERIFIED) {
      expect(root.has(name), `${name} is not a root field`).toBe(true);
    }
  });
});
