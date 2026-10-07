use std::future::Future;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tokio::time::Instant;

use super::constants::{CIRCUIT_COOLDOWN, CIRCUIT_FAILURE_THRESHOLD};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

impl CircuitState {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Closed => "closed",
            Self::Open => "open",
            Self::HalfOpen => "half-open",
        }
    }
}

/// What `execute` fails with.
#[derive(Debug, thiserror::Error)]
pub enum BreakerError<E> {
    /// The breaker is open: the wrapped call never ran.
    #[error("Circuit breaker is open")]
    Open,
    /// The wrapped call ran and failed.
    #[error(transparent)]
    Inner(E),
}

impl<E> BreakerError<E> {
    pub fn is_open(&self) -> bool {
        matches!(self, Self::Open)
    }
}

/// Called on every state transition, with the state left and the one entered.
pub type StateChangeListener = Box<dyn Fn(CircuitState, CircuitState) + Send + Sync>;

struct Inner {
    state: CircuitState,
    consecutive_failures: u32,
    opened_at: Option<Instant>,
}

/// Generic closed → open → half-open circuit breaker. Not Redis-specific: it
/// wraps any async operation, failing fast (without calling the operation at
/// all) once it has decided the dependency is unhealthy, rather than making
/// every caller wait out a slow timeout individually.
///
/// State is intentionally process-local: each instance tracks its own view of
/// "is my connection to the dependency healthy". There is no way to
/// coordinate this through the dependency itself: using Redis to track "is
/// Redis down" would be circular.
pub struct CircuitBreaker {
    inner: Mutex<Inner>,
    failure_threshold: u32,
    cooldown: Duration,
    on_state_change: Option<StateChangeListener>,
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new(CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_COOLDOWN)
    }
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, cooldown: Duration) -> Self {
        Self {
            inner: Mutex::new(Inner {
                state: CircuitState::Closed,
                consecutive_failures: 0,
                opened_at: None,
            }),
            failure_threshold,
            cooldown,
            on_state_change: None,
        }
    }

    /// Test and observability hook: fires on every state transition.
    pub fn on_state_change(mut self, listener: StateChangeListener) -> Self {
        self.on_state_change = Some(listener);
        self
    }

    pub fn state(&self) -> CircuitState {
        self.lock().state
    }

    pub async fn execute<T, E, F, Fut>(&self, operation: F) -> Result<T, BreakerError<E>>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, E>>,
    {
        self.admit()?;

        match operation().await {
            Ok(value) => {
                self.on_success();
                Ok(value)
            }
            Err(err) => {
                self.on_failure();
                Err(BreakerError::Inner(err))
            }
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // A poisoned lock means a listener panicked; the counters are still
        // valid, and a breaker that panics in turn would take its caller's
        // fail-open path away.
        self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Refuses the call while the breaker is open and cooling down; lets one
    /// trial through once the cooldown has elapsed.
    fn admit<E>(&self) -> Result<(), BreakerError<E>> {
        let transition = {
            let mut inner = self.lock();
            if inner.state != CircuitState::Open {
                return Ok(());
            }
            let cooling_down =
                inner.opened_at.is_some_and(|opened_at| opened_at.elapsed() < self.cooldown);
            if cooling_down {
                return Err(BreakerError::Open);
            }
            Self::transition(&mut inner, CircuitState::HalfOpen)
        };
        self.notify(transition);
        Ok(())
    }

    fn on_success(&self) {
        let transition = {
            let mut inner = self.lock();
            inner.consecutive_failures = 0;
            Self::transition(&mut inner, CircuitState::Closed)
        };
        self.notify(transition);
    }

    fn on_failure(&self) {
        let transition = {
            let mut inner = self.lock();
            inner.consecutive_failures = inner.consecutive_failures.saturating_add(1);
            // A half-open trial gets exactly one chance: any failure reopens
            // immediately rather than counting toward the full threshold again.
            if inner.state == CircuitState::HalfOpen
                || inner.consecutive_failures >= self.failure_threshold
            {
                inner.opened_at = Some(Instant::now());
                Self::transition(&mut inner, CircuitState::Open)
            } else {
                None
            }
        };
        self.notify(transition);
    }

    fn transition(inner: &mut Inner, to: CircuitState) -> Option<(CircuitState, CircuitState)> {
        if inner.state == to {
            return None;
        }
        let from = inner.state;
        inner.state = to;
        Some((from, to))
    }

    /// Runs the listener after the lock is released, so it may log or record
    /// without holding up another caller.
    fn notify(&self, transition: Option<(CircuitState, CircuitState)>) {
        if let (Some((from, to)), Some(listener)) = (transition, &self.on_state_change) {
            listener(from, to);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use super::*;

    type Transitions = Arc<Mutex<Vec<(CircuitState, CircuitState)>>>;

    fn make_breaker(failure_threshold: u32, cooldown_ms: u64) -> (CircuitBreaker, Transitions) {
        let transitions: Transitions = Arc::default();
        let seen = Arc::clone(&transitions);
        let breaker = CircuitBreaker::new(failure_threshold, Duration::from_millis(cooldown_ms))
            .on_state_change(Box::new(move |from, to| seen.lock().unwrap().push((from, to))));
        (breaker, transitions)
    }

    async fn fail(breaker: &CircuitBreaker, message: &'static str) -> BreakerError<&'static str> {
        breaker.execute(|| async { Err::<(), _>(message) }).await.unwrap_err()
    }

    async fn succeed(
        breaker: &CircuitBreaker,
        value: &'static str,
    ) -> Result<&'static str, BreakerError<&'static str>> {
        breaker.execute(|| async move { Ok(value) }).await
    }

    async fn advance(ms: u64) {
        tokio::time::advance(Duration::from_millis(ms)).await;
    }

    #[tokio::test(start_paused = true)]
    async fn starts_closed_and_returns_the_result_of_a_successful_call() {
        let (breaker, _) = make_breaker(3, 1000);
        assert_eq!(succeed(&breaker, "ok").await.unwrap(), "ok");
        assert_eq!(breaker.state(), CircuitState::Closed);
    }

    #[tokio::test(start_paused = true)]
    async fn stays_closed_across_repeated_successes() {
        let (breaker, transitions) = make_breaker(3, 1000);
        for _ in 0..10 {
            succeed(&breaker, "ok").await.unwrap();
        }
        assert!(transitions.lock().unwrap().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn propagates_the_real_error_on_each_failure_while_still_closed() {
        let (breaker, _) = make_breaker(3, 1000);
        assert!(matches!(fail(&breaker, "boom").await, BreakerError::Inner("boom")));
        assert!(matches!(fail(&breaker, "boom").await, BreakerError::Inner("boom")));
        assert_eq!(breaker.state(), CircuitState::Closed);
    }

    #[tokio::test(start_paused = true)]
    async fn opens_after_reaching_the_failure_threshold_and_short_circuits_without_calling() {
        let (breaker, transitions) = make_breaker(3, 1000);
        let calls = AtomicUsize::new(0);
        let failing = || async {
            calls.fetch_add(1, Ordering::SeqCst);
            Err::<(), _>("boom")
        };

        for _ in 0..3 {
            let err = breaker.execute(failing).await.unwrap_err();
            assert!(matches!(err, BreakerError::Inner("boom")));
        }
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(*transitions.lock().unwrap(), vec![(CircuitState::Closed, CircuitState::Open)]);

        let err = breaker.execute(failing).await.unwrap_err();
        assert!(err.is_open());
        assert_eq!(err.to_string(), "Circuit breaker is open");
        assert_eq!(calls.load(Ordering::SeqCst), 3); // not called a 4th time
    }

    #[tokio::test(start_paused = true)]
    async fn stays_open_until_the_cooldown_elapses() {
        let (breaker, _) = make_breaker(1, 1000);
        fail(&breaker, "boom").await;

        advance(999).await;
        assert!(succeed(&breaker, "ok").await.unwrap_err().is_open());
    }

    #[tokio::test(start_paused = true)]
    async fn allows_one_half_open_trial_after_the_cooldown_and_closes_on_success() {
        let (breaker, transitions) = make_breaker(1, 1000);
        fail(&breaker, "boom").await;

        advance(1000).await;
        assert_eq!(succeed(&breaker, "recovered").await.unwrap(), "recovered");

        assert_eq!(
            *transitions.lock().unwrap(),
            vec![
                (CircuitState::Closed, CircuitState::Open),
                (CircuitState::Open, CircuitState::HalfOpen),
                (CircuitState::HalfOpen, CircuitState::Closed),
            ]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn reopens_immediately_if_the_half_open_trial_fails() {
        let (breaker, transitions) = make_breaker(3, 1000);
        for _ in 0..3 {
            fail(&breaker, "boom").await; // the third opens it
        }

        advance(1000).await;
        // The half-open trial fails: one failure is enough, not three more.
        assert!(matches!(fail(&breaker, "boom").await, BreakerError::Inner("boom")));
        assert_eq!(
            transitions.lock().unwrap().last(),
            Some(&(CircuitState::HalfOpen, CircuitState::Open))
        );

        // Back in the open state at once: no further calls until a fresh cooldown.
        assert!(fail(&breaker, "boom").await.is_open());
    }

    #[tokio::test(start_paused = true)]
    async fn resets_the_cooldown_timer_on_a_half_open_trial_failure() {
        let (breaker, _) = make_breaker(1, 1000);
        fail(&breaker, "boom").await;

        advance(1000).await;
        assert!(matches!(fail(&breaker, "still down").await, BreakerError::Inner("still down")));

        // Only 500ms into the *new* cooldown: still open.
        advance(500).await;
        assert!(succeed(&breaker, "ok").await.unwrap_err().is_open());

        advance(500).await;
        assert_eq!(succeed(&breaker, "ok").await.unwrap(), "ok");
    }

    #[tokio::test(start_paused = true)]
    async fn resets_the_consecutive_failure_count_on_any_success() {
        let (breaker, _) = make_breaker(3, 1000);
        fail(&breaker, "boom").await;
        fail(&breaker, "boom").await;
        succeed(&breaker, "ok").await.unwrap(); // resets the streak

        // Only 2 consecutive failures since the reset: still closed, still called.
        assert!(matches!(fail(&breaker, "boom").await, BreakerError::Inner("boom")));
        assert!(matches!(fail(&breaker, "boom").await, BreakerError::Inner("boom")));
        assert_eq!(breaker.state(), CircuitState::Closed);
    }

    #[test]
    fn defaults_to_five_failures_and_a_thirty_second_cooldown() {
        let breaker = CircuitBreaker::default();
        assert_eq!(breaker.failure_threshold, 5);
        assert_eq!(breaker.cooldown, Duration::from_secs(30));
    }

    #[test]
    fn spells_the_states_as_the_metric_attributes_do() {
        assert_eq!(CircuitState::Closed.as_str(), "closed");
        assert_eq!(CircuitState::Open.as_str(), "open");
        assert_eq!(CircuitState::HalfOpen.as_str(), "half-open");
    }
}
