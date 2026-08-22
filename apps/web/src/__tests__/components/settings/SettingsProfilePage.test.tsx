import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest, mockPutBlob } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
  mockPutBlob: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: object) => ({ ...opts, useSearch: () => ({}) }),
  useNavigate: () => mockNavigate,
  redirect: vi.fn(),
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));

vi.mock('@tanstack/react-start/server', () => ({
  getCookie: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/queryClient', () => ({
  queryClient: { clear: vi.fn(), resetQueries: vi.fn() },
}));

vi.mock('@vercel/blob/client', () => ({
  put: mockPutBlob,
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsProfilePage } from '#/routes/_authenticated/settings/-components/SettingsProfilePage';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

const defaultResponse = {
  me: {
    id: 'user-1',
    email: 'test@example.com',
    name: null,
    timezone: null,
    targetRole: null,
    avatarUrl: null,
  },
};

describe('SettingsProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue(defaultResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('profile form', () => {
    it('pre-fills fields from the me query', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        me: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Jeff Man',
          timezone: 'America/Los_Angeles',
          targetRole: 'Staff Engineer',
        },
      });
      render(<SettingsProfilePage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByDisplayValue('Jeff Man')).toBeInTheDocument();
      });
      expect(screen.getByDisplayValue('America/Los_Angeles')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Staff Engineer')).toBeInTheDocument();
    });

    it('calls updateProfile mutation with trimmed values', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Me')),
      );
      mockGqlRequest.mockResolvedValue({ updateProfile: true });

      const saveBtn = screen.getByRole('button', { name: /save profile/i });
      const form = saveBtn.closest('form')!;
      const nameInput = form.querySelector('input[placeholder="Jane Doe"]')!;
      const timezoneInput = form.querySelector('input[placeholder="America/Los_Angeles"]')!;
      const targetRoleInput = form.querySelector('input[placeholder="Senior Product Designer"]')!;

      fireEvent.change(nameInput, { target: { value: '  Jeff Man  ' } });
      fireEvent.change(timezoneInput, { target: { value: 'UTC' } });
      fireEvent.change(targetRoleInput, { target: { value: 'Staff Engineer' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('UpdateProfile'), {
          name: 'Jeff Man',
          timezone: 'UTC',
          targetRole: 'Staff Engineer',
        });
      });
    });

    it('sends null for cleared fields', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        me: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Old Name',
          timezone: null,
          targetRole: null,
        },
      });
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByDisplayValue('Old Name')).toBeInTheDocument());
      mockGqlRequest.mockResolvedValue({ updateProfile: true });

      const saveBtn = screen.getByRole('button', { name: /save profile/i });
      const form = saveBtn.closest('form')!;
      const nameInput = form.querySelector('input[placeholder="Jane Doe"]')!;

      fireEvent.change(nameInput, { target: { value: '   ' } });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('UpdateProfile'),
          expect.objectContaining({ name: null }),
        );
      });
    });

    it('shows error message on profile update failure', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Me')),
      );
      mockGqlRequest.mockRejectedValue({
        response: { errors: [{ message: 'Invalid timezone' }] },
      });

      const saveBtn = screen.getByRole('button', { name: /save profile/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Invalid timezone')).toBeInTheDocument();
      });
    });
  });

  describe('avatar', () => {
    const selectAvatarFile = (name = 'me.png', type = 'image/png') => {
      const file = new File(['fake-image-bytes'], name, { type });
      const section = screen.getByText('Profile').closest('section')!;
      const input = section.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });
    };

    it('uploads a photo via requestAvatarUploadUrl then confirmAvatar', async () => {
      mockPutBlob.mockResolvedValue({ url: 'https://blob.example.com/avatar.png' });

      mockGqlRequest.mockImplementation((query: unknown) => {
        if (typeof query === 'string' && query.includes('RequestAvatarUploadUrl')) {
          return Promise.resolve({
            requestAvatarUploadUrl: {
              uploadUrl: 'https://storage.example.com/upload',
              storageKey: 'users/user-1/avatar/key.png',
            },
          });
        }
        if (typeof query === 'string' && query.includes('ConfirmAvatar')) {
          return Promise.resolve({ confirmAvatar: 'https://cdn.example.com/avatar.png' });
        }
        return Promise.resolve(defaultResponse);
      });

      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Me')),
      );

      selectAvatarFile();

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(
          expect.stringContaining('RequestAvatarUploadUrl'),
          { filename: 'me.png', mimeType: 'image/png' },
        );
      });
      expect(mockPutBlob).toHaveBeenCalledWith('users/user-1/avatar/key.png', expect.any(File), {
        access: 'public',
        token: 'https://storage.example.com/upload',
        contentType: 'image/png',
      });
      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ConfirmAvatar'), {
          storageKey: 'users/user-1/avatar/key.png',
          mimeType: 'image/png',
          sizeBytes: expect.any(Number) as number,
        });
      });
    });

    it('shows an error message when the upload fails', async () => {
      mockPutBlob.mockResolvedValue({ url: 'https://blob.example.com/avatar.png' });
      mockGqlRequest.mockImplementation((query: unknown) => {
        if (typeof query === 'string' && query.includes('RequestAvatarUploadUrl')) {
          return Promise.reject({ response: { errors: [{ message: 'Unsupported file type' }] } });
        }
        return Promise.resolve(defaultResponse);
      });

      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Me')),
      );

      selectAvatarFile();

      await waitFor(() => {
        expect(screen.getByText('Unsupported file type')).toBeInTheDocument();
      });

      vi.unstubAllGlobals();
    });

    it('calls removeAvatar when Remove is clicked', async () => {
      mockGqlRequest.mockResolvedValue({
        ...defaultResponse,
        me: { ...defaultResponse.me, avatarUrl: 'https://cdn.example.com/avatar.png' },
      });

      render(<SettingsProfilePage />, { wrapper: Wrapper });
      const removeBtn = await screen.findByRole('button', { name: /remove/i });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RemoveAvatar'));
      });
    });

    it('does not show a Remove button when there is no avatar', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() =>
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Me')),
      );

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
  });
  describe('email update form', () => {
    it('calls requestEmailChange mutation with current password and new email', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      mockGqlRequest.mockResolvedValue({ requestEmailChange: true });

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      const pwInput = form.querySelector('input[type="password"]')!;
      const emailInput = form.querySelector('input[type="email"]')!;

      fireEvent.change(pwInput, { target: { value: 'mypassword' } });
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RequestEmailChange'), {
          currentPassword: 'mypassword',
          newEmail: 'new@example.com',
        });
      });
    });

    it('shows error message on email update failure', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
      mockGqlRequest.mockRejectedValue({
        response: { errors: [{ message: 'Email already in use' }] },
      });

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      const pwInput = form.querySelector('input[type="password"]')!;
      const emailInput = form.querySelector('input[type="email"]')!;

      fireEvent.change(pwInput, { target: { value: 'mypassword' } });
      fireEvent.change(emailInput, { target: { value: 'taken@example.com' } });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
      });
    });
  });

  describe('backup email', () => {
    it('shows a loading placeholder instead of the add-backup-email form while the request is in flight', () => {
      mockGqlRequest.mockReturnValue(new Promise(() => {}));
      render(<SettingsProfilePage />, { wrapper: Wrapper });

      expect(screen.queryByRole('button', { name: /add backup email/i })).not.toBeInTheDocument();
    });

    it('shows the add-backup-email form once the me query resolves with none set', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add backup email/i })).toBeInTheDocument();
      });
    });
  });

  describe('step-up reauthentication (JEF-44)', () => {
    const stepUpRequiredError = {
      response: {
        errors: [
          {
            message: 'Please verify your identity again to continue.',
            extensions: { code: 'STEP_UP_REQUIRED' },
          },
        ],
      },
    };

    it('prompts for reauth on STEP_UP_REQUIRED, then retries the original mutation on success', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      mockGqlRequest.mockRejectedValueOnce(stepUpRequiredError);
      mockGqlRequest.mockResolvedValueOnce({
        reauthenticate: { success: true, totpRequired: false, accessToken: 'new-access-token' },
      });
      mockGqlRequest.mockResolvedValueOnce({ requestEmailChange: true });

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      fireEvent.change(form.querySelector('input[type="password"]')!, {
        target: { value: 'mypassword' },
      });
      fireEvent.change(form.querySelector('input[type="email"]')!, {
        target: { value: 'new@example.com' },
      });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
      });

      const dialog = screen.getByText("Confirm it's you").closest('div')!.parentElement!;
      fireEvent.change(dialog.querySelector('input[type="password"]')!, {
        target: { value: 'mypassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('Reauthenticate'), {
          password: 'mypassword',
          code: undefined,
        });
      });
      await waitFor(() => {
        expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
      });
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('RequestEmailChange'), {
        currentPassword: 'mypassword',
        newEmail: 'new@example.com',
      });
    });

    it('dismisses silently when the reauth dialog is cancelled', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());

      mockGqlRequest.mockRejectedValueOnce(stepUpRequiredError);

      const updateEmailBtn = screen.getByRole('button', { name: /update email/i });
      const form = updateEmailBtn.closest('form')!;
      fireEvent.change(form.querySelector('input[type="password"]')!, {
        target: { value: 'mypassword' },
      });
      fireEvent.change(form.querySelector('input[type="email"]')!, {
        target: { value: 'new@example.com' },
      });
      fireEvent.click(updateEmailBtn);

      await waitFor(() => {
        expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument();
      });
      expect(screen.queryByText('Failed to update email.')).not.toBeInTheDocument();
    });
  });
});
