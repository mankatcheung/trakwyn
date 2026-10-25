import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { mapPolarEvent } from '#src/infrastructure/billing/polarWebhookEvents.js';

// Most payloads here are shaped from Polar's webhook docs (https://polar.sh/docs), keeping
// the fields the mapper reads. One is a real delivery from the sandbox (see "a recorded
// delivery" below), and the sandbox run in JEF-433 worked end to end with the rest.

const PASS_MONTHS = new Map<string, 3 | 6>([
  ['prod-pass-3m', 3],
  ['prod-pass-6m', 6],
]);

const TIMESTAMP = '2026-11-01T10:00:00.000Z';

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  status: 'active',
  customer_id: 'cus-1',
  customer: { id: 'cus-1', external_id: 'user-1' },
  metadata: { userId: 'user-1' },
  cancel_at_period_end: false,
  current_period_end: '2026-12-01T00:00:00Z',
  ends_at: null,
  ended_at: null,
  ...overrides,
});

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'ord-1',
  status: 'paid',
  billing_reason: 'purchase',
  subscription_id: null,
  product_id: 'prod-pass-3m',
  customer_id: 'cus-1',
  customer: { id: 'cus-1', external_id: 'user-1' },
  metadata: { userId: 'user-1' },
  ...overrides,
});

const map = (type: string, data: unknown) =>
  mapPolarEvent('evt-1', { type, timestamp: TIMESTAMP, data }, PASS_MONTHS);

