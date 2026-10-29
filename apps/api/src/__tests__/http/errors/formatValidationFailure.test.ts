import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphQLError } from 'graphql';
import {
  formatValidationFailure,
  isValidationFailure,
} from '#src/http/errors/formatValidationFailure.js';
import { CLIENT_HEADER, GRAPHQL_VALIDATION_ERROR_CODE } from '#src/http/constants.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

const { recordValidationFailureMock } = vi.hoisted(() => ({
  recordValidationFailureMock: vi.fn(),
}));

vi.mock('#src/infrastructure/observability/recordValidationFailure.js', () => ({
  recordValidationFailure: recordValidationFailureMock,
}));

/** What Mercurius wraps a failed validation in: a coded error carrying the real list. */
function validationFailure(...messages: string[]): GraphQLError {
  const original = Object.assign(new Error('Graphql validation error'), {
    code: GRAPHQL_VALIDATION_ERROR_CODE,
    errors: messages.map((message) => new GraphQLError(message)),
  });
  return new GraphQLError('Graphql validation error', { originalError: original });
}

const NO_CLIENT = { body: {}, headers: {} };

describe('isValidationFailure', () => {
  it('recognises the error Mercurius throws for an invalid document', () => {
    expect(isValidationFailure(validationFailure('x'))).toBe(true);
  });

  it('is false for any other error, and for one with no original', () => {
    const other = new GraphQLError('wrapped', {
      originalError: Object.assign(new Error('boom'), { code: ERROR_CODES.NOT_FOUND }),
    });
    expect(isValidationFailure(other)).toBe(false);
    expect(isValidationFailure(new GraphQLError('Syntax error'))).toBe(false);
  });
});

