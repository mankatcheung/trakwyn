import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useContactQueries', () => ({ useContacts: jest.fn() }));
jest.mock('../../hooks/useContactMutations', () => ({
  useCreateContact: jest.fn(),
  useUpdateContact: jest.fn(),
  useDeleteContact: jest.fn(),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useContacts } from '../../hooks/useContactQueries';
import {
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from '../../hooks/useContactMutations';
import { ContactsScreen } from '../ContactsScreen';
import type { Contact } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseContacts = jest.mocked(useContacts);
const mockedUseCreateContact = jest.mocked(useCreateContact);
const mockedUseUpdateContact = jest.mocked(useUpdateContact);
const mockedUseDeleteContact = jest.mocked(useDeleteContact);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const contact: Contact = {
  id: 'c1',
  applicationId: 'app-1',
  name: 'Jane Smith',
  role: 'Recruiter',
  email: 'jane@example.com',
  phone: null,
  linkedinUrl: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<ContactsScreen />);
}

describe('ContactsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseUpdateContact.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDeleteContact.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseCreateContact.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
  });

  it('renders existing contacts', async () => {
    mockedUseContacts.mockReturnValue({
      data: [contact],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Jane Smith')).toBeTruthy());
    expect(getByText('Recruiter')).toBeTruthy();
    expect(getByText('jane@example.com')).toBeTruthy();
  });

  it('shows an empty state when there are no contacts', async () => {
    mockedUseContacts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByText } = await renderScreen();

    expect(getByText('No contacts yet.')).toBeTruthy();
  });

  it('creates a new contact from the form', async () => {
    const mutate = jest.fn();
    mockedUseContacts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateContact.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('add-contact-button'));
    await fireEvent.changeText(getByTestId('contact-name-input'), 'New Contact');
    await fireEvent.press(getByTestId('save-contact-button'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Contact' }),
      expect.any(Object),
    );
  });

  it('edits an existing contact', async () => {
    const mutate = jest.fn();
    mockedUseContacts.mockReturnValue({
      data: [contact],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseUpdateContact.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('edit-contact-c1'));
    await fireEvent.changeText(getByTestId('contact-name-input'), 'Jane S. Updated');
    await fireEvent.press(getByTestId('save-contact-button'));

    expect(mutate).toHaveBeenCalledWith(
      { id: 'c1', input: expect.objectContaining({ name: 'Jane S. Updated' }) },
      expect.any(Object),
    );
  });

  it('deletes a contact after confirmation', async () => {
    const mutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Delete');
      confirm?.onPress?.();
    });
    mockedUseContacts.mockReturnValue({
      data: [contact],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDeleteContact.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('delete-contact-c1'));

    expect(mutate).toHaveBeenCalledWith('c1', expect.any(Object));
  });
});
