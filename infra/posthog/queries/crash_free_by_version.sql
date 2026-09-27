WITH sessions AS (
    SELECT
        $session_id AS session_id,
        any(person_id) AS person_id,
        argMin(properties.$app_version, timestamp) AS app_version,
        min(timestamp) AS started_at,
        countIf(event = '$exception' AND properties.$exception_level = 'fatal') > 0 AS crashed
    FROM events
    WHERE timestamp >= now() - INTERVAL 30 DAY
        AND properties.$lib IN ('posthog-react-native', 'posthog-ios', 'posthog-android')
        AND notEmpty($session_id)
    GROUP BY session_id
)
SELECT
    app_version,
    min(started_at) AS first_seen,
    count() AS sessions,
    countIf(crashed) AS crashed_sessions,
    round(100 * (1 - countIf(crashed) / count()), 2) AS crash_free_sessions_pct,
    uniq(person_id) AS users,
    uniqIf(person_id, crashed) AS crashed_users,
    round(100 * (1 - uniqIf(person_id, crashed) / uniq(person_id)), 2) AS crash_free_users_pct
FROM sessions
GROUP BY app_version
ORDER BY first_seen DESC
LIMIT 50
