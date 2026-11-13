-- Down-vote share by feature, model and prompt version over 7 days. A rating
-- taken back is `ai_output_rating_cleared` with the same properties, so it is
-- subtracted: what is left is the ratings that stand.
SELECT
    properties.feature AS feature,
    properties.$ai_model AS model,
    properties.prompt_version AS prompt_version,
    countIf(event = '$ai_feedback' AND properties.rating = 'down')
        - countIf(event = 'ai_output_rating_cleared' AND properties.rating = 'down') AS downs,
    countIf(event = '$ai_feedback') - countIf(event = 'ai_output_rating_cleared') AS ratings,
    round(100 * downs / nullIf(ratings, 0), 2) AS downvote_share_pct
FROM events
WHERE event IN ('$ai_feedback', 'ai_output_rating_cleared')
    AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY feature, model, prompt_version
HAVING ratings > 0
ORDER BY downs DESC
LIMIT 100
