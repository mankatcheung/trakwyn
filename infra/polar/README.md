# Polar (payment provider)

Polar is the merchant of record for Pro (JEF-426): it is the legal seller, collects and files VAT and sales tax, and handles chargebacks. There is no Terraform here; it is set up by hand in Polar's dashboard, and this file is the record of what to set.

The API side is behind `IBillingProvider` (`apps/api/src/use-cases/ports/`). The **fake** adapter serves dev, CI and e2e (`BILLING_PROVIDER=fake`, no credentials), so none of this is needed there. `PolarBillingProvider` (JEF-432) is selected by `BILLING_PROVIDER=polar` and needs every setting in section 2. Polar has been confirmed in section 1, so the provider is Polar and not Paddle.

## 1. Confirm before building the adapter

- [x] Polar accepts Trakwyn (domain review) and a UK sole trader. The account was opened on 2026-10-24. The first product description, which led with "job search tracker for individual job seekers", was flagged as an unsupported use case (job boards and resume or hiring tools); the account opened after the description was reworded to say what the software does. Trakwyn has no job listings and no employer side. Polar may review the live site later, so keep the public wording accurate.
- [x] Payouts: the Wise Business GBP account (UK account details) is linked as the payout account and the payout currency is **GBP**. Polar's payout accounts need a bank account in the business's country and currency, so USD, EUR and HKD Wise balances cannot be used. Every price is in USD (section 2), so Polar holds the balance in USD and the payout converts it to GBP, so there is nothing to convert by hand. Withdrawals are manual. Fees (Polar's fees page, which names them as Stripe's, with no Polar markup): $2 per month with an active payout, 0.25% + $0.25 per payout, and a cross-border (currency conversion) fee of 0.25% (EU) to 1% (other countries), which presumably includes the UK. No minimum payout is stated there. Withdraw in larger, less frequent amounts to keep the fixed costs small.
- [x] The sandbox covers **both** subscriptions and one-off purchases.
- [x] Polar's own refund terms and dispute handling against our policy below. Checked against the current terms (<https://polar.sh/legal/terms>) and found compatible with the 14-day, no-questions policy. From the docs: sellers can refund in full or in part, with no window or reason required; the processing fee is not returned on a refund (about 5% + $0.50 on the Starter plan); Polar can also refund up to 60 days after purchase to prevent chargebacks, so a refund can arrive after our 14 days and the webhook must map it to a reversal; a dispute costs $15 whatever the outcome, and buyers can file a chargeback for up to 120 days. Polar aims to keep the chargeback rate under 0.4% and escalates through refunds, held payouts and a blocked account if it climbs. No clause was found that obliges a seller to honour their own refund policy.

## 2. Products and prices

Create these in the sandbox first, then again in live. The IDs go in the API's environment when the adapter lands.

| Product              | Type                  | Price |
| -------------------- | --------------------- | ----- |
| Pro monthly          | Subscription, monthly | $12   |
| Pro monthly, founder | Subscription, monthly | $9    |
| Pro 3-month pass     | One-off               | $29   |
| Pro 6-month pass     | One-off               | $49   |

**USD only at launch, worldwide.** There are no EUR or GBP prices. One price list keeps the checkout simple, and it avoids a GBP to USD to GBP round trip on every local-currency sale (Polar converts each sale to USD for the balance, and the payout converts to GBP, so a local price pays two conversions). A buyer whose card is not in USD is converted by their own bank. Local currencies can be added later per product in the dashboard; decide the prices on purpose then (a tax-inclusive UK or EU price is higher than a plain conversion), and reword the pricing page so it does not show "$12" next to a different checkout price.

- The founder price is a **separate product**, not a discount code. The API picks it for users inside 60 days of signup (or of `BILLING_LIVE_FROM`, for earlier users), so it cannot be shared or stacked. It stays $9 for the life of that subscription; say so on the pricing page.
- The $ price is **tax-inclusive** for UK and EU buyers (the consumer norm, and the organization default there), so a UK $9 sale shows $1.50 of VAT and leaves $7.50. Elsewhere, such as the US, tax is normally added on top of the price. Polar, as merchant of record, collects and files all of it; nothing is registered or filed by us for it. Confirm the tax behaviour per country with a sandbox checkout (billing country UK, US and Hong Kong; Hong Kong has no VAT or sales tax) and record it here.
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
- **The example is USD only, and that is the launch design.** Nothing more is needed in the dashboard. If local currencies are added later, Polar's docs do not show how to attach them through the API (they describe a default-currency price plus others enabled per product), so enable them in the dashboard and add the price objects to the file once the API shape is known. Tax display (`tax_behavior`) is left to the organization default, which the docs say is tax-inclusive in the UK and EU. Confirm it on a sandbox checkout.
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

`past_due` is deliberately not acted on: a subscriber keeps Pro while Polar retries the card (about 21 days) and loses it at `revoked`. Polar has no dispute event, and an escalated dispute reaches us as nothing at all (see "Disputes" in section 4).

