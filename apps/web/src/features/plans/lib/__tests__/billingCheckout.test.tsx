import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBillingPortal, useCheckout } from '#/features/plans/lib/billingCheckout';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request } }));

const assign = vi.fn();

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

describe('billingCheckout', () => {
  beforeEach(() => {
    request.mockReset();
    assign.mockReset();
    vi.stubGlobal('location', { ...window.location, assign });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('useCheckout', () => {
    it('creates a session for the chosen plan and sends the browser to its url', async () => {
      request.mockResolvedValue({ createCheckoutSession: { url: 'https://pay.example/c/1' } });
      const { result } = setup(() => useCheckout());
      result.current.mutate('pass3Months');
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/c/1'));
      expect(request).toHaveBeenCalledWith(expect.anything(), { plan: 'pass3Months' });
    });

    it('stays on the page and reports the error when the session cannot be created', async () => {
      request.mockRejectedValue(new Error('provider down'));
      const { result } = setup(() => useCheckout());
      result.current.mutate('monthly');
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('useBillingPortal', () => {
    it('opens the billing portal url', async () => {
      request.mockResolvedValue({ createBillingPortalSession: { url: 'https://pay.example/p/1' } });
      const { result } = setup(() => useBillingPortal());
      result.current.mutate();
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/p/1'));
    });

    it('stays on the page when the portal cannot be created', async () => {
      request.mockRejectedValue(new Error('nope'));
      const { result } = setup(() => useBillingPortal());
      result.current.mutate();
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(assign).not.toHaveBeenCalled();
    });
  });
});
