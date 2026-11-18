import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

const { mockGqlRequest } = vi.hoisted(() => ({
  mockGqlRequest: vi.fn(),
}));

vi.mock('#/graphql/client', () => ({
  gqlClient: { request: mockGqlRequest },
}));

vi.mock('#/lib/undoToast', () => ({
  // Sends the operation the call site handed over, instead of running an
  // opaque callback. The request is now described as data so it can be
  // replayed after a refresh (JEF-191), which means this mock also checks
  // that each call site names the right document and variables.
  showUndoToast: vi.fn(
    ({
      operation,
      onSettled,
    }: {
      operation: { document: string; variables?: Record<string, unknown> };
      onSettled?: () => void;
    }) => {
      void Promise.resolve(mockGqlRequest(operation.document, operation.variables))
        .catch(() => {})
        .finally(() => onSettled?.());
    },
  ),
}));

import { ContactsTab } from '#/features/application-detail/components/tabs/ContactsTab';
import { gqlText, gqlContaining } from '#/__tests__/helpers/gqlText';
import { mockGql, respond, respondError, respondWith } from '#/__tests__/helpers/gqlMock';
import type { ResultOf } from '@graphql-typed-document-node/core';
import {
  CONTACTS_QUERY,
  CREATE_CONTACT,
  DELETE_CONTACT,
  UPDATE_CONTACT,
} from '#/features/application-detail/graphql/applicationDetailQueries';

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

