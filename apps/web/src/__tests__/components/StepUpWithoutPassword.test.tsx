import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { StepUpWithoutPassword } from '#/routes/_authenticated/settings/-components/StepUpWithoutPassword';

async function openCodeForm(onSuccess = vi.fn()) {
  render(<StepUpWithoutPassword providers={[]} onSuccess={onSuccess} onCancel={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /email me a code/i }));
  return { onSuccess, input: await screen.findByLabelText('Code from the email') };
}

const verifyButton = () => screen.getByRole('button', { name: /verify code/i });

describe('StepUpWithoutPassword code form (JEF-620)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('RequestStepUpCode')
        ? Promise.resolve({ requestStepUpCode: true })
        : Promise.resolve({ verifyStepUpCode: true }),
    );
  });

  it('keeps Verify off until something is typed, and refuses a code that is not 6 characters', async () => {
    const { input, onSuccess } = await openCodeForm();
    expect(verifyButton()).toBeDisabled();

    await userEvent.type(input, '123');
    await userEvent.click(verifyButton());

    expect(await screen.findByText('Enter the 6-digit code')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockGqlRequest).not.toHaveBeenCalledWith(
      expect.stringContaining('VerifyStepUpCode'),
      expect.anything(),
    );
  });

  it('sends the trimmed code and reports success', async () => {
    const { input, onSuccess } = await openCodeForm();

    await userEvent.type(input, ' 123456 ');
    await userEvent.click(verifyButton());

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('VerifyStepUpCode'), {
      code: '123456',
    });
  });

  it("shows the API's message and keeps the typed code when the code is refused", async () => {
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('RequestStepUpCode')) return Promise.resolve({ requestStepUpCode: true });
      return Promise.reject(
        Object.assign(new Error('bad'), {
          response: { errors: [{ message: 'That code is wrong or expired.' }] },
        }),
      );
    });
    const { input, onSuccess } = await openCodeForm();

    await userEvent.type(input, '123456');
    await userEvent.click(verifyButton());

    expect(await screen.findByText('That code is wrong or expired.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(input).toHaveValue('123456');
  });

  it('verifies once on a double click', async () => {
    // The verify request stays open until after the second click. If it
    // resolved at once, the form could be ready again by then and a slow
    // machine would see a second, legitimate submit.
    let release: (value: unknown) => void = () => {};
    mockGqlRequest.mockImplementation((query: string) =>
      query.includes('RequestStepUpCode')
        ? Promise.resolve({ requestStepUpCode: true })
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    const { input, onSuccess } = await openCodeForm();

    await userEvent.type(input, '123456');
    await userEvent.dblClick(verifyButton());
    release({ verifyStepUpCode: true });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const verifies = mockGqlRequest.mock.calls.filter(([q]) =>
      String(q).includes('VerifyStepUpCode'),
    );
    expect(verifies).toHaveLength(1);
  });
});
