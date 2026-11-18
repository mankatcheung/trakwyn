import { describe, expect, it, vi } from 'vitest';
import {
  REQUEST_STEP_UP_CODE,
  VERIFY_STEP_UP_CODE,
} from '#/features/settings/graphql/securityQueries';
import { mockGql, operationName, respond, respondError, respondWith } from '../gqlMock';

describe('operationName', () => {
  it('reads the name from a typed document', () => {
    expect(operationName(REQUEST_STEP_UP_CODE)).toBe('RequestStepUpCode');
  });

  it('reads the name from a string document', () => {
    expect(operationName('mutation Legacy($a: Int) { x }')).toBe('Legacy');
  });

  it('refuses an anonymous document', () => {
    expect(() => operationName('{ me { id } }')).toThrow(/no named operation/);
  });
});

describe('mockGql', () => {
  it('answers each operation with its own typed data', async () => {
    const request = vi.fn();
    mockGql(request, [
      respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: true }),
      respond(VERIFY_STEP_UP_CODE, { verifyStepUpCode: false }),
    ]);

    await expect(request(REQUEST_STEP_UP_CODE)).resolves.toEqual({ requestStepUpCode: true });
    await expect(request(VERIFY_STEP_UP_CODE, { code: '1' })).resolves.toEqual({
      verifyStepUpCode: false,
    });
  });

  it('matches a string document by operation name too', async () => {
    const request = vi.fn();
    mockGql(request, [respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: true })]);

    await expect(request('mutation RequestStepUpCode { requestStepUpCode }')).resolves.toEqual({
      requestStepUpCode: true,
    });
  });

  it('computes a response from the variables', async () => {
    const request = vi.fn();
    mockGql(request, [
      respond(VERIFY_STEP_UP_CODE, ({ code }) => ({ verifyStepUpCode: code === '123456' })),
    ]);

    await expect(request(VERIFY_STEP_UP_CODE, { code: '123456' })).resolves.toEqual({
      verifyStepUpCode: true,
    });
    await expect(request(VERIFY_STEP_UP_CODE, { code: '000000' })).resolves.toEqual({
      verifyStepUpCode: false,
    });
  });

  it('lets respondWith hold a typed response open until the test releases it', async () => {
    const request = vi.fn();
    let release: (value: { verifyStepUpCode: boolean }) => void = () => {};
    mockGql(request, [
      respondWith(
        VERIFY_STEP_UP_CODE,
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    ]);

    const pending = request(VERIFY_STEP_UP_CODE, { code: '1' });
    release({ verifyStepUpCode: true });

    await expect(pending).resolves.toEqual({ verifyStepUpCode: true });
  });

  it('rejects with the given error for respondError', async () => {
    const request = vi.fn();
    mockGql(request, [respondError(VERIFY_STEP_UP_CODE, new Error('Code refused'))]);

    await expect(request(VERIFY_STEP_UP_CODE, { code: 'x' })).rejects.toThrow('Code refused');
  });

  it('names an operation nobody mocked instead of returning undefined', async () => {
    const request = vi.fn();
    mockGql(request, [respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: true })]);

    await expect(request(VERIFY_STEP_UP_CODE, { code: '1' })).rejects.toThrow(
      /no response for operation "VerifyStepUpCode" \(mocked: RequestStepUpCode\)/,
    );
  });

  it('lets a later mockGql call replace the earlier responses', async () => {
    const request = vi.fn();
    mockGql(request, [respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: true })]);
    mockGql(request, [respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: false })]);

    await expect(request(REQUEST_STEP_UP_CODE)).resolves.toEqual({ requestStepUpCode: false });
  });

  it('holds a response to the shape of its document', () => {
    const request = vi.fn();
    mockGql(request, [
      // @ts-expect-error `requestStepUpCode` is a boolean, not a string
      respond(REQUEST_STEP_UP_CODE, { requestStepUpCode: 'yes' }),
      // @ts-expect-error `nope` is not a field of VerifyStepUpCode
      respond(VERIFY_STEP_UP_CODE, { nope: true }),
    ]);
  });
});
