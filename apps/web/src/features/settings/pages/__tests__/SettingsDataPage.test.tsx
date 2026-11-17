import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockNavigate, mockGqlRequest } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGqlRequest: vi.fn(),
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
  put: vi.fn(),
}));

import { ThemeProvider } from '#/lib/theme';
import { SettingsDataPage } from '#/features/settings/pages/SettingsDataPage';

const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

describe('SettingsDataPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data export', () => {
    it('calls exportUserData and triggers download on success', async () => {
      mockGqlRequest.mockResolvedValue({ exportUserData: '{"applications":[]}' });
      const mockRevokeObjectURL = vi.fn();
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL);

      render(<SettingsDataPage />, { wrapper: Wrapper });
      fireEvent.click(screen.getByRole('button', { name: /download export/i }));

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('exportUserData'));
      });
      await waitFor(() => {
        expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      });
    });
  });

  describe('data import', () => {
    const selectFile = (content: string, name = 'export.json') => {
      const file = new File([content], name, { type: 'application/json' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });
    };

    it('calls importUserData with the file contents and shows the summary', async () => {
      mockGqlRequest.mockResolvedValue({
        importUserData: {
          applicationsImported: 2,
          applicationsSkipped: 1,
          notesImported: 3,
          documentsSkipped: 1,
        },
      });
      render(<SettingsDataPage />, { wrapper: Wrapper });

      selectFile('{"applications":[]}');

      await waitFor(() => {
        expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('ImportUserData'), {
          data: '{"applications":[]}',
        });
      });
      await waitFor(() => {
        expect(screen.getByText(/Imported 2 applications and 3 notes/)).toBeInTheDocument();
      });
      expect(screen.getByText(/Skipped 1 invalid application/)).toBeInTheDocument();
      expect(screen.getByText(/Skipped 1 document/)).toBeInTheDocument();
    });

    it('shows error message when import fails', async () => {
      mockGqlRequest.mockImplementation((query: unknown) => {
        if (typeof query === 'string' && query.includes('ImportUserData')) {
          return Promise.reject({
            response: { errors: [{ message: 'Import file is not valid JSON' }] },
          });
        }
        return Promise.resolve({});
      });
      render(<SettingsDataPage />, { wrapper: Wrapper });

      selectFile('not json');

      await waitFor(() => {
        expect(screen.getByText('Import file is not valid JSON')).toBeInTheDocument();
      });
    });
  });
});