describe('formatValidationFailure', () => {
  beforeEach(() => {
    recordValidationFailureMock.mockClear();
  });

  it('answers each validation message as a VALIDATION error, not "Internal server error"', () => {
    const result = formatValidationFailure(
      validationFailure('Cannot query field "x" on type "Query".', 'Unknown type "Y".'),
      NO_CLIENT,
      makeLogger(),
      makeFakeMetrics(),
    );

    expect(result.map((e) => e.message)).toEqual([
      'Cannot query field "x" on type "Query".',
      'Unknown type "Y".',
    ]);
    expect(result.every((e) => e.extensions.code === ERROR_CODES.VALIDATION)).toBe(true);
    expect(result.every((e) => e.extensions.statusCode === 400)).toBe(true);
  });

  it('falls back to the wrapper message when Mercurius attached no list', () => {
    const bare = new GraphQLError('Graphql validation error', {
      originalError: Object.assign(new Error('Graphql validation error'), {
        code: GRAPHQL_VALIDATION_ERROR_CODE,
      }),
    });

    const result = formatValidationFailure(bare, NO_CLIENT, makeLogger(), makeFakeMetrics());

    expect(result).toHaveLength(1);
    expect(result[0]?.message).toBe('Graphql validation error');
  });

  it('logs one warn line with the messages and the operation, and never an error', () => {
    const logger = makeLogger();

    formatValidationFailure(
      validationFailure('Cannot query field "x" on type "Query".'),
      { body: { operationName: 'Applications' }, headers: {} },
      logger,
      makeFakeMetrics(),
    );

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('[GraphQL validation failed]', undefined, {
      event: 'graphql.validation.failed',
      operationName: 'Applications',
      client: 'other',
      clientVersion: undefined,
      errorCount: 1,
      messages: 'Cannot query field "x" on type "Query".',
    });
  });

  it('caps what it logs: ten messages, each clipped', () => {
    const logger = makeLogger();
    const long = 'a'.repeat(500);

    formatValidationFailure(
      validationFailure(...Array.from({ length: 15 }, () => long)),
      NO_CLIENT,
      logger,
      makeFakeMetrics(),
    );

    const fields = vi.mocked(logger.warn).mock.calls[0]?.[2];
    expect(fields?.errorCount).toBe(15);
    const logged = String(fields?.messages).split(' | ');
    expect(logged).toHaveLength(10);
    expect(logged.every((m) => m.length === 200)).toBe(true);
  });

  it.each([
    ['not a string', 42],
    ['not shaped like a GraphQL name', 'Foo Bar\nInjected'],
    ['too long', 'A'.repeat(129)],
  ])('drops an operationName that is %s', (_label, operationName) => {
    const logger = makeLogger();

    formatValidationFailure(
      validationFailure('x'),
      { body: { operationName }, headers: {} },
      logger,
      makeFakeMetrics(),
    );

    expect(vi.mocked(logger.warn).mock.calls[0]?.[2]?.operationName).toBeUndefined();
    expect(recordValidationFailureMock).toHaveBeenCalledWith(undefined);
  });

  it('names the span after the operation the client sent', () => {
    formatValidationFailure(
      validationFailure('x'),
      { body: { operationName: 'Applications' }, headers: {} },
      makeLogger(),
      makeFakeMetrics(),
    );

    expect(recordValidationFailureMock).toHaveBeenCalledWith('Applications');
  });

  it('survives a request with no body', () => {
    expect(() =>
      formatValidationFailure(
        validationFailure('x'),
        { body: undefined, headers: {} },
        makeLogger(),
        makeFakeMetrics(),
      ),
    ).not.toThrow();
  });

  describe('client attribution', () => {
    it('counts the mobile app with its version', () => {
      const metrics = makeFakeMetrics();
      const logger = makeLogger();

      formatValidationFailure(
        validationFailure('x'),
        { body: {}, headers: { 'user-agent': 'TrakwynMobile/1.4.2 (iPhone15,2; iOS 17.4)' } },
        logger,
        metrics,
      );

      expect(metrics.graphqlValidationFailures).toEqual([
        { client: 'mobile', clientVersion: '1.4.2' },
      ]);
      expect(vi.mocked(logger.warn).mock.calls[0]?.[2]).toMatchObject({
        client: 'mobile',
        clientVersion: '1.4.2',
      });
    });

    it.each(['chrome-extension://abcdef', 'safari-web-extension://abcdef'])(
      'counts a browser extension from its %s origin',
      (origin) => {
        const metrics = makeFakeMetrics();

        formatValidationFailure(
          validationFailure('x'),
          { body: {}, headers: { origin } },
          makeLogger(),
          metrics,
        );

        expect(metrics.graphqlValidationFailures).toEqual([
          { client: 'extension', clientVersion: undefined },
        ]);
      },
    );

    it('counts the Clipper with its version from the client header (JEF-473)', () => {
      const metrics = makeFakeMetrics();
      const logger = makeLogger();

      formatValidationFailure(
        validationFailure('x'),
        {
          body: {},
          headers: {
            [CLIENT_HEADER]: 'TrakwynClipper/1.3.1',
            origin: 'chrome-extension://abcdef',
          },
        },
        logger,
        metrics,
      );

      expect(metrics.graphqlValidationFailures).toEqual([
        { client: 'extension', clientVersion: '1.3.1' },
      ]);
      expect(vi.mocked(logger.warn).mock.calls[0]?.[2]).toMatchObject({
        client: 'extension',
        clientVersion: '1.3.1',
      });
    });

    it('trusts the header for the version only, not for who is calling', () => {
      const metrics = makeFakeMetrics();

      formatValidationFailure(
        validationFailure('x'),
        { body: {}, headers: { [CLIENT_HEADER]: 'TrakwynClipper/9.9.9' } },
        makeLogger(),
        metrics,
      );

      // Anyone can send the header; it labels a count, it grants nothing.
      expect(metrics.graphqlValidationFailures).toEqual([
        { client: 'extension', clientVersion: '9.9.9' },
      ]);
    });

    it('keeps a Clipper build that predates the header as extension with no version', () => {
      const metrics = makeFakeMetrics();

      formatValidationFailure(
        validationFailure('x'),
        { body: {}, headers: { origin: 'safari-web-extension://abcdef' } },
        makeLogger(),
        metrics,
      );

      expect(metrics.graphqlValidationFailures).toEqual([
        { client: 'extension', clientVersion: undefined },
      ]);
    });

    it('drops a version that is not shaped like one, whoever sent it', () => {
      const metrics = makeFakeMetrics();

      formatValidationFailure(
        validationFailure('x'),
        {
          body: {},
          headers: { 'user-agent': 'TrakwynMobile/not-a-version (iPhone15,2; iOS 17.4)' },
        },
        makeLogger(),
        metrics,
      );
      formatValidationFailure(
        validationFailure('x'),
        { body: {}, headers: { [CLIENT_HEADER]: 'TrakwynClipper/not-a-version' } },
        makeLogger(),
        metrics,
      );

      expect(metrics.graphqlValidationFailures).toEqual([
        { client: 'mobile', clientVersion: undefined },
        { client: 'other', clientVersion: undefined },
      ]);
    });

    it('counts anything else as other, whatever its user agent claims', () => {
      const metrics = makeFakeMetrics();

      formatValidationFailure(
        validationFailure('x'),
        { body: {}, headers: { 'user-agent': 'Mozilla/5.0', origin: 'https://www.trakwyn.com' } },
        makeLogger(),
        metrics,
      );

      expect(metrics.graphqlValidationFailures).toEqual([
        { client: 'other', clientVersion: undefined },
      ]);
    });
  });
});
