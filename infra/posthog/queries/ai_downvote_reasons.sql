-- Why people down-voted, by feature, over 30 days, net of cleared ratings.
SELECT
    properties.feature AS feature,
    ifNull(nullIf(toString(properties.reason), ''), 'no reason') AS reason,
    countIf(event = '$ai_feedback') - countIf(event = 'ai_output_rating_cleared') AS downs
FROM events
WHERE event IN ('$ai_feedback', 'ai_output_rating_cleared')
    AND properties.rating = 'down'
    AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY feature, reason
HAVING downs > 0
ORDER BY downs DESC
LIMIT 100
