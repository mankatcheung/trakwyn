-- The ten pseudonymous ids that cost the most over 30 days. The id is the
-- same 16-hex hash the AI gateway sends as `user`, so a row can be matched to
-- a user there and nowhere else.
SELECT
    distinct_id AS user_hash,
    round(sum(toFloat(properties.$ai_total_cost_usd)), 4) AS cost_usd,
    count() AS calls,
    topK(3)(properties.feature) AS top_features
FROM events
WHERE event = '$ai_generation'
    AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY distinct_id
ORDER BY cost_usd DESC
LIMIT 10
