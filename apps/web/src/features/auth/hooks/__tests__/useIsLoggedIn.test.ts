import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { useIsLoggedIn } from '#/features/auth/hooks/useIsLoggedIn';

const { hasSessionCookie } = vi.hoisted(() => ({ hasSessionCookie: vi.fn() }));
vi.mock('#/graphql/client', () => ({ hasSessionCookie }));

describe('useIsLoggedIn', () => {
  beforeEach(() => hasSessionCookie.mockReset());

  it('becomes true after mount when the session hint cookie is present', () => {
    hasSessionCookie.mockReturnValue(true);
    const { result } = renderHook(() => useIsLoggedIn());
    expect(result.current).toBe(true);
  });

  it('stays false when there is no session hint cookie', () => {
    hasSessionCookie.mockReturnValue(false);
    const { result } = renderHook(() => useIsLoggedIn());
    expect(result.current).toBe(false);
  });

  it('renders false on the server so hydration matches, even with a cookie', () => {
    hasSessionCookie.mockReturnValue(true);
    function Probe() {
      return createElement('span', null, String(useIsLoggedIn()));
    }
    expect(renderToString(createElement(Probe))).toContain('false');
  });
});
