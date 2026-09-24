import React from 'react';
import { render } from '@testing-library/react-native';
import { useSegments } from 'expo-router';
import { NavigationBreadcrumbs } from '../NavigationBreadcrumbs';
import { addBreadcrumb } from '../../lib/analytics';

jest.mock('expo-router', () => ({ useSegments: jest.fn() }));
jest.mock('../../lib/analytics', () => ({ addBreadcrumb: jest.fn() }));

const mockedUseSegments = jest.mocked(useSegments);
const mockedAddBreadcrumb = jest.mocked(addBreadcrumb);

describe('NavigationBreadcrumbs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records the route the user moved to', async () => {
    mockedUseSegments.mockReturnValue(['(app)', 'applications'] as never);

    await render(<NavigationBreadcrumbs />);

    expect(mockedAddBreadcrumb).toHaveBeenCalledWith('Navigated', {
      route: '/(app)/applications',
    });
  });

  // The whole reason this uses useSegments() rather than usePathname():
  // segments are the *file* names, so a dynamic route arrives as `[id]`
  // and a crash report says "an application detail screen" rather than
  // which application.
  it('records the route pattern, never the identifier in it', async () => {
    mockedUseSegments.mockReturnValue(['(app)', 'applications', '[id]'] as never);

    await render(<NavigationBreadcrumbs />);

    const [, properties] = mockedAddBreadcrumb.mock.calls[0] as [string, { route: string }];
    expect(properties.route).toBe('/(app)/applications/[id]');
  });

  it('does not repeat itself when a re-render leaves the route unchanged', async () => {
    mockedUseSegments.mockReturnValue(['(app)', 'applications'] as never);

    const { rerender } = await render(<NavigationBreadcrumbs />);
    await rerender(<NavigationBreadcrumbs />);
    await rerender(<NavigationBreadcrumbs />);

    expect(mockedAddBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('records again once the route actually changes', async () => {
    mockedUseSegments.mockReturnValue(['(app)', 'applications'] as never);
    const { rerender } = await render(<NavigationBreadcrumbs />);

    mockedUseSegments.mockReturnValue(['(app)', 'settings'] as never);
    await rerender(<NavigationBreadcrumbs />);

    expect(mockedAddBreadcrumb).toHaveBeenCalledTimes(2);
    expect(mockedAddBreadcrumb).toHaveBeenLastCalledWith('Navigated', {
      route: '/(app)/settings',
    });
  });

  it('renders nothing of its own', async () => {
    mockedUseSegments.mockReturnValue(['(app)'] as never);

    const { toJSON } = await render(<NavigationBreadcrumbs />);

    expect(toJSON()).toBeNull();
  });
});
