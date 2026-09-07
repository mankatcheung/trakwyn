import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useNoteQueries', () => ({ useNotes: jest.fn() }));
jest.mock('../../hooks/useNoteMutations', () => ({
  useCreateNote: jest.fn(),
  useUpdateNote: jest.fn(),
  useDeleteNote: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useNotes } from '../../hooks/useNoteQueries';
import { useCreateNote, useDeleteNote, useUpdateNote } from '../../hooks/useNoteMutations';
import { NotesScreen } from '../NotesScreen';
import type { Note } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseNotes = jest.mocked(useNotes);
const mockedUseCreateNote = jest.mocked(useCreateNote);
const mockedUseUpdateNote = jest.mocked(useUpdateNote);
const mockedUseDeleteNote = jest.mocked(useDeleteNote);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const note: Note = {
  id: '1',
  applicationId: 'app-1',
  content: 'Follow up next week',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<NotesScreen />);
}

describe('NotesScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseUpdateNote.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDeleteNote.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
  });

  it('renders existing notes', async () => {
    mockedUseNotes.mockReturnValue({
      data: [note],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateNote.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Follow up next week')).toBeTruthy());
  });

  it('adds a new note', async () => {
    const mutate = jest.fn();
    mockedUseNotes.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateNote.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('new-note-input'), 'New note content');
    await fireEvent.press(getByTestId('add-note-button'));

    expect(mutate).toHaveBeenCalledWith('New note content', expect.any(Object));
  });

  it('deletes a note after confirmation', async () => {
    const deleteMutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Delete');
      confirm?.onPress?.();
    });
    mockedUseNotes.mockReturnValue({
      data: [note],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseCreateNote.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDeleteNote.mockReturnValue({ mutate: deleteMutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('note-delete-1'));

    expect(deleteMutate).toHaveBeenCalledWith('1', expect.any(Object));
  });
});
