import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChangeEmailForm } from '#/features/auth/components/ChangeEmailForm';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

const gqlError = (message: string) => ({
  response: { errors: [{ message, extensions: { code: 'VALIDATION_ERROR' } }] },
});

function setup() {
  const handlers = { onSent: vi.fn(), onCancel: vi.fn() };
  render(<ChangeEmailForm {...handlers} />);
  return handlers;
}

const fill = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText('New email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: password } });
};
const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Send link to this address' }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGqlRequest.mockResolvedValue({ requestEmailChange: true });
});

describe('ChangeEmailForm', () => {
  it('explains what it will do and starts empty', () => {
    setup();

    expect(screen.getByText(/Enter the right address and your password/)).toBeInTheDocument();
    expect(screen.getByLabelText('New email')).toHaveValue('');
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'password');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for both fields before sending anything', async () => {
    setup();

    submit();

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByLabelText('New email')).toHaveAttribute('aria-invalid', 'true');
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('rejects an address that is not one', async () => {
    setup();

    fill('not-an-email', 'secret');
    submit();

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.queryByText('Enter your current password')).not.toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });

  it('sends the address with the password and tells the page where it went', async () => {
    const { onSent } = setup();

    fill('new@example.com', 'secret');
    submit();

    await waitFor(() => expect(onSent).toHaveBeenCalledExactlyOnceWith('new@example.com'));
    expect(mockGqlRequest).toHaveBeenCalledWith(expect.anything(), {
      currentPassword: 'secret',
      newEmail: 'new@example.com',
    });
  });

  it('shows the pending state on the button while the request runs', async () => {
    let finish!: () => void;
    mockGqlRequest.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    setup();

    fill('new@example.com', 'secret');
    submit();

    const busy = await screen.findByRole('button', { name: /Send link to this address|Sending/ });
    await waitFor(() => expect(busy).toBeDisabled());
    expect(busy).toHaveAttribute('aria-busy', 'true');

    await act(async () => finish());
  });

  it("shows the server's reason, in one place, and does not report success", async () => {
    mockGqlRequest.mockRejectedValue(gqlError('Wrong password'));
    const { onSent } = setup();

    fill('new@example.com', 'wrong');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(onSent).not.toHaveBeenCalled();
  });

  it('falls back to its own message when the failure carries none', async () => {
    mockGqlRequest.mockRejectedValue(new Error('network down'));
    setup();

    fill('new@example.com', 'secret');
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to change the email.');
  });

  it('keeps what was typed after a failed attempt', async () => {
    mockGqlRequest.mockRejectedValue(gqlError('Wrong password'));
    setup();

    fill('new@example.com', 'wrong');
    submit();
    await screen.findByRole('alert');

    expect(screen.getByLabelText('New email')).toHaveValue('new@example.com');
  });

  it('can be cancelled', () => {
    const { onCancel } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
