//! What every resolver module needs: the container, the signed-in user and
//! the timestamp format.

use std::sync::Arc;

use async_graphql::Context;
use chrono::{DateTime, SecondsFormat, Utc};

use crate::http::container::Container;
use crate::http::errors::unauthorized;
use crate::http::request_context::RequestContext;
use crate::use_cases::auth::AuthenticatedUser;

pub fn container<'a>(ctx: &Context<'a>) -> &'a Arc<Container> {
    ctx.data_unchecked::<Arc<Container>>()
}

pub fn request<'a>(ctx: &Context<'a>) -> &'a RequestContext {
    ctx.data_unchecked::<RequestContext>()
}

/// The signed-in user, or the `UNAUTHORIZED` error every guarded resolver answers with.
pub fn require_user<'a>(ctx: &Context<'a>) -> async_graphql::Result<&'a AuthenticatedUser> {
    request(ctx).user.as_ref().ok_or_else(unauthorized)
}

/// A timestamp as JavaScript's `Date.prototype.toISOString` prints it
/// (`2026-01-31T09:30:00.000Z`), which is what every client parses.
pub fn iso(timestamp: DateTime<Utc>) -> String {
    timestamp.to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prints_milliseconds_and_a_z_suffix() {
        let timestamp = DateTime::<Utc>::from_timestamp_millis(1_769_851_800_120).unwrap();
        assert_eq!(iso(timestamp), "2026-01-31T09:30:00.120Z");
    }

    #[test]
    fn pads_a_whole_second_to_three_decimals() {
        let timestamp = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
        assert_eq!(iso(timestamp), "1970-01-01T00:00:00.000Z");
    }
}
