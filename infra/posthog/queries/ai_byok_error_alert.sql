-- One row per feature, for the alert (`any_row`): the share of calls on a
-- user's own key that failed in the last 24 hours, or 0 below the minimum
-- number of calls. The 20 is var.ai_byok_error_alert_min_calls, substituted
-- by Terraform. Aborted calls (the user left) are not errors.
SELECT
    properties.feature AS feature,
    count() AS calls,
    if(calls < ${min_calls}, 0, round(100 * countIf(properties.outcome = 'error') / calls, 2)) AS error_share_pct
FROM events
WHERE event = '$ai_generation'
    AND properties.source = 'byok'
    AND timestamp >= now() - INTERVAL 1 DAY
GROUP BY feature
ORDER BY error_share_pct DESC
LIMIT 50