const mockContact = {
  id: 'contact-1',
  applicationId: 'app-1',
  name: 'Jane Recruiter',
  role: 'Technical Recruiter',
  email: 'jane@example.com',
  phone: '555-1234',
  linkedinUrl: 'https://linkedin.com/in/jane',
  notes: 'Met at a conference',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('ContactsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading placeholder instead of the empty state while the request is in flight', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });

    expect(screen.queryByText('No contacts yet.')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no contacts', async () => {
    mockGqlRequest.mockResolvedValue({ contacts: [] });
    render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No contacts yet.')).toBeInTheDocument();
    });
  });

  it('renders an existing contact', async () => {
    mockGqlRequest.mockResolvedValue({ contacts: [mockContact] });
    render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Jane Recruiter')).toBeInTheDocument();
    });
    expect(screen.getByText('Technical Recruiter')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('creates a new contact', async () => {
    mockGql(mockGqlRequest, [
      respond(CREATE_CONTACT, { createContact: { ...mockContact, id: 'contact-2' } }),
      respond(CONTACTS_QUERY, { contacts: [] }),
    ]);
    render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('No contacts yet.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add contact/i }));
    fireEvent.change(screen.getByPlaceholderText('Jane Smith'), {
      target: { value: 'New Contact' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        gqlContaining('CreateContact'),
        expect.objectContaining({ applicationId: 'app-1', name: 'New Contact' }),
      );
    });
  });

  it('edits an existing contact', async () => {
    mockGql(mockGqlRequest, [
      respond(UPDATE_CONTACT, { updateContact: { ...mockContact, name: 'Updated Name' } }),
      respond(CONTACTS_QUERY, { contacts: [mockContact] }),
    ]);
    render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Jane Recruiter')).toBeInTheDocument();
    });

    const card = screen
      .getByText('Jane Recruiter')
      .closest('div[class*="bg-white"]') as HTMLElement;
    fireEvent.click(within(card).getAllByRole('button')[0]);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Jane Recruiter')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByDisplayValue('Jane Recruiter'), {
      target: { value: 'Updated Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        gqlContaining('UpdateContact'),
        expect.objectContaining({ id: 'contact-1', name: 'Updated Name' }),
      );
    });
  });

  it('deletes a contact', async () => {
    mockGql(mockGqlRequest, [
      respond(DELETE_CONTACT, { deleteContact: true }),
      respond(CONTACTS_QUERY, { contacts: [mockContact] }),
    ]);
    render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('Jane Recruiter')).toBeInTheDocument();
    });

    const card = screen
      .getByText('Jane Recruiter')
      .closest('div[class*="bg-white"]') as HTMLElement;
    fireEvent.click(within(card).getAllByRole('button')[1]);

    await waitFor(() => {
      expect(mockGqlRequest).toHaveBeenCalledWith(
        gqlContaining('DeleteContact'),
        expect.objectContaining({ id: 'contact-1' }),
      );
    });
  });

  describe('the contact form (JEF-621)', () => {
    async function openAddForm() {
      render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });
      await screen.findByText('No contacts yet.');
      fireEvent.click(screen.getByRole('button', { name: /add contact/i }));
      return screen.getByPlaceholderText('Jane Smith');
    }
    const createCalls = () =>
      mockGqlRequest.mock.calls.filter(([q]) => gqlText(q).includes('CreateContact'));

    it('is a real form', async () => {
      mockGqlRequest.mockResolvedValue({ contacts: [] });
      const nameInput = await openAddForm();
      expect(nameInput.closest('form')).not.toBeNull();
    });

    it('asks for a name and sends nothing while it is blank', async () => {
      mockGqlRequest.mockResolvedValue({ contacts: [] });
      await openAddForm();

      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

      expect(await screen.findByText('Required')).toBeInTheDocument();
      expect(createCalls()).toHaveLength(0);
    });

    it('submits on Enter', async () => {
      mockGql(mockGqlRequest, [
        respond(CREATE_CONTACT, { createContact: { ...mockContact, id: 'contact-2' } }),
        respond(CONTACTS_QUERY, { contacts: [] }),
      ]);
      const nameInput = await openAddForm();

      await userEvent.type(nameInput, 'Enter Contact{Enter}');

      await waitFor(() => expect(createCalls()).toHaveLength(1));
      expect(createCalls()[0][1]).toEqual(expect.objectContaining({ name: 'Enter Contact' }));
    });

    it('creates once on a double click', async () => {
      let release: (value: ResultOf<typeof CREATE_CONTACT>) => void = () => {};
      mockGql(mockGqlRequest, [
        respondWith(
          CREATE_CONTACT,
          () =>
            new Promise((resolve) => {
              release = resolve;
            }),
        ),
        respond(CONTACTS_QUERY, { contacts: [] }),
      ]);
      const nameInput = await openAddForm();
      fireEvent.change(nameInput, { target: { value: 'Double' } });

      const save = screen.getByRole('button', { name: /^save$/i });
      fireEvent.click(save);
      await waitFor(() => expect(createCalls()).toHaveLength(1));
      fireEvent.click(save);
      release({ createContact: { ...mockContact, id: 'contact-2' } });

      await waitFor(() => expect(screen.queryByPlaceholderText('Jane Smith')).toBeNull());
      expect(createCalls()).toHaveLength(1);
    });

    it('shows a failed save under the form and keeps what was typed', async () => {
      mockGql(mockGqlRequest, [
        respondError(CREATE_CONTACT, {
          response: {
            errors: [{ message: 'Contact limit reached', extensions: { code: 'VALIDATION' } }],
          },
        }),
        respond(CONTACTS_QUERY, { contacts: [] }),
      ]);
      const nameInput = await openAddForm();
      fireEvent.change(nameInput, { target: { value: 'Kept' } });

      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

      expect(await screen.findByText('Contact limit reached')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Jane Smith')).toHaveValue('Kept');
    });

    it('closes the form on Cancel without saving', async () => {
      mockGqlRequest.mockResolvedValue({ contacts: [] });
      await openAddForm();

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByPlaceholderText('Jane Smith')).toBeNull();
      expect(createCalls()).toHaveLength(0);
    });

    it('starts the edit form from the contact and closes it on Cancel', async () => {
      mockGqlRequest.mockResolvedValue({ contacts: [mockContact] });
      render(<ContactsTab applicationId="app-1" />, { wrapper: Wrapper });
      await screen.findByText('Jane Recruiter');
      const card = screen
        .getByText('Jane Recruiter')
        .closest('div[class*="bg-white"]') as HTMLElement;
      fireEvent.click(within(card).getAllByRole('button')[0]);

      expect(await screen.findByDisplayValue('jane@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Met at a conference')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
      expect(screen.queryByDisplayValue('jane@example.com')).toBeNull();
      expect(screen.getByText('Jane Recruiter')).toBeInTheDocument();
    });
  });
});
