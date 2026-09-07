import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';
import '../../../../i18n';

jest.mock('../../hooks/useIntegrations', () => ({
  useApiTokens: jest.fn(),
  useCreateApiToken: jest.fn(),
  useDeleteApiToken: jest.fn(),
  useMcpOAuthGrants: jest.fn(),
  useRevokeMcpOAuthGrant: jest.fn(),
  useShareLinks: jest.fn(),
  useCreateShareLink: jest.fn(),
  useDeleteShareLink: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import {
  useApiTokens,
  useCreateApiToken,
  useCreateShareLink,
  useDeleteApiToken,
  useDeleteShareLink,
  useMcpOAuthGrants,
  useRevokeMcpOAuthGrant,
  useShareLinks,
} from '../../hooks/useIntegrations';
import { IntegrationsScreen } from '../IntegrationsScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseApiTokens = jest.mocked(useApiTokens);
const mockedUseCreateApiToken = jest.mocked(useCreateApiToken);
const mockedUseDeleteApiToken = jest.mocked(useDeleteApiToken);
const mockedUseMcpOAuthGrants = jest.mocked(useMcpOAuthGrants);
const mockedUseRevokeMcpOAuthGrant = jest.mocked(useRevokeMcpOAuthGrant);
const mockedUseShareLinks = jest.mocked(useShareLinks);
const mockedUseCreateShareLink = jest.mocked(useCreateShareLink);
const mockedUseDeleteShareLink = jest.mocked(useDeleteShareLink);
const mockedUseTheme = jest.mocked(useTheme);

function setDefaults() {
  mockedUseApiTokens.mockReturnValue({ data: [] } as never);
  mockedUseCreateApiToken.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
  mockedUseDeleteApiToken.mockReturnValue({ mutate: jest.fn() } as never);
  mockedUseMcpOAuthGrants.mockReturnValue({ data: [], isLoading: false } as never);
  mockedUseRevokeMcpOAuthGrant.mockReturnValue({ mutate: jest.fn() } as never);
  mockedUseShareLinks.mockReturnValue({ data: [] } as never);
  mockedUseCreateShareLink.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
  mockedUseDeleteShareLink.mockReturnValue({ mutate: jest.fn() } as never);
}

describe('IntegrationsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    setDefaults();
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });

  it('creates an API token and shows the created token value', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({
      id: '1',
      name: 'CI',
      token: 'tok_abc',
      scope: 'read',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockedUseCreateApiToken.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByTestId } = await render(<IntegrationsScreen />);

    await fireEvent.press(getByTestId('new-api-token-button'));
    await fireEvent.changeText(getByTestId('api-token-name-input'), 'CI');
    await fireEvent.press(getByTestId('create-api-token-button'));

    await findByTestId('new-api-token-value');
    expect(mutateAsync).toHaveBeenCalledWith({ name: 'CI', scope: 'read' });
  });

  it('revokes an existing API token', async () => {
    mockedUseApiTokens.mockReturnValue({
      data: [
        {
          id: 'tok-1',
          name: 'CI',
          scope: 'read',
          lastUsedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as never);
    const mutate = jest.fn();
    mockedUseDeleteApiToken.mockReturnValue({ mutate } as never);

    const { getByTestId } = await render(<IntegrationsScreen />);

    await fireEvent.press(getByTestId('revoke-api-token-tok-1'));

    expect(mutate).toHaveBeenCalledWith('tok-1');
  });

  it('shows an empty state for MCP grants and revokes one when present', async () => {
    mockedUseMcpOAuthGrants.mockReturnValue({
      data: [
        {
          id: 'grant-1',
          clientName: 'Claude Desktop',
          scope: 'read',
          authorizedAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: null,
        },
      ],
      isLoading: false,
    } as never);
    const mutate = jest.fn();
    mockedUseRevokeMcpOAuthGrant.mockReturnValue({ mutate } as never);

    const { getByTestId } = await render(<IntegrationsScreen />);

    await fireEvent.press(getByTestId('revoke-mcp-grant-grant-1'));

    expect(mutate).toHaveBeenCalledWith('grant-1');
  });

  it('creates a share link and can share its token', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({
      id: '1',
      name: 'Mentor',
      token: 'share_abc',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockedUseCreateShareLink.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId, findByTestId } = await render(<IntegrationsScreen />);

    await fireEvent.press(getByTestId('new-share-link-button'));
    await fireEvent.changeText(getByTestId('share-link-name-input'), 'Mentor');
    await fireEvent.press(getByTestId('create-share-link-button'));

    await findByTestId('new-share-link-value');
    expect(mutateAsync).toHaveBeenCalledWith('Mentor');
  });
});
