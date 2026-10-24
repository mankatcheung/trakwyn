# Polar (payment provider)

Polar is the merchant of record for Pro (JEF-426): it is the legal seller, collects and files VAT and sales tax, and handles chargebacks. There is no Terraform here; it is set up by hand in Polar's dashboard, and this file is the record of what to set.

The API side is behind `IBillingProvider` (`apps/api/src/use-cases/ports/`). Only the **fake** adapter exists today, so none of this is needed for dev, CI or e2e (`BILLING_PROVIDER=fake`, no credentials). The Polar adapter is written once steps 1 and 2 below are confirmed. If either fails, apply to Paddle instead; only the adapter changes.

## 1. Confirm before building the adapter

- [x] Polar accepts Trakwyn (domain review) and a UK sole trader. The account was opened on 2026-10-24. The first product description, which led with "job search tracker for individual job seekers", was flagged as an unsupported use case (job boards and resume or hiring tools); the account opened after the description was reworded to say what the software does. Trakwyn has no job listings and no employer side. Polar may review the live site later, so keep the public wording accurate.
- [x] Payouts: the Wise Business GBP account (UK account details) is linked as the payout account and the payout currency is **GBP**. Polar's payout accounts need a bank account in the business's country and currency, so USD, EUR and HKD Wise balances cannot be used. Customers pay in their local currency; Polar converts each sale to USD for the balance, and the payout converts to GBP, so there is nothing to convert by hand. Withdrawals are manual. Fees (Polar's fees page, which names them as Stripe's, with no Polar markup): $2 per month with an active payout, 0.25% + $0.25 per payout, and a cross-border (currency conversion) fee of 0.25% (EU) to 1% (other countries), which presumably includes the UK. No minimum payout is stated there. Withdraw in larger, less frequent amounts to keep the fixed costs small.
- [x] The sandbox covers **both** subscriptions and one-off purchases.
- [x] Polar's own refund terms and dispute handling against our policy below. Checked against the current terms (<https://polar.sh/legal/terms>) and found compatible with the 14-day, no-questions policy. From the docs: sellers can refund in full or in part, with no window or reason required; the processing fee is not returned on a refund (about 5% + $0.50 on the Starter plan); Polar can also refund up to 60 days after purchase to prevent chargebacks, so a refund can arrive after our 14 days and the webhook must map it to a reversal; a dispute costs $15 whatever the outcome, and buyers can file a chargeback for up to 120 days. Polar aims to keep the chargeback rate under 0.4% and escalates through refunds, held payouts and a blocked account if it climbs. No clause was found that obliges a seller to honour their own refund policy.

## 2. Products and prices

Create these in the sandbox first, then again in live. The IDs go in the API's environment when the adapter lands.

| Product              | Type                  | Price                              |
| -------------------- | --------------------- | ---------------------------------- |
| Pro monthly          | Subscription, monthly | $12, with local EUR and GBP prices |
| Pro monthly, founder | Subscription, monthly | $9, with local EUR and GBP prices  |
| Pro 3-month pass     | One-off               | $29, with local EUR and GBP prices |
| Pro 6-month pass     | One-off               | $49, with local EUR and GBP prices |

- The founder price is a **separate product**, not a discount code. The API picks it for users inside 60 days of signup (or of `BILLING_LIVE_FROM`, for earlier users), so it cannot be shared or stacked. It stays $9 for the life of that subscription; say so on the pricing page.
- Show prices **tax-inclusive** in the UK and EU (the consumer norm). Set this in the dashboard and record it here.
- Every checkout is created with the Trakwyn user id as metadata; the webhook maps events back to a user with it.

## 3. Webhook

Endpoint: `https://<api origin>/billing/webhook`. Subscribe to the events that map onto `BillingWebhookEvent` (`apps/api/src/domain/billing/Billing.ts`): a subscription becoming active, a one-off order paid, a subscription cancelled or revoked, and an order refunded or disputed. The signature is verified over the raw body; the secret goes in Secret Manager next to the other API secrets (`infra/gcp`, `load-secrets.sh`) when the adapter lands.

## 4. Refund policy

14 days, no questions asked, for the monthly plan and the passes (matches the EU and UK cooling-off period for digital content). A refund downgrades the user immediately. Wording used on the Plan page: "Not happy? Email us within 14 days for a full refund. Cancelling stops renewal and you keep Pro until the end of the period you paid for."

## 5. Launch

1. Test end to end in the sandbox: each of the four purchases, cancel in the portal, a refund, a replayed event, a bad signature.
2. Set `BILLING_PROVIDER` and, if users signed up before launch, `BILLING_LIVE_FROM` (the day billing goes live) on the API.
3. Switch the provider to live and repeat one purchase and one refund with a real card.
4. Set `PLANS_ENFORCED=true`, then `pnpm --filter @trakwyn/api plan grant-trial`.

## Open questions for an accountant

1. Do merchant-of-record payouts count as taxable turnover towards the UK VAT registration threshold?
2. How should the provider's fee and the income be recorded for self-assessment?
