-- Spend per user over 30 days, by the hosted model tier. `tier` is the only
-- plan-like property the API sends (absent on a user's own key, so those
-- calls, which cost Trakwyn nothing, read as 'own key'). distinct_id is the
-- pseudonymous user hash.
WITH users AS (
    SELECT
        if(notEmpty(properties.tier), properties.tier, 'own key') AS tier,
        distinct_id,
        sum(toFloat(properties.$ai_total_cost_usd)) AS cost_usd
    FROM events
    WHERE event = '$ai_generation'
        AND timestamp >= now() - INTERVAL 30 DAY
    GROUP BY tier, distinct_id
)
SELECT
    tier,
    count() AS users,
    round(quantile(0.5)(cost_usd), 4) AS p50_usd,
    round(quantile(0.95)(cost_usd), 4) AS p95_usd,
    round(max(cost_usd), 4) AS max_usd,
    round(sum(cost_usd), 2) AS total_usd
FROM users
GROUP BY tier
ORDER BY total_usd DESC
LIMIT 20
