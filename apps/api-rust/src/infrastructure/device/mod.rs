//! What a session's device and location are called in the sessions list and
//! in the new-device alert.

mod device_label_service;
mod ip_location_service;
mod trakwyn_client_user_agent;

pub use device_label_service::DeviceLabelService;
pub use ip_location_service::{IpLocationService, IP_LOCATION_API_URL};
pub use trakwyn_client_user_agent::{parse_trakwyn_client_user_agent, TrakwynClientUserAgent};
