import { useMutation } from '@tanstack/react-query';
import { gqlClient } from '#/graphql/client';

const CREATE_CHECKOUT_SESSION = `
  mutation CreateCheckoutSession($plan: CheckoutPlan!) {
    createCheckoutSession(plan: $plan) { url }
  }
`;

const CREATE_BILLING_PORTAL_SESSION = `
  mutation CreateBillingPortalSession {
    createBillingPortalSession { url }
  }
`;

export type CheckoutPlan = 'monthly' | 'pass3Months' | 'pass6Months';

/** Sends the browser to the payment provider's page; the provider returns it to the Plan page. */
function goTo(url: string) {
  window.location.assign(url);
}

export function useCheckout() {
  return useMutation({
    mutationFn: (plan: CheckoutPlan) =>
      gqlClient.request<{ createCheckoutSession: { url: string } }>(CREATE_CHECKOUT_SESSION, {
        plan,
      }),
    onSuccess: (data) => goTo(data.createCheckoutSession.url),
  });
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: () =>
      gqlClient.request<{ createBillingPortalSession: { url: string } }>(
        CREATE_BILLING_PORTAL_SESSION,
      ),
    onSuccess: (data) => goTo(data.createBillingPortalSession.url),
  });
}
