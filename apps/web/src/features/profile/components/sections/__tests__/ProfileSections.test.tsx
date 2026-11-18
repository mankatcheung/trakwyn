import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

import { CertificationsSection } from '#/features/profile/components/sections/CertificationsSection';
import { LanguagesSection } from '#/features/profile/components/sections/LanguagesSection';
import type { ResultOf } from '@graphql-typed-document-node/core';
import { gqlContaining, gqlText } from '#/__tests__/helpers/gqlText';
import { mockGql, respond, respondError, respondWith } from '#/__tests__/helpers/gqlMock';
import {
  CERTIFICATIONS_QUERY,
  CREATE_CERTIFICATION,
} from '#/features/profile/graphql/certificationQueries';
import { LANGUAGES_QUERY } from '#/features/profile/graphql/languageQueries';

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
    mockGql(mockGqlRequest, [respond(CERTIFICATIONS_QUERY, { certifications: [cert] })]);
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

  it('keeps the form open and filled, with the Add button pending, while the save runs (JEF-612)', async () => {
    let finish!: (value: ResultOf<typeof CREATE_CERTIFICATION>) => void;
    mockGql(mockGqlRequest, [
      respond(CERTIFICATIONS_QUERY, { certifications: [cert] }),
      respondWith(CREATE_CERTIFICATION, () => new Promise((resolve) => (finish = resolve))),
    ]);
    render(<CertificationsSection />, { wrapper: Wrapper });
    await screen.findByText('AWS Certified Solutions Architect');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(name, { target: { value: 'CKA' } });
    const form = name.closest('form')!;
    // A double click is two submits in a row; only the first may reach the API.
    fireEvent.submit(form);
    await screen.findByRole('button', { name: 'Saving…' });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(name.value).toBe('CKA');
    finish({ createCertification: { id: 'c2', name: 'CKA' } });

    await waitFor(() => expect(document.querySelector('input[name="name"]')).toBeNull());
    expect(
      mockGqlRequest.mock.calls.filter(([q]) => gqlText(q).includes('createCertification')),
    ).toHaveLength(1);
  });

  it('shows the API error and keeps what was typed when the save fails (JEF-612)', async () => {
    mockGql(mockGqlRequest, [
      respond(CERTIFICATIONS_QUERY, { certifications: [cert] }),
      respondError(CREATE_CERTIFICATION, {
        response: {
          errors: [
            { message: 'Certification limit reached', extensions: { code: 'QUOTA_EXCEEDED' } },
          ],
        },
      }),
    ]);
    render(<CertificationsSection />, { wrapper: Wrapper });
    await screen.findByText('AWS Certified Solutions Architect');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(name, { target: { value: 'CKA' } });
    fireEvent.submit(name.closest('form')!);

    expect(await screen.findByText(/Certification limit reached/)).toBeInTheDocument();
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('CKA');
    // The error renders before the mutation settles, so the button is still "Saving…" for a tick.
    expect(await within(name.closest('form')!).findByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('hints at what to enter in the name, issuer and URL fields (JEF-614)', async () => {
    render(<CertificationsSection />, { wrapper: Wrapper });
    await screen.findByText('AWS Certified Solutions Architect');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const form = document.querySelector('form')!;

    expect(form.querySelector('input[name="name"]')).toHaveAttribute(
      'placeholder',
      'AWS Certified Solutions Architect',
    );
    expect(form.querySelector('input[name="issuer"]')).toHaveAttribute(
      'placeholder',
      'Amazon Web Services',
    );
    expect(form.querySelector('input[name="credentialUrl"]')).toHaveAttribute(
      'placeholder',
      'https://',
    );
  });

  it('adds one, sending blank optional fields as null', async () => {
    render(<CertificationsSection />, { wrapper: Wrapper });
    await screen.findByText('AWS Certified Solutions Architect');

    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    const name = document.querySelector<HTMLInputElement>('input[name="name"]')!;
    fireEvent.change(name, { target: { value: 'CKA' } });
    fireEvent.submit(name.closest('form')!);

    await waitFor(() =>
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('createCertification'), {
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
});

describe('LanguagesSection (JEF-592)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGql(mockGqlRequest, [
      respond(LANGUAGES_QUERY, {
        languages: [{ id: 'l1', name: 'French', proficiency: 'Fluent', createdAt: '2024-01-01' }],
      }),
    ]);
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
      expect(mockGqlRequest).toHaveBeenCalledWith(gqlContaining('createLanguage'), {
        input: { name: 'German', proficiency: null },
      }),
    );
  });
});
