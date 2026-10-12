use std::io;
use std::net::IpAddr;
use std::sync::Arc;

use async_trait::async_trait;
use url::Url;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::logger::{LogValue, Logger};
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};

/// The `event` field of a refusal's log line.
const OUTBOUND_URL_REFUSED_EVENT: &str = "security.outbound_url.refused";

/// Ports that only make sense for internal services: SSH, SMTP, MySQL,
/// Postgres, Redis, Elasticsearch, memcached, MongoDB.
const BLOCKED_PORTS: [u16; 8] = [22, 25, 3306, 5432, 6379, 9200, 11211, 27017];

/// Resolves a hostname to every address it has, in their textual form.
#[async_trait]
pub trait HostLookup: Send + Sync {
    async fn lookup(&self, hostname: &str) -> io::Result<Vec<String>>;
}

/// The operating system's resolver, the one a connection would use.
pub struct SystemHostLookup;

#[async_trait]
impl HostLookup for SystemHostLookup {
    async fn lookup(&self, hostname: &str) -> io::Result<Vec<String>> {
        let addresses = tokio::net::lookup_host((hostname, 0)).await?;
        Ok(addresses.map(|address| address.ip().to_string()).collect())
    }
}

/// Which reserved range an address falls in. Reported alongside a refusal so
/// a probe at cloud metadata (`link_local`) is distinguishable from someone
/// pointing at their own laptop (`loopback`): the two mean very different
/// things when they show up in production.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddressClass {
    Loopback,
    Rfc1918,
    LinkLocal,
    Cgnat,
    Ula,
    Multicast,
    Unspecified,
    Public,
    NotAnIp,
}

impl AddressClass {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Loopback => "loopback",
            Self::Rfc1918 => "rfc1918",
            Self::LinkLocal => "link_local",
            Self::Cgnat => "cgnat",
            Self::Ula => "ula",
            Self::Multicast => "multicast",
            Self::Unspecified => "unspecified",
            Self::Public => "public",
            Self::NotAnIp => "not_an_ip",
        }
    }
}

fn classify_v4(a: u8, b: u8) -> AddressClass {
    if a == 0 {
        return AddressClass::Unspecified;
    }
    if a == 127 {
        return AddressClass::Loopback;
    }
    if a == 169 && b == 254 {
        return AddressClass::LinkLocal;
    }
    if a == 10 || (a == 172 && (16..=31).contains(&b)) || (a == 192 && b == 168) {
        return AddressClass::Rfc1918;
    }
    if a == 100 && (64..=127).contains(&b) {
        return AddressClass::Cgnat;
    }
    if a >= 224 {
        return AddressClass::Multicast;
    }
    AddressClass::Public
}

/// The IPv4 address inside the dotted form of an IPv4-mapped address
/// (`::ffff:10.0.0.1`), which is classified as the IPv4 it wraps.
fn mapped_v4(v6: &str) -> Option<(u8, u8)> {
    let dotted = v6.strip_prefix("::ffff:")?;
    let is_dotted_quad = dotted.split('.').count() == 4
        && dotted
            .split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()));
    if !is_dotted_quad {
        return None;
    }
    let octets = dotted.parse::<std::net::Ipv4Addr>().ok()?.octets();
    Some((octets[0], octets[1]))
}

/// Classifies by the address's spelling, exactly as `apps/api` does, so the
/// two implementations cannot disagree about a URL. See the tests for the
/// spellings that slip through as `public` in both.
fn classify_v6(ip: &str) -> AddressClass {
    let v6 = ip.to_ascii_lowercase();
    if let Some((a, b)) = mapped_v4(&v6) {
        return classify_v4(a, b);
    }
    if v6 == "::" {
        return AddressClass::Unspecified;
    }
    if v6 == "::1" {
        return AddressClass::Loopback;
    }
    if v6.starts_with("fe80") {
        return AddressClass::LinkLocal;
    }
    if v6.starts_with("fc") || v6.starts_with("fd") {
        return AddressClass::Ula;
    }
    if v6.starts_with("ff") {
        return AddressClass::Multicast;
    }
    AddressClass::Public
}

