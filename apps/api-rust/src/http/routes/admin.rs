//! The `/admin/*` job routes and the public VAPID key, as one router.

use std::sync::Arc;

use axum::Router;

use super::{digest, push_notifications, reminders, trash_purge};
use crate::http::container::Container;

pub fn router<S>(container: Arc<Container>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .merge(digest::router())
        .merge(push_notifications::router())
        .merge(reminders::router())
        .merge(trash_purge::router())
        .with_state(container)
}