### Creating the endpoint from a script

`create-webhook-endpoint.mjs` registers the endpoint with exactly the events above, as `raw` payloads on API version `2026-10` (the shape the mapper's tests are written for). The token needs `webhooks:write`.

```bash
export POLAR_ACCESS_TOKEN=...              # the token for the environment below
node create-webhook-endpoint.mjs https://<api origin>/billing/webhook --server sandbox            # dry run
node create-webhook-endpoint.mjs https://<api origin>/billing/webhook --server sandbox --apply    # creates it
```

- The URL must be public https: Polar cannot reach localhost, so for local testing start a tunnel (`cloudflared tunnel --url http://localhost:3001`) and use its URL.
- A new endpoint's `whsec_…` secret is printed **once**, as the `POLAR_WEBHOOK_SECRET=` line. It is a credential: put it in `apps/api/.env`, or in Secret Manager as `polar-webhook-secret` for production.
- An endpoint already registered for that URL is left alone and its secret is not printed (find it in the Polar dashboard). The script warns if that endpoint is missing events, is not `raw`, or is disabled. Fix those in the dashboard.
- If Polar reports that the endpoint uses the old signing scheme, the script says so: the API's verifier would reject every delivery, so create the endpoint again.
- A tunnel URL changes each run; create a new endpoint for the new URL, and delete old ones in the dashboard (Polar disables an endpoint after ten failed deliveries in a row).
- Tests: `node --test infra/polar/create-webhook-endpoint.test.mjs` (not run in CI).

The signature is Standard Webhooks, verified over the raw body, with a five-minute tolerance. The adapter takes the secret as shown (`whsec_…`), which is right for secrets generated on or after 2026-09-08. A secret generated before that date is signed differently and fails here.

A delivery that is signed correctly but whose body the adapter cannot read answers 500 on purpose: Polar redelivers up to ten times and the log names the event. After ten failures in a row Polar **disables the endpoint**, so a burst of 500s on `/billing/webhook` needs attention the same day.

### Token scopes

Use a separate token for setup and for the running API, so the one on the server cannot touch products or webhooks.

| Token                          | Scopes                                                                                                                     | Used by                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Setup (delete when done)       | `products:read`, `products:write`, `webhooks:write`                                                                        | `import-products.mjs`, `create-webhook-endpoint.mjs` |
| Runtime (`POLAR_ACCESS_TOKEN`) | `checkouts:write`, `customer_sessions:write`, and `subscriptions:write` once the API revokes on account deletion (JEF-439) | the API                                              |

Polar's docs state `products:*`, `webhooks:write` and `subscriptions:write` on the reference pages; the checkout and customer-session scope names are not printed there, so take their spelling from the token screen. A 403 from Polar on a checkout or portal call usually means a scope is missing.

### Deploying the secrets (this order)

Terraform creates the empty secret containers, and values are added out of band (`infra/gcp/secrets.tf`). Cloud Run will not start a revision that references a secret with no version. So for a new Polar secret:

1. **Create the containers only**, with a targeted apply. This changes no running service:
   ```bash
   cd infra/gcp
   terraform apply \
     -target='google_secret_manager_secret.api["POLAR_ACCESS_TOKEN"]' \
     -target='google_secret_manager_secret.api["POLAR_WEBHOOK_SECRET"]' \
     -target='google_secret_manager_secret_iam_member.api_runtime["POLAR_ACCESS_TOKEN"]' \
     -target='google_secret_manager_secret_iam_member.api_runtime["POLAR_WEBHOOK_SECRET"]'
   ```
2. **Add a version to each by hand**, with the value hidden:
   ```bash
   read -rs V; printf '%s' "$V" | gcloud secrets versions add polar-access-token --data-file=-
   read -rs V; printf '%s' "$V" | gcloud secrets versions add polar-webhook-secret --data-file=-
   unset V
   ```
3. **Then** set the plain settings in `plain_env` (`BILLING_PROVIDER`, `POLAR_SERVER`, the four `POLAR_PRODUCT_*`), run `terraform plan` (only the Cloud Run service's env should change) and `terraform apply`.

**Do not use `load-secrets.sh` for these.** It cannot reach a secret that does not exist yet ("NO SECRET"), and `--apply` uploads a new version of _every_ secret it finds in its env file, which changes `latest` for secrets that work today (a different JWT secret signs everyone out). To replace sandbox values with live ones, add new versions with the same `gcloud` command, then roll out a new revision (Cloud Run reads `latest`, but running instances keep their old value).

### Switching an environment on, and off again

`createCheckoutSession` does not check `PLANS_ENFORCED`; only the Buy buttons are hidden by it. While `BILLING_PROVIDER=polar` is set on production, **any signed-in user could call the mutation by hand and, with sandbox credentials, pay with a test card and get Pro for free**. So a sandbox test against production (JEF-433) is done in one sitting and reverted:

1. Revoke every sandbox subscription **immediately** (see section 4), then delete the sandbox webhook endpoint (it points at production; with the provider off the route answers 500 and Polar would disable it after ten failures).
2. Remove the six plain settings from `plain_env` in `terraform.tfvars` and apply. The two secrets and their mounts can stay.
3. Check: `/health` is 200, an unsigned `POST /billing/webhook` is **500** (no provider), and `createCheckoutSession` returns an error with no URL.
4. Delete the throwaway accounts. Late events for a deleted user are recorded in `BillingEvent` with an empty `userId` and ignored; they hold no personal data and can be deleted.

### What the sandbox run (JEF-433) showed

- **Sandbox cards:** `4242 4242 4242 4242` pays; `4000 0000 0000 0259` pays and then raises a dispute. Use a UK or EU billing country to see VAT: a UK price is tax-inclusive, so $9 shows $1.50 of VAT (20/120 of the price).
- **Receipts:** the sandbox sends customer emails only to members of the sandbox organisation; sub-addresses such as `you+e2e1@example.com` of a member are accepted.
- **Email domains must resolve.** Polar rejects a `customer_email` whose domain does not exist (the seeded demo user `demo@trakwyn.app` cannot check out). Use an account with a real address.
- **The Buy buttons are hidden while enforcement is off**, so call the mutations with an API token: `createCheckoutSession(plan: monthly | pass3Months | pass6Months)` and `createBillingPortalSession`.
- **The user row is cached for five minutes**, and direct SQL changes bypass the cache. Wait five minutes after changing a row by hand before testing.
- **A renewal cannot be triggered in the sandbox.** It is covered by the mapper's unit tests (an order with a subscription id is `ignored`, whatever its `billing_reason`); the first order of a subscription takes the same branch.

## 4. Refund policy

14 days, no questions asked, for the monthly plan and the passes (matches the EU and UK cooling-off period for digital content). A refund downgrades the user immediately. Wording used on the Plan page: "Not happy? Email us within 14 days for a full refund. Cancelling stops renewal and you keep Pro until the end of the period you paid for."

### Refunding a customer

1. In the Polar dashboard, refund the order **in full**. A partial refund is ignored by the API and leaves the plan alone; an order refunded in full downgrades the user immediately.
2. If the order was a subscription's, **revoke the subscription immediately** in the same sitting. Refunding an order does **not** end a Polar subscription. Left active, it keeps renewing (the customer is charged and, because renewals are ignored, stays on Free) and it blocks them from subscribing again ("You already have an active subscription"). Cancelling at period end is _not_ enough: that leaves the subscription active until the date.
3. Passes are one-off, so a pass refund needs no second step.

Refunding an older pass while the customer is on a subscription changes nothing, by design.

### Disputes

Polar handles a chargeback itself as merchant of record. It sends **no webhook and has no endpoint** for an escalated dispute (statuses `needs_response`, `under_review`, `lost`, `won`): in the sandbox a dispute raised on a pass stayed at "needs response" and nothing reached the API, so the user stayed on Pro. Only a refund that Polar issues to _prevent_ a dispute carries a dispute marker, and that arrives as `order.refunded`, which is handled.

So disputes are handled by hand:

- Watch Polar's dispute notifications and its dashboard.
- To downgrade the user, run against the production database: `pnpm --filter @trakwyn/api plan set --email <email> --plan free`.
- Each dispute costs $15 whatever the outcome (Polar's fees page). Polar aims to keep the chargeback rate under 0.4% and escalates through refunds, held payouts and a blocked account if it climbs. The 14-day refund is the main mitigation: easy to ask for, so a customer is less likely to go to their bank.
- Open question for Polar support: is there a webhook or API for escalated disputes, and how long is a disputed amount held? If so, build detection as a follow-up.

## 5. Launch

The sandbox end-to-end run is done (JEF-433, results in that issue). What is left, in order:

1. JEF-431 (terms, privacy, pricing copy, accountant) and JEF-439 (revoke the subscription when an account is deleted) are finished.
2. Create the live products (`import-products.mjs --server production`), the live webhook endpoint and a live runtime token; add the live secrets as new versions of the same two Secret Manager secrets; set `POLAR_SERVER=production` and the live `POLAR_PRODUCT_*` ids; set `BILLING_PROVIDER=polar` and, if users signed up before launch, `BILLING_LIVE_FROM` (the day billing goes live). Enforcement stays off.
3. Repeat one purchase and one refund (and revoke the subscription) with a real card.
4. Set `PLANS_ENFORCED=true`, then `pnpm --filter @trakwyn/api plan grant-trial`.

## Open questions for an accountant

1. Do merchant-of-record payouts count as taxable turnover towards the UK VAT registration threshold?
2. How should the provider's fee and the income be recorded for self-assessment?
