-- Error share over 7 days. `source` is who paid: platform (Trakwyn AI) or
-- byok (the user's own key). error_kind is blank for an aborted call.
SELECT
    properties.feature AS feature,
    properties.source AS source,
    ifNull(nullIf(toString(properties.error_kind), ''), 'none') AS error_kind,
    count() AS calls,
    round(100 * count() / sum(count()) OVER (PARTITION BY feature, source), 2) AS share_of_feature_source_pct
FROM events
WHERE event = '$ai_generation'
    AND timestamp >= now() - INTERVAL 7 DAY
    AND properties.outcome = 'error'
GROUP BY feature, source, error_kind
ORDER BY calls DESC
LIMIT 100
