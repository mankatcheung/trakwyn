**Mobile release health** (JEF-368, managed in `infra/posthog`)

- **Session:** a mobile `$session_id`. The React Native SDK starts a new one on every cold start, after 30 minutes without an event, or after 24 hours, whether or not replay is on. So a session is roughly one run of the app.
- **Crash:** an `$exception` with `$exception_level = 'fatal'`: an uncaught JS error React Native marks fatal, or a native iOS/Android crash, which is sent on the next launch. Handled errors and unhandled promise rejections are not crashes.
- **Crashed session / user:** a session with at least one crash; a person (`person_id`) with at least one crashed session in that version or release.
- **Crash-free %:** 100 × (1 − crashed ÷ all), over the last 30 days, mobile events only (`$lib`).
- **Release:** the commit SHA from JEF-362. Native crash events do not carry it, so a session takes it from its other events. `unknown` means no event in the session had one.
- **Alert:** daily, on the crashed-session rate, which reads 0 below the minimum session count.
