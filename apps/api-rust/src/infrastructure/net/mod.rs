//! Outbound requests the server makes on a user's behalf: where it may
//! connect, and how much of an answer it will read.

mod outbound_url_policy;
mod read_bounded;
#[cfg(test)]
pub(crate) mod stub_server;

pub use outbound_url_policy::{
    classify_address, is_private_address, AddressClass, HostLookup, ResolvingOutboundUrlPolicy,
    SystemHostLookup,
};
pub use read_bounded::{read_bounded, ChunkedBody};
