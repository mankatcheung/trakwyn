# Polar (payment provider)

Polar is the merchant of record for Pro (JEF-426): it is the legal seller, collects and files VAT and sales tax, and handles chargebacks. There is no Terraform here; it is set up by hand in Polar's dashboard, and this file is the record of what to set.

The API side is behind `IBillingProvider` (`apps/api/src/use-cases/ports/`). The **fake** adapter serves dev, CI and e2e (`BILLING_PROVIDER=fake`, no credentials), so none of this is needed there. `PolarBillingProvider` (JEF-432) is selected by `BILLING_PROVIDER=polar` and needs every setting in section 2. Polar has been confirmed in section 1, so the provider is Polar and not Paddle.

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
- Every checkout is created with the Trakwyn user id as the external customer id and as `metadata.userId`; the webhook maps events back to a user with it.
- **A pass is a one-off product, and Polar gives it no duration.** Trakwyn works out the expiry itself from the order, using the months of the product id below. Never describe a pass as expiring in Polar.
- **Prices are per environment.** The sandbox and production have separate products, tokens and webhook secrets. Nothing carries over.

### Creating the products from a file

`import-products.mjs` creates the products in a JSON file through Polar's API, so the sandbox and production are built from the same file. It needs only Node and an organization access token for the environment:

```bash
cd infra/polar
cp products.example.json products.json     # edit prices and names; products.json is yours
export POLAR_ACCESS_TOKEN=...              # the token for the environment below

node import-products.mjs products.json --server sandbox            # dry run: lists what it would create
node import-products.mjs products.json --server sandbox --apply    # creates them
```

It prints the `POLAR_PRODUCT_*=<id>` lines to paste into `apps/api/.env` or `plain_env`. Notes:

- **Dry run is the default, and `--server` has no default.** The token is read from the environment only and is never printed.
- **Re-running is safe.** A product that already exists (same `metadata.trakwyn_key`, else the same name; archived ones are skipped) is left alone, never updated. To change a price, edit the product in Polar, or archive it and re-run.
- **`prices` is sent to Polar exactly as written**, so any shape the API accepts works. `key` and `envVar` are ours: `key` is stored in the product's metadata, and `envVar` names the line printed for it. A pass has no `recurring_interval`, which makes it a one-off product.
- **The example is USD only.** Polar's docs do not show how to attach EUR and GBP prices through the API (they describe a default-currency price plus others enabled per product). Create the products with USD, then enable the other currencies in the dashboard; once you know the API shape, add those price objects to the file. Tax display (`tax_behavior`) is left to the organization default, which the docs say is tax-inclusive in the UK and EU. Confirm it on a sandbox checkout.
- Tests: `node --test infra/polar/import-products.test.mjs` (not run in CI).

### Settings

| Setting                         | Kind   | Where                                        |
| ------------------------------- | ------ | -------------------------------------------- |
| `BILLING_PROVIDER`              | plain  | `polar`                                      |
| `POLAR_SERVER`                  | plain  | `sandbox` or `production`; no default        |
| `POLAR_PRODUCT_MONTHLY`         | plain  | the Pro monthly product's id                 |
| `POLAR_PRODUCT_FOUNDER_MONTHLY` | plain  | the founder monthly product's id             |
| `POLAR_PRODUCT_PASS_3M`         | plain  | the 3-month pass product's id                |
| `POLAR_PRODUCT_PASS_6M`         | plain  | the 6-month pass product's id                |
| `POLAR_ACCESS_TOKEN`            | secret | an organization access token for that server |
| `POLAR_WEBHOOK_SECRET`          | secret | the `whsec_…` of that server's endpoint      |

Plain values go in `plain_env` in `infra/gcp/terraform.tfvars` (see the commented block in `terraform.tfvars.example`) and locally in `apps/api/.env`; the two secrets go in Secret Manager as `polar-access-token` and `polar-webhook-secret`. The adapter names every missing setting on first use.

## 3. Webhook

Endpoint: `https://<api origin>/billing/webhook`. In Polar, set the endpoint's format to **raw**, and subscribe to exactly these events (others are acknowledged and ignored, so extra ones are harmless but noisy):

| Polar event                                      | Trakwyn                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `subscription.active`, `subscription.uncanceled` | starts the plan (`uncanceled` clears the end date a cancellation set)                             |
| `subscription.canceled`                          | ends the plan at the end of the paid period                                                       |
| `subscription.revoked`                           | ends the plan at `ended_at`. Polar sends it when payment retries run out: a lapse, not a reversal |
| `order.paid`                                     | a one-off order is a pass; a subscription's orders (first or renewal) are ignored                 |
| `order.refunded`                                 | a full refund ends the plan now; a partial refund is ignored                                      |

`past_due` is deliberately not acted on: a subscriber keeps Pro while Polar retries the card (about 21 days) and loses it at `revoked`. Polar has no dispute event; the refunds page says a lost dispute shows up as a refund, which is **not confirmed** and is one of the things to check in the sandbox (JEF-433).

The signature is Standard Webhooks, verified over the raw body, with a five-minute tolerance. The adapter takes the secret as shown (`whsec_…`), which is right for secrets generated on or after 2026-09-08. A secret generated before that date is signed differently and fails here.

A delivery that is signed correctly but whose body the adapter cannot read answers 500 on purpose: Polar redelivers up to ten times and the log names the event. After ten failures in a row Polar **disables the endpoint**, so a burst of 500s on `/billing/webhook` needs attention the same day.

### Deploying the secrets

The two Polar secrets are in `secret_env_vars`, and Cloud Run will not start a revision that references a secret with no version. So **before the next `terraform apply` in `infra/gcp`, load both** (sandbox values are fine while billing is off), then run `./load-secrets.sh <env-file> --apply`. Until then the dry run reports them as missing and exits non-zero. The plain settings can wait: with `BILLING_PROVIDER` unset in production the three billing paths fail closed on first use.

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