/// The single source of truth for both the allow/deny decision and the class
/// reported with a refusal, so the two can never disagree about what an
/// address is. Anything unparseable is `NotAnIp`, which fails closed.
pub fn classify_address(ip: &str) -> AddressClass {
    match ip.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => classify_v4(v4.octets()[0], v4.octets()[1]),
        Ok(IpAddr::V6(_)) => classify_v6(ip),
        Err(_) => AddressClass::NotAnIp,
    }
}

pub fn is_private_address(ip: &str) -> bool {
    classify_address(ip) != AddressClass::Public
}

/// Why a URL was refused: the `reason` field of the log line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RefusalReason {
    InvalidUrl,
    UnsupportedScheme,
    EmbeddedCredentials,
    InsecureProviderUrl,
    BlockedPort,
    ReservedHostname,
    UnresolvableHost,
    PrivateAddress,
}

impl RefusalReason {
    const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidUrl => "invalid_url",
            Self::UnsupportedScheme => "unsupported_scheme",
            Self::EmbeddedCredentials => "embedded_credentials",
            Self::InsecureProviderUrl => "insecure_provider_url",
            Self::BlockedPort => "blocked_port",
            Self::ReservedHostname => "reserved_hostname",
            Self::UnresolvableHost => "unresolvable_host",
            Self::PrivateAddress => "private_address",
        }
    }
}

const fn purpose_name(purpose: OutboundUrlPurpose) -> &'static str {
    match purpose {
        OutboundUrlPurpose::LlmProvider => "llm-provider",
        OutboundUrlPurpose::JobPosting => "job-posting",
    }
}

/// What a refusal is allowed to say about the URL. Never the URL itself.
#[derive(Debug, Clone, Default)]
struct RefusalContext {
    hostname: Option<String>,
    port: Option<u16>,
    address_class: Option<AddressClass>,
}

/// The one place that decides where the server will connect on a user's
/// behalf; see the `OutboundUrlPolicy` port for why there is one at all.
///
/// Resolves DNS itself rather than trusting the hostname's spelling, so a
/// name that points at 169.254.169.254 is refused the same as the literal.
/// The check is repeated at request time by the callers precisely because a
/// resolution can change after the URL was saved.
///
/// Every refusal is logged. Because all the check sites share this one
/// injected instance, doing it here covers all of them without any of them
/// knowing.
///
/// **What is reported is deliberately narrow:** hostname, port, the resolved
/// address class and a reason code. Not the URL: a job-posting link carries
/// a query string, and query strings carry user data.
pub struct ResolvingOutboundUrlPolicy {
    strict: bool,
    lookup: Arc<dyn HostLookup>,
    logger: Option<Arc<dyn Logger>>,
}

impl ResolvingOutboundUrlPolicy {
    /// `strict` refuses private, loopback and link-local destinations
    /// (`config::net::NetConfig::outbound_url_strict`). Resolves through the
    /// system resolver; `logger` is where refusals are reported.
    pub fn new(strict: bool, logger: Option<Arc<dyn Logger>>) -> Self {
        Self::with_lookup(strict, Arc::new(SystemHostLookup), logger)
    }

    pub fn with_lookup(
        strict: bool,
        lookup: Arc<dyn HostLookup>,
        logger: Option<Arc<dyn Logger>>,
    ) -> Self {
        Self { strict, lookup, logger }
    }

    pub fn is_strict(&self) -> bool {
        self.strict
    }

