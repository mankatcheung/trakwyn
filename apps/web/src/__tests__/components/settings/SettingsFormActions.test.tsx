import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { ThemeProvider } from '#/lib/theme';
import { ProfileDetailsForm } from '#/routes/_authenticated/settings/-components/ProfileDetailsForm';
import { EmailChangeForm } from '#/routes/_authenticated/settings/-components/EmailChangeForm';
import {
  AddBackupEmailForm,
  RemoveBackupEmailForm,
} from '#/routes/_authenticated/settings/-components/BackupEmailForms';
import { PasswordUpdateForm } from '#/routes/_authenticated/settings/-components/PasswordUpdateForm';
import {
  TotpBeginForm,
  TotpConfirmForm,
  TotpDisableForm,
  RegenerateBackupCodesForm,
} from '#/routes/_authenticated/settings/-components/TwoFactorForms';
import { CustomAiPromptForm } from '#/routes/_authenticated/settings/-components/CustomAiPromptForm';
import { STEP_UP_CANCELLED } from '#/routes/_authenticated/settings/-components/useStepUpReauth';
import {
  BEGIN_TOTP_SETUP,
  CONFIRM_TOTP_SETUP,
  DISABLE_TOTP,
  REGENERATE_TOTP_BACKUP_CODES,
  REMOVE_BACKUP_EMAIL,
  REQUEST_ADD_BACKUP_EMAIL,
  REQUEST_EMAIL_CHANGE,
  UPDATE_PASSWORD,
  UPDATE_PROFILE,
} from '#/routes/_authenticated/settings/-components/shared';

const withStepUp = <T,>(fn: () => Promise<T>) => fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ThemeProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ThemeProvider>
    );
  };
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const ME = {
  id: 'u1',
  email: 'a@b.co',
  name: null,
  timezone: null,
  targetRole: null,
  phone: null,
  location: null,
  profileLinks: [],
  avatarUrl: null,
  backupEmail: null,
  backupEmailVerifiedAt: null,
  hasPassword: true,
};

const field = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;

interface FormCase {
  name: string;
  render: () => ReactElement;
  /** Fields to type, by input name. The first is checked after a failed save. */
  fill: Record<string, string>;
  submit: string;
  pending: string;
  /** The GraphQL document the submit sends. */
  document: string;
  /** A field that is empty again after a successful save, for forms that clear themselves. */
  clearsOnSuccess?: string;
}

const CASES: FormCase[] = [
  {
    name: 'profile details',
    render: () => <ProfileDetailsForm me={ME} />,
    fill: { name: 'Jane Doe' },
    submit: 'Save profile',
    pending: 'Saving…',
    document: UPDATE_PROFILE,
  },
  {
    name: 'email change',
    render: () => <EmailChangeForm needsPassword withStepUp={withStepUp} />,
    fill: { newEmail: 'new@b.co', currentPassword: 'hunter22' },
    submit: 'Update email',
    pending: 'Sending…',
    document: REQUEST_EMAIL_CHANGE,
    clearsOnSuccess: 'newEmail',
  },
  {
    name: 'add backup email',
    render: () => <AddBackupEmailForm needsPassword withStepUp={withStepUp} />,
    fill: { backupEmail: 'backup@b.co', currentPassword: 'hunter22' },
    submit: 'Add backup email',
    pending: 'Sending…',
    document: REQUEST_ADD_BACKUP_EMAIL,
    clearsOnSuccess: 'backupEmail',
  },
  {
    name: 'remove backup email',
    render: () => <RemoveBackupEmailForm needsPassword withStepUp={withStepUp} />,
    fill: { currentPassword: 'hunter22' },
    submit: 'Remove backup email',
    pending: 'Removing…',
    document: REMOVE_BACKUP_EMAIL,
    clearsOnSuccess: 'currentPassword',
  },
  {
    name: 'password',
    render: () => <PasswordUpdateForm withStepUp={withStepUp} />,
    fill: {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    },
    submit: 'Update password',
    pending: 'Saving…',
    document: UPDATE_PASSWORD,
    clearsOnSuccess: 'newPassword',
  },
  {
    name: 'two-factor begin',
    render: () => <TotpBeginForm onBegun={vi.fn()} />,
    fill: { password: 'hunter22' },
    submit: 'Enable 2FA',
    pending: 'Starting…',
    document: BEGIN_TOTP_SETUP,
    clearsOnSuccess: 'password',
  },
  {
    name: 'two-factor confirm',
    render: () => <TotpConfirmForm onConfirmed={vi.fn()} />,
    fill: { code: '123456' },
    submit: 'Confirm',
    pending: 'Confirming…',
    document: CONFIRM_TOTP_SETUP,
    clearsOnSuccess: 'code',
  },
  {
    name: 'two-factor disable',
    render: () => <TotpDisableForm onDisabled={vi.fn()} />,
    fill: { password: 'hunter22' },
    submit: 'Disable 2FA',
    pending: 'Disabling…',
    document: DISABLE_TOTP,
    clearsOnSuccess: 'password',
  },
  {
    name: 'regenerate backup codes',
    render: () => <RegenerateBackupCodesForm withStepUp={withStepUp} onRegenerated={vi.fn()} />,
    fill: { password: 'hunter22' },
    submit: 'Regenerate backup codes',
    pending: 'Regenerating…',
    document: REGENERATE_TOTP_BACKUP_CODES,
    clearsOnSuccess: 'password',
  },
  {
    name: 'custom AI instructions',
    render: () => <CustomAiPromptForm customAiPrompt={null} />,
    fill: { customAiPrompt: 'Keep it short' },
    submit: 'Save instructions',
    pending: 'Saving…',
    document: UPDATE_PROFILE,
  },
];

