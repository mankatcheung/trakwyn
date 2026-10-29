import { describe, it, expect, vi } from 'vitest';
import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  graphql,
  type GraphQLFieldConfigMap,
} from 'graphql';
import {
  ALLOWED_WHILE_DELETION_SCHEDULED,
  enforceAccountActive,
} from '#src/http/accountActiveGate.js';
import { AccountDeletionScheduledError } from '#src/use-cases/errors/DomainError.js';
import type { GraphQLContext } from '#src/http/context.js';

const field = (value: string): GraphQLFieldConfigMap<unknown, GraphQLContext>[string] => ({
  type: GraphQLString,
  resolve: () => value,
});

const buildSchema = () =>
  enforceAccountActive(
    new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { me: field('me'), applications: field('applications') },
      }),
      mutation: new GraphQLObjectType({
        name: 'Mutation',
        fields: {
          cancelAccountDeletion: field('kept'),
          createApiToken: field('created'),
        },
      }),
    }),
  );

const contextFor = (opts: { signedIn: boolean; scheduled: boolean }) => {
  const execute = vi.fn(async () => {
    if (opts.scheduled) throw new AccountDeletionScheduledError();
  });
  const context = {
    user: opts.signedIn ? { sub: 'user-1', email: 'a@b.c' } : null,
    diScope: { cradle: { assertAccountActiveUseCase: { execute } } },
  } as unknown as GraphQLContext;
  return { context, execute };
};

const run = (source: string, context: GraphQLContext) =>
  graphql({ schema: buildSchema(), source, contextValue: context });

describe('enforceAccountActive (JEF-463)', () => {
  it('lets a scheduled account read who it is and cancel', async () => {
    const { context, execute } = contextFor({ signedIn: true, scheduled: true });

    expect(await run('{ me }', context)).toEqual({ data: { me: 'me' } });
    expect(await run('mutation { cancelAccountDeletion }', context)).toEqual({
      data: { cancelAccountDeletion: 'kept' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses anything else, including minting a new API token', async () => {
    const { context } = contextFor({ signedIn: true, scheduled: true });

    const query = await run('{ applications }', context);
    const mutation = await run('mutation { createApiToken }', context);

    expect(query.errors?.[0]?.originalError).toBeInstanceOf(AccountDeletionScheduledError);
    expect(mutation.errors?.[0]?.originalError).toBeInstanceOf(AccountDeletionScheduledError);
  });

  it('runs the real resolver for an account that is not scheduled', async () => {
    const { context, execute } = contextFor({ signedIn: true, scheduled: false });

    expect(await run('{ applications }', context)).toEqual({
      data: { applications: 'applications' },
    });
    expect(execute).toHaveBeenCalledWith('user-1');
  });

  it('leaves a signed-out request to the resolver, without a lookup', async () => {
    const { context, execute } = contextFor({ signedIn: false, scheduled: true });

    expect(await run('{ applications }', context)).toEqual({
      data: { applications: 'applications' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('names only fields that exist in the real schema', async () => {
    const { schema } = await import('#src/http/schema/index.js');
    const root = new Set([
      ...Object.keys(schema.getQueryType()!.getFields()),
      ...Object.keys(schema.getMutationType()!.getFields()),
    ]);

    for (const name of ALLOWED_WHILE_DELETION_SCHEDULED) {
      expect(root.has(name), `${name} is not a root field`).toBe(true);
    }
  });
});
