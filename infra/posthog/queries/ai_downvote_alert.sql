-- One row per feature, for the alert (`any_row`): the 7-day down-vote share
-- of the ratings that stand, or 0 below the minimum number of ratings so a
-- feature with five ratings and two down-votes does not alert. The 20 is
-- var.ai_downvote_alert_min_ratings, substituted by Terraform.
SELECT
    properties.feature AS feature,
    countIf(event = '$ai_feedback') - countIf(event = 'ai_output_rating_cleared') AS ratings,
    if(ratings < ${min_ratings}, 0, round(100 * (countIf(event = '$ai_feedback' AND properties.rating = 'down') - countIf(event = 'ai_output_rating_cleared' AND properties.rating = 'down')) / ratings, 2)) AS downvote_share_pct
FROM events
WHERE event IN ('$ai_feedback', 'ai_output_rating_cleared')
    AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY feature
ORDER BY downvote_share_pct DESC
LIMIT 50