describe('mapPolarEvent', () => {
  describe('subscription started', () => {
    it('maps subscription.active, taking the user from the external customer id', () => {
      expect(map('subscription.active', subscription())).toEqual({
        id: 'evt-1',
        userId: 'user-1',
        customerId: 'cus-1',
        kind: 'subscription_started',
        subscriptionId: 'sub-1',
      });
    });

    it('falls back to the checkout metadata when the customer has no external id', () => {
      const event = map(
        'subscription.active',
        subscription({ customer: { id: 'cus-1', external_id: null }, metadata: { userId: 'u-9' } }),
      );
      expect(event.userId).toBe('u-9');
    });

    it('has no user when neither carries one, so the customer id has to find them', () => {
      const event = map(
        'subscription.active',
        subscription({ customer: { id: 'cus-1', external_id: null }, metadata: {} }),
      );
      expect(event.userId).toBeNull();
      expect(event.customerId).toBe('cus-1');
    });

    it('maps subscription.uncanceled to a start, which clears the end date', () => {
      expect(map('subscription.uncanceled', subscription()).kind).toBe('subscription_started');
    });
  });

  describe('subscription ending', () => {
    it('maps subscription.canceled to the end of the paid period', () => {
      const event = map(
        'subscription.canceled',
        subscription({ cancel_at_period_end: true, ends_at: '2026-12-01T00:00:00Z' }),
      );
      expect(event).toMatchObject({
        kind: 'subscription_cancelled',
        subscriptionId: 'sub-1',
        endsAt: new Date('2026-12-01T00:00:00Z'),
      });
    });

    it('uses current_period_end when ends_at is not set', () => {
      const event = map('subscription.canceled', subscription({ ends_at: null }));
      expect(event).toMatchObject({ endsAt: new Date('2026-12-01T00:00:00Z') });
    });

    it('maps subscription.revoked (a lapse after failed payments) to a cancellation at ended_at', () => {
      const event = map(
        'subscription.revoked',
        subscription({ status: 'unpaid', ended_at: '2026-11-22T00:00:00Z' }),
      );
      expect(event).toMatchObject({
        kind: 'subscription_cancelled',
        subscriptionId: 'sub-1',
        endsAt: new Date('2026-11-22T00:00:00Z'),
      });
    });

    it('dates a revocation by the delivery when Polar names no end', () => {
      const event = map('subscription.revoked', subscription({ ended_at: null, ends_at: null }));
      expect(event).toMatchObject({ endsAt: new Date(TIMESTAMP) });
    });
  });

  describe('events that change nothing', () => {
    it.each([
      'subscription.created',
      'subscription.updated',
      'subscription.cycled',
      'subscription.past_due',
      'refund.created',
      'refund.updated',
      'order.created',
      'order.updated',
      'customer.created',
      'checkout.updated',
      'something.polar.adds.later',
    ])('ignores %s', (type) => {
      expect(map(type, { id: 'x' }).kind).toBe('ignored');
    });

    it('ignores a renewal: the order of a subscription never extends anything', () => {
      for (const billing_reason of ['subscription_create', 'subscription_cycle']) {
        const event = map(
          'order.paid',
          order({ billing_reason, subscription_id: 'sub-1', product_id: 'prod-monthly' }),
        );
        expect(event.kind).toBe('ignored');
      }
    });
  });

  describe('pass purchased', () => {
    it.each([
      ['prod-pass-3m', 3],
      ['prod-pass-6m', 6],
    ])('maps a paid one-off order for %s to %i months', (product_id, months) => {
      expect(map('order.paid', order({ product_id }))).toEqual({
        id: 'evt-1',
        userId: 'user-1',
        customerId: 'cus-1',
        kind: 'pass_purchased',
        months,
      });
    });

    it('fails on a paid one-off order for a product it does not know, so Polar redelivers', () => {
      expect(() => map('order.paid', order({ product_id: 'prod-other' }))).toThrow(/prod-other/);
    });
  });

  describe('payment reversed', () => {
    it('maps a refunded subscription order to a reversal of the subscription', () => {
      const event = map(
        'order.refunded',
        order({
          status: 'refunded',
          billing_reason: 'subscription_create',
          subscription_id: 'sub-1',
          product_id: 'prod-monthly',
        }),
      );
      expect(event).toMatchObject({
        kind: 'payment_reversed',
        product: 'subscription',
        subscriptionId: 'sub-1',
      });
    });

    it('maps a refunded one-off order to a reversal of the pass', () => {
      const event = map('order.refunded', order({ status: 'refunded' }));
      expect(event).toMatchObject({
        kind: 'payment_reversed',
        product: 'pass',
        subscriptionId: null,
      });
    });

    it('leaves a partial refund alone: only a full refund ends the plan', () => {
      expect(map('order.refunded', order({ status: 'partially_refunded' })).kind).toBe('ignored');
    });
  });

  describe('malformed payloads', () => {
    it('throws when a known event lacks what the mapper needs, so Polar redelivers and the log shows it', () => {
      expect(() => map('subscription.active', { status: 'active' })).toThrow(
        /subscription\.active/,
      );
      expect(() => mapPolarEvent('evt-1', { type: 'order.paid' }, PASS_MONTHS)).toThrow();
    });

    it('throws on a body that is not an event at all', () => {
      expect(() => mapPolarEvent('evt-1', 'nope', PASS_MONTHS)).toThrow();
    });
  });

  describe('a recorded delivery', () => {
    // A real `order.paid` for a 3-month pass, sent by the Polar sandbox on 2026-10-25
    // (JEF-433), with every id, name and address replaced by a placeholder. It is the one
    // payload here that was not written from the docs.
    const recorded = JSON.parse(
      readFileSync(new URL('./fixtures/polarOrderPaidPass.json', import.meta.url), 'utf8'),
    );
    const passes = new Map<string, 3 | 6>([[recorded.data.product_id, 3]]);

    it('maps to a 3-month pass for the user named by the external customer id', () => {
      expect(mapPolarEvent('msg-recorded-1', recorded, passes)).toEqual({
        id: 'msg-recorded-1',
        userId: 'user-fixture-1',
        customerId: '00000000-0000-4000-8000-0000000000c1',
        kind: 'pass_purchased',
        months: 3,
      });
    });

    it('finds the user in the checkout metadata when the customer has no external id', () => {
      const withoutExternalId = {
        ...recorded,
        data: { ...recorded.data, customer: { ...recorded.data.customer, external_id: null } },
      };

      expect(mapPolarEvent('msg-recorded-1', withoutExternalId, passes)).toMatchObject({
        userId: 'user-fixture-1',
        kind: 'pass_purchased',
      });
    });

    it('fails, rather than dropping the payment, when the paid product is not a known pass', () => {
      expect(() => mapPolarEvent('msg-recorded-1', recorded, new Map())).toThrow(/not a pass/);
    });
  });
});