const OK = {
  updateProfile: true,
  beginTotpSetup: { qrCodeDataUrl: 'data:image/png;base64,x', secret: 'SECRET' },
  confirmTotpSetup: { backupCodes: ['aaaa-bbbb'] },
  regenerateTotpBackupCodes: { backupCodes: ['cccc-dddd'] },
};

async function fillIn(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    await user.clear(field(name));
    await user.type(field(name), value);
  }
}

describe.each(CASES)('$name form as a form action (JEF-618)', (c) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the write once on success', async () => {
    mockGqlRequest.mockResolvedValue(OK);
    const user = userEvent.setup();
    render(c.render(), { wrapper: makeWrapper(newClient()) });

    await fillIn(user, c.fill);
    await user.click(screen.getByRole('button', { name: c.submit }));

    await waitFor(() => expect(mockGqlRequest).toHaveBeenCalledWith(c.document, expect.anything()));
  });

  it('shows the API error and keeps what was typed', async () => {
    mockGqlRequest.mockRejectedValue({ response: { errors: [{ message: 'Server said no' }] } });
    const user = userEvent.setup();
    render(c.render(), { wrapper: makeWrapper(newClient()) });

    await fillIn(user, c.fill);
    await user.click(screen.getByRole('button', { name: c.submit }));

    expect(await screen.findByText('Server said no')).toBeInTheDocument();
    for (const [name, value] of Object.entries(c.fill)) {
      expect(field(name).value).toBe(value);
    }
  });

  it('is pending while saving and a double click sends once', async () => {
    const gate = deferred<unknown>();
    mockGqlRequest.mockReturnValue(gate.promise);
    const user = userEvent.setup();
    render(c.render(), { wrapper: makeWrapper(newClient()) });

    await fillIn(user, c.fill);
    await user.dblClick(screen.getByRole('button', { name: c.submit }));

    expect(await screen.findByRole('button', { name: c.pending })).toBeDisabled();
    gate.resolve(OK);

    await waitFor(() => expect(screen.getByRole('button', { name: c.submit })).toBeEnabled());
    expect(mockGqlRequest.mock.calls.filter(([doc]) => doc === c.document)).toHaveLength(1);
  });
});

describe('what a save does to the page (JEF-618)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refetches me after the profile is saved', async () => {
    mockGqlRequest.mockResolvedValue(OK);
    const client = newClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const user = userEvent.setup();
    render(<ProfileDetailsForm me={ME} />, { wrapper: makeWrapper(client) });

    await user.type(field('name'), 'Jane');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] }));
  });

  it('refetches the 2FA state and hands over the backup codes on confirm', async () => {
    mockGqlRequest.mockResolvedValue(OK);
    const client = newClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    render(<TotpConfirmForm onConfirmed={onConfirmed} />, { wrapper: makeWrapper(client) });

    await user.type(field('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(['aaaa-bbbb']));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['totpEnabled'] });
  });

  it('hands the QR code to the page after the 2FA password is accepted', async () => {
    mockGqlRequest.mockResolvedValue(OK);
    const onBegun = vi.fn();
    const user = userEvent.setup();
    render(<TotpBeginForm onBegun={onBegun} />, { wrapper: makeWrapper(newClient()) });

    await user.type(field('password'), 'hunter22');
    await user.click(screen.getByRole('button', { name: 'Enable 2FA' }));

    await waitFor(() => expect(onBegun).toHaveBeenCalledWith(OK.beginTotpSetup));
  });

  it('says nothing when the step-up dialog is cancelled, and keeps the input', async () => {
    const cancelled = () => Promise.reject(new Error(STEP_UP_CANCELLED));
    const user = userEvent.setup();
    render(<PasswordUpdateForm withStepUp={cancelled} />, { wrapper: makeWrapper(newClient()) });

    await fillIn(user, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    });
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled(),
    );
    expect(screen.queryByText('Failed to update password.')).not.toBeInTheDocument();
    expect(field('newPassword').value).toBe('new-password');
  });

  it('does not call the API when a field fails validation', async () => {
    const user = userEvent.setup();
    render(<PasswordUpdateForm withStepUp={withStepUp} />, { wrapper: makeWrapper(newClient()) });

    await fillIn(user, {
      currentPassword: 'old-password',
      newPassword: 'new-password',
      confirmPassword: 'different',
    });
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(mockGqlRequest).not.toHaveBeenCalled();
  });
});
