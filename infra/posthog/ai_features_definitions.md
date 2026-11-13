**AI features** (JEF-570, managed in `infra/posthog`)

- **Events:** one `$ai_generation` per LLM call (each failover leg counts), one `$ai_span` per tool call, `$ai_feedback` per rating and `ai_output_rating_cleared` when one is taken back. No prompt, reply or tool argument is ever sent. Users are a pseudonymous hash.
- **Source:** `platform` is Trakwyn AI, which Trakwyn pays for; `byok` is the user's own key. Cost on `byok` is priced from the same table for comparison only. `tier` is the hosted model tier; there is no billing-plan property.
- **Cost:** `$ai_total_cost_usd`, the figure behind Axiom's `trakwyn.llm.cost_micros`. An unpriced model has none.
- **Error share:** calls with `outcome = error` over all calls. An aborted call (the user left) is not an error.
- **Down-vote share:** down-votes ÷ ratings that stand, net of `ai_output_rating_cleared`.
- **Alerts:** down-vote share above the limit on any feature over 7 days (daily, reads 0 below the minimum ratings); own-key error share above the limit on any feature over 24 hours (hourly, reads 0 below the minimum calls).
