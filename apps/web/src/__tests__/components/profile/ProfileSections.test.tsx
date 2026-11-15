import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { CertificationsSection } from '#/routes/_authenticated/profile/-components/CertificationsSection';
import { LanguagesSection } from '#/routes/_authenticated/profile/-components/LanguagesSection';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const cert = {
  id: 'c1',
  name: 'AWS Certified Solutions Architect',
  issuer: 'Amazon Web Services',
  issuedAt: '2022-03-01T00:00:00.000Z',
  expiresAt: null,
  credentialUrl: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('CertificationsSection (JEF-592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('query Certifications'))
        return Promise.resolve({ certifications: [cert] });
      return Promise.resolve({});
    });
  });

  it('lists certifications with issuer and month', async () => {
    render(<CertificationsSection />, { wrapper: Wrapper });

    expect(await screen.findByText('AWS Certified Solutions Architect')).toBeInTheDocument();
    expect(screen.getByText('Amazon Web Services · 2022-03')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockGqlRequest.mockResolvedValue({ certifications: [] });
    render(<CertificationsSection />, { wrapper: Wrapper });

    expect(await screen.findByText('No certifications added yet.')).toBeInTheDocument();
  });

  it('adds one, sending blank optional fields as null', async () => {
    render(<CertificationsSection />, { wrapper: Wrapper });
    await screen.findByText('AWS Certified Solutions Architect');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(name, { target: { value: 'CKA' } });
    fireEvent.submit(name.closest('form')!);

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('createCertification'), {
        input: {
          name: 'CKA',
          issuer: null,
          issuedAt: null,
          expiresAt: null,
          credentialUrl: null,
        },
      }),
    );
  });

  it('deletes one', async () => {
    render(<CertificationsSection />, { wrapper: Wrapper });
    await screen.findByText('AWS Certified Solutions Architect');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('deleteCertification'), {
        id: 'c1',
      }),
    );
  });
});

describe('LanguagesSection (JEF-592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGqlRequest.mockImplementation((query: string) => {
      if (query.includes('query Languages')) {
        return Promise.resolve({
          languages: [{ id: 'l1', name: 'French', proficiency: 'Fluent', createdAt: '2024-01-01' }],
        });
      }
      return Promise.resolve({});
    });
  });

  it('lists languages with their level', async () => {
    render(<LanguagesSection />, { wrapper: Wrapper });

    expect(await screen.findByText('French')).toBeInTheDocument();
    expect(screen.getByText('· Fluent')).toBeInTheDocument();
  });

  it('adds one', async () => {
    render(<LanguagesSection />, { wrapper: Wrapper });
    await screen.findByText('French');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const name = screen.getByPlaceholderText('French') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'German' } });
    fireEvent.submit(name.closest('form')!);

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(expect.stringContaining('createLanguage'), {
        input: { name: 'German', proficiency: null },
      }),
    );
  });
});
