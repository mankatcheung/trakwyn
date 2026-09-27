WITH
    versions AS (
        SELECT
            properties.$app_version AS app_version,
            min(timestamp) AS first_seen
        FROM events
        WHERE timestamp >= now() - INTERVAL 90 DAY
            AND properties.$lib IN ('posthog-react-native', 'posthog-ios', 'posthog-android')
            AND properties.$app_version IS NOT NULL
        GROUP BY app_version
    ),
    ranked AS (
        SELECT
            app_version,
            row_number() OVER (ORDER BY first_seen DESC) AS version_rank
        FROM versions
    )
SELECT
    e.properties.$exception_issue_id AS issue_id,
    any(e.properties.$exception_types) AS exception_types,
    any(e.properties.$exception_values) AS exception_values,
    maxIf(r.app_version, r.version_rank = 1) AS latest_version,
    uniqIf(e.$session_id, r.version_rank = 1) AS latest_sessions,
    countIf(r.version_rank = 1 AND e.properties.$exception_level = 'fatal') AS latest_fatal,
    maxIf(r.app_version, r.version_rank = 2) AS previous_version,
    uniqIf(e.$session_id, r.version_rank = 2) AS previous_sessions,
    countIf(r.version_rank = 2 AND e.properties.$exception_level = 'fatal') AS previous_fatal
FROM events AS e
INNER JOIN ranked AS r ON e.properties.$app_version = r.app_version
WHERE e.event = '$exception'
    AND e.timestamp >= now() - INTERVAL 90 DAY
    AND e.properties.$lib IN ('posthog-react-native', 'posthog-ios', 'posthog-android')
    AND r.version_rank <= 2
GROUP BY issue_id
ORDER BY latest_sessions DESC, previous_sessions DESC
LIMIT 25
