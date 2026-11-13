-- Tool calls over 7 days by tool and outcome, from the $ai_span events the
-- MCP and chat tool paths send. `unknown` is a call outside the catalogue.
SELECT
    properties.$ai_span_name AS tool,
    properties.outcome AS outcome,
    count() AS calls,
    round(quantile(0.95)(toFloat(properties.$ai_latency)), 2) AS p95_latency_s
FROM events
WHERE event = '$ai_span'
    AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY tool, outcome
ORDER BY calls DESC
LIMIT 100
