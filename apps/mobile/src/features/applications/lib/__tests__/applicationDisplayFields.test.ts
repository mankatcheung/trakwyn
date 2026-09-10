import * as SecureStore from 'expo-secure-store';
import {
  defaultApplicationDisplayFields,
  loadApplicationDisplayFields,
  saveApplicationDisplayFields,
} from '../applicationDisplayFields';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedSecureStore = jest.mocked(SecureStore);

const STORAGE_KEY = 'trakwyn_applications_display_fields';

describe('applicationDisplayFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults every field to visible', () => {
    expect(defaultApplicationDisplayFields()).toEqual({
      role: true,
      location: true,
      date: true,
      tags: true,
      status: true,
      starred: true,
      ghosted: true,
    });
  });

  it('returns the defaults when nothing is stored', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await expect(loadApplicationDisplayFields()).resolves.toEqual(
      defaultApplicationDisplayFields(),
    );
  });

  it('merges a partial stored preference onto the defaults', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(
      JSON.stringify({ location: false, unknownField: true, tags: 'yes' }),
    );

    await expect(loadApplicationDisplayFields()).resolves.toEqual({
      ...defaultApplicationDisplayFields(),
      location: false,
    });
  });

  it('falls back to defaults on unparseable JSON', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce('not json');

    await expect(loadApplicationDisplayFields()).resolves.toEqual(
      defaultApplicationDisplayFields(),
    );
  });

  it('persists a preference to SecureStore', async () => {
    const fields = { ...defaultApplicationDisplayFields(), starred: false };

    await saveApplicationDisplayFields(fields);

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(fields),
    );
  });
});
