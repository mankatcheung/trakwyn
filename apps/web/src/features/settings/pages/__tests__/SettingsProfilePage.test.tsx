import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
import { SettingsProfilePage } from '#/features/settings/pages/SettingsProfilePage';
import { gqlContaining } from '#/__tests__/helpers/gqlText';
import { respond, respondError, overrideGql } from '#/__tests__/helpers/gqlMock';
import { CONFIRM_AVATAR } from '#/features/settings/graphql/accountQueries';
import { REQUEST_AVATAR_UPLOAD_URL } from '#/features/settings/graphql/accountQueries';

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

/** The account has loaded: the profile form is rebuilt with its saved values at that point. */
const meLoaded = async () => {
  await waitFor(() => expect(mockGqlRequest).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
      await meLoaded();
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
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('UpdateProfile'), {
          name: 'Jeff Man',
          timezone: 'UTC',
          targetRole: 'Staff Engineer',
          phone: null,
          location: null,
          profileLinks: [],
        });
      });
    });

    describe('contact details (JEF-527)', () => {
      const withContact = {
        me: {
          ...defaultResponse.me,
          phone: '+44 20 7946 0958',
          location: 'London, UK',
          profileLinks: ['https://linkedin.com/in/ada', 'https://ada.dev'],
        },
      };

      it('pre-fills phone, location and links', async () => {
        mockGqlRequest.mockResolvedValue(withContact);
        render(<SettingsProfilePage />, { wrapper: Wrapper });

        await waitFor(() =>
          expect(screen.getByDisplayValue('+44 20 7946 0958')).toBeInTheDocument(),
        );
        expect(screen.getByDisplayValue('London, UK')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/linkedin\.com\/in\/jane-doe/)).toHaveValue(
          'https://linkedin.com/in/ada\nhttps://ada.dev',
        );
      });

      it('saves them, one link per line', async () => {
        render(<SettingsProfilePage />, { wrapper: Wrapper });
        await meLoaded();
        mockGqlRequest.mockResolvedValue({ updateProfile: true });

        fireEvent.change(screen.getByPlaceholderText('+44 20 7946 0958'), {
          target: { value: ' 555 0100 ' },
        });
        fireEvent.change(screen.getByPlaceholderText('London, UK'), { target: { value: 'Paris' } });
        fireEvent.change(screen.getByPlaceholderText(/linkedin\.com\/in\/jane-doe/), {
          target: { value: 'https://github.com/ada\n\n  https://ada.dev  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

        await waitFor(() =>
          expect(mockGqlRequest).toHaveBeenCalledWith(
            gqlContaining('UpdateProfile'),
            expect.objectContaining({
              phone: '555 0100',
              location: 'Paris',
              profileLinks: ['https://github.com/ada', 'https://ada.dev'],
            }),
          ),
        );
      });

      it('clears them when emptied', async () => {
        mockGqlRequest.mockResolvedValue(withContact);
        render(<SettingsProfilePage />, { wrapper: Wrapper });
        await waitFor(() => expect(screen.getByDisplayValue('London, UK')).toBeInTheDocument());
        mockGqlRequest.mockResolvedValue({ updateProfile: true });

        fireEvent.change(screen.getByPlaceholderText('+44 20 7946 0958'), {
          target: { value: '' },
        });
        fireEvent.change(screen.getByPlaceholderText('London, UK'), { target: { value: '' } });
        fireEvent.change(screen.getByPlaceholderText(/linkedin\.com\/in\/jane-doe/), {
          target: { value: '' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

        await waitFor(() =>
          expect(mockGqlRequest).toHaveBeenCalledWith(
            gqlContaining('UpdateProfile'),
            expect.objectContaining({ phone: null, location: null, profileLinks: [] }),
          ),
        );
      });

      it.each([
        ['phone', /^\+44 20 7946 0958$/, 'call me', /valid phone number/i],
        ['links', /linkedin\.com\/in\/jane-doe/, 'linkedin.com/in/ada', /must start with http/i],
        [
          'too many links',
          /linkedin\.com\/in\/jane-doe/,
          'https://a.dev\nhttps://b.dev\nhttps://c.dev\nhttps://d.dev',
          /at most 3 links/i,
        ],
      ])('refuses invalid %s without calling the API', async (_n, label, value, message) => {
        render(<SettingsProfilePage />, { wrapper: Wrapper });
        await meLoaded();
        mockGqlRequest.mockClear();

        fireEvent.change(screen.getByPlaceholderText(label), { target: { value } });
        fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(mockGqlRequest).not.toHaveBeenCalledWith(
          gqlContaining('UpdateProfile'),
          expect.anything(),
        );
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
          gqlContaining('UpdateProfile'),
          expect.objectContaining({ name: null }),
        );
      });
    });

    it('shows error message on profile update failure', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await meLoaded();
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
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });
    };

    it('uploads a photo via requestAvatarUploadUrl then confirmAvatar', async () => {
      mockPutBlob.mockResolvedValue({ url: 'https://blob.example.com/avatar.png' });

      overrideGql(mockGqlRequest, [
        respond(REQUEST_AVATAR_UPLOAD_URL, {
          requestAvatarUploadUrl: {
            uploadUrl: 'https://storage.example.com/upload',
            storageKey: 'users/user-1/avatar/key.png',
          },
        }),
        respond(CONFIRM_AVATAR, { confirmAvatar: 'https://cdn.example.com/avatar.png' }),
      ]);

      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await meLoaded();

      selectAvatarFile();

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RequestAvatarUploadUrl'), {
          filename: 'me.png',
          mimeType: 'image/png',
        });
      });
      expect(mockPutBlob).toHaveBeenCalledWith('users/user-1/avatar/key.png', expect.any(File), {
        access: 'public',
        token: 'https://storage.example.com/upload',
        contentType: 'image/png',
      });
      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('ConfirmAvatar'), {
          storageKey: 'users/user-1/avatar/key.png',
          mimeType: 'image/png',
          sizeBytes: expect.any(Number) as number,
        });
      });
    });

    it('shows an error message when the upload fails', async () => {
      mockPutBlob.mockResolvedValue({ url: 'https://blob.example.com/avatar.png' });
      overrideGql(mockGqlRequest, [
        respondError(REQUEST_AVATAR_UPLOAD_URL, {
          response: { errors: [{ message: 'Unsupported file type' }] },
        }),
      ]);

      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await meLoaded();

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
        expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('RemoveAvatar'));
      });
    });

    it('does not show a Remove button when there is no avatar', async () => {
      render(<SettingsProfilePage />, { wrapper: Wrapper });
      await meLoaded();

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
  });
});