    /// Logs the refusal and builds the error to return. The
    /// `trakwyn.security.outbound_url.refused` counter (by `reason` and `purpose`)
    /// belongs here once metrics are ported.
    fn refuse(
        &self,
        message: &str,
        reason: RefusalReason,
        purpose: OutboundUrlPurpose,
        context: RefusalContext,
    ) -> DomainError {
        if let Some(logger) = &self.logger {
            // No error value: the policy refused on purpose, and everything
            // worth knowing is a field. The context holds only the narrow
            // set above, never the URL.
            let mut fields: Vec<(&'static str, LogValue)> = vec![
                ("event", OUTBOUND_URL_REFUSED_EVENT.into()),
                ("reason", reason.as_str().into()),
                ("purpose", purpose_name(purpose).into()),
            ];
            if let Some(hostname) = context.hostname {
                fields.push(("hostname", hostname.into()));
            }
            if let Some(port) = context.port {
                fields.push(("port", LogValue::Int(i64::from(port))));
            }
            if let Some(address_class) = context.address_class {
                fields.push(("addressClass", address_class.as_str().into()));
            }
            logger.warn("Outbound URL refused", None, &fields);
        }
        DomainError::validation(message)
    }
}

#[async_trait]
impl OutboundUrlPolicy for ResolvingOutboundUrlPolicy {
    async fn assert_allowed(&self, raw: &str, purpose: OutboundUrlPurpose) -> DomainResult<()> {
        let Ok(url) = Url::parse(raw) else {
            // No hostname to report: it did not parse into one.
            return Err(self.refuse(
                "URL is not valid",
                RefusalReason::InvalidUrl,
                purpose,
                RefusalContext::default(),
            ));
        };

        let scheme = url.scheme();
        let host = url.host_str().unwrap_or("");
        let hostname = host.strip_prefix('[').unwrap_or(host);
        let hostname = hostname.strip_suffix(']').unwrap_or(hostname).to_string();
        let port = url.port().unwrap_or(if scheme == "https" { 443 } else { 80 });
        let at = |address_class: Option<AddressClass>| RefusalContext {
            hostname: Some(hostname.clone()),
            port: Some(port),
            address_class,
        };

        if scheme != "https" && scheme != "http" {
            return Err(self.refuse(
                "URL must use http or https",
                RefusalReason::UnsupportedScheme,
                purpose,
                at(None),
            ));
        }
        if !url.username().is_empty() || url.password().is_some_and(|password| !password.is_empty())
        {
            return Err(self.refuse(
                "URL must not contain credentials",
                RefusalReason::EmbeddedCredentials,
                purpose,
                at(None),
            ));
        }
        if !self.strict {
            return Ok(());
        }

        // A provider endpoint carries the user's API key on every call, and
        // the server will keep calling it for as long as the key is saved:
        // plaintext http is not an acceptable transport for that. A job
        // posting is a public page read once, and plenty of them are still
        // served over http.
        if purpose == OutboundUrlPurpose::LlmProvider && scheme != "https" {
            return Err(self.refuse(
                "Provider base URL must use https",
                RefusalReason::InsecureProviderUrl,
                purpose,
                at(None),
            ));
        }

        if BLOCKED_PORTS.contains(&port) {
            return Err(self.refuse(
                "URL port is not allowed",
                RefusalReason::BlockedPort,
                purpose,
                at(None),
            ));
        }

        if hostname == "localhost"
            || hostname.ends_with(".localhost")
            || hostname.ends_with(".internal")
            || hostname.ends_with(".local")
        {
            return Err(self.refuse(
                "URL host is not allowed",
                RefusalReason::ReservedHostname,
                purpose,
                at(None),
            ));
        }

        let addresses = if hostname.parse::<IpAddr>().is_ok() {
            vec![hostname.clone()]
        } else {
            match self.lookup.lookup(&hostname).await {
                Ok(addresses) => addresses,
                Err(_) => {
                    return Err(self.refuse(
                        "URL host could not be resolved",
                        RefusalReason::UnresolvableHost,
                        purpose,
                        at(None),
                    ));
                }
            }
        };

        // An empty answer is reported as `not_an_ip` for the same reason
        // `classify_address` returns it: nothing usable came back, so fail
        // closed.
        let blocked = addresses
            .iter()
            .map(|address| classify_address(address))
            .find(|class| *class != AddressClass::Public);
        if addresses.is_empty() || blocked.is_some() {
            return Err(self.refuse(
                "URL host is not allowed",
                RefusalReason::PrivateAddress,
                purpose,
                at(Some(blocked.unwrap_or(AddressClass::NotAnIp))),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
