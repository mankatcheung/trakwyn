-- Latency in seconds over 7 days. Time to first token is sent by streams
-- only, so it is blank for a feature that never streams.
SELECT
    properties.feature AS feature,
    properties.$ai_model AS model,
    count() AS calls,
    round(quantile(0.5)(toFloat(properties.$ai_latency)), 2) AS p50_latency_s,
    round(quantile(0.95)(toFloat(properties.$ai_latency)), 2) AS p95_latency_s,
    round(quantileIf(0.95)(toFloat(properties.$ai_time_to_first_token), notEmpty(properties.$ai_time_to_first_token)), 2) AS p95_ttft_s
FROM events
WHERE event = '$ai_generation'
    AND timestamp >= now() - INTERVAL 7 DAY
    AND properties.outcome = 'ok'
GROUP BY feature, model
ORDER BY calls DESC
LIMIT 100
