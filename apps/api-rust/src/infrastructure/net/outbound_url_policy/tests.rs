use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::*;
use crate::use_cases::errors::ErrorCode;
use crate::use_cases::test_support::{FakeLogger, LogLevel};
use OutboundUrlPurpose::{JobPosting, LlmProvider};

/// Resolves only the hostnames it was given, and counts how often it is asked.
#[derive(Default)]
struct Resolving {
    addresses: HashMap<String, Vec<String>>,
    calls: AtomicUsize,
}

impl Resolving {
    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl HostLookup for Resolving {
    async fn lookup(&self, hostname: &str) -> io::Result<Vec<String>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.addresses
            .get(hostname)
            .cloned()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "ENOTFOUND"))
    }
}

fn resolving(addresses: &[(&str, &[&str])]) -> Arc<Resolving> {
    Arc::new(Resolving {
        addresses: addresses
            .iter()
            .map(|(host, ips)| (host.to_string(), ips.iter().map(|ip| ip.to_string()).collect()))
            .collect(),
        calls: AtomicUsize::new(0),
    })
}

fn strict(addresses: &[(&str, &[&str])]) -> ResolvingOutboundUrlPolicy {
    ResolvingOutboundUrlPolicy::with_lookup(true, resolving(addresses), None)
}

fn permissive(lookup: Arc<Resolving>) -> ResolvingOutboundUrlPolicy {
    ResolvingOutboundUrlPolicy::with_lookup(false, lookup, None)
}

fn reporting(addresses: &[(&str, &[&str])]) -> (ResolvingOutboundUrlPolicy, Arc<FakeLogger>) {
    let logger = Arc::new(FakeLogger::default());
    let policy =
        ResolvingOutboundUrlPolicy::with_lookup(true, resolving(addresses), Some(logger.clone()));
    (policy, logger)
}

const PUBLIC: &[&str] = &["93.184.216.34"];

/// Asserts the URL was refused as a validation failure; returns the message.
async fn refused(
    policy: &ResolvingOutboundUrlPolicy,
    url: &str,
    purpose: OutboundUrlPurpose,
) -> String {
    let err = policy.assert_allowed(url, purpose).await.expect_err(url);
    assert_eq!(err.code(), ErrorCode::Validation, "{url}");
    err.to_string()
}

fn str_field(value: &str) -> Option<LogValue> {
    Some(LogValue::Str(value.to_string()))
}

// ── is_private_address / classify_address ───────────────────────────

#[test]
fn treats_reserved_addresses_as_private() {
    for ip in [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "::",
        "fc00::1",
        "fd12::1",
        "fe80::1",
        "::ffff:10.0.0.1",
    ] {
        assert!(is_private_address(ip), "{ip}");
    }
}

#[test]
fn treats_routable_addresses_as_public() {
    for ip in ["8.8.8.8", "104.18.0.1", "172.32.0.1", "2606:4700::1111"] {
        assert!(!is_private_address(ip), "{ip}");
    }
}

#[test]
fn treats_something_that_is_not_an_ip_as_private() {
    assert!(is_private_address("not-an-ip"));
}

#[test]
fn classifies_each_reserved_range() {
    for (ip, expected) in [
        ("127.0.0.1", "loopback"),
        ("::1", "loopback"),
        ("10.1.2.3", "rfc1918"),
        ("172.16.0.1", "rfc1918"),
        ("192.168.1.1", "rfc1918"),
        ("169.254.169.254", "link_local"),
        ("fe80::1", "link_local"),
        ("100.64.0.1", "cgnat"),
        ("fd12::1", "ula"),
        ("fc00::1", "ula"),
        ("224.0.0.1", "multicast"),
        ("ff02::1", "multicast"),
        ("0.0.0.0", "unspecified"),
        ("::", "unspecified"),
        ("::ffff:10.0.0.1", "rfc1918"),
        ("8.8.8.8", "public"),
        ("2606:4700::1111", "public"),
        ("not-an-ip", "not_an_ip"),
    ] {
        assert_eq!(classify_address(ip).as_str(), expected, "{ip}");
    }
}

#[test]
fn classifies_the_edges_of_each_ipv4_range() {
    for (ip, expected) in [
        ("172.15.255.255", "public"),
        ("172.31.255.255", "rfc1918"),
        ("100.63.255.255", "public"),
        ("100.127.255.255", "cgnat"),
        ("100.128.0.0", "public"),
        ("169.253.0.1", "public"),
        ("223.255.255.255", "public"),
        ("255.255.255.255", "multicast"),
        ("0.1.2.3", "unspecified"),
        ("::FFFF:169.254.169.254", "link_local"),
        ("::ffff:8.8.8.8", "public"),
        ("FE80::1", "link_local"),
    ] {
        assert_eq!(classify_address(ip).as_str(), expected, "{ip}");
    }
}

#[test]
fn fails_closed_on_spellings_that_are_not_addresses() {
    for ip in ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "fe80::1%eth0", "[::1]", "localhost"] {
        assert_eq!(classify_address(ip), AddressClass::NotAnIp, "{ip}");
    }
}

// ── reporting ───────────────────────────────────────────────────────

#[tokio::test]
async fn records_nothing_when_the_url_is_allowed() {
    let (policy, logger) = reporting(&[("api.example.com", PUBLIC)]);

    policy.assert_allowed("https://api.example.com/v1", LlmProvider).await.unwrap();

    assert!(logger.lines().is_empty());
}

#[tokio::test]
async fn reports_the_hostname_port_address_class_and_reason_of_a_metadata_probe() {
    let (policy, logger) = reporting(&[("metadata.example.com", &["169.254.169.254"])]);

    refused(&policy, "http://metadata.example.com/latest/meta-data/", JobPosting).await;

    let lines = logger.lines();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].level, LogLevel::Warn);
    assert_eq!(lines[0].message, "Outbound URL refused");
    assert_eq!(lines[0].error, None);
    assert_eq!(
        lines[0].fields,
        vec![
            ("event", LogValue::Str("security.outbound_url.refused".to_string())),
            ("reason", LogValue::Str("private_address".to_string())),
            ("purpose", LogValue::Str("job-posting".to_string())),
            ("hostname", LogValue::Str("metadata.example.com".to_string())),
            ("port", LogValue::Int(80)),
            ("addressClass", LogValue::Str("link_local".to_string())),
        ]
    );
}

#[tokio::test]
async fn reports_each_refusal_with_its_reason_and_message() {
    for (url, reason, message) in [
        ("not a url", "invalid_url", "URL is not valid"),
        ("file:///etc/passwd", "unsupported_scheme", "URL must use http or https"),
        (
            "https://user:pw@example.com/",
            "embedded_credentials",
            "URL must not contain credentials",
        ),
        ("http://example.com/v1", "insecure_provider_url", "Provider base URL must use https"),
        ("https://example.com:6379/", "blocked_port", "URL port is not allowed"),
        ("https://redis.internal/", "reserved_hostname", "URL host is not allowed"),
        ("https://nope.invalid/", "unresolvable_host", "URL host could not be resolved"),
        ("https://127.0.0.1/", "private_address", "URL host is not allowed"),
    ] {
        let (policy, logger) = reporting(&[("example.com", PUBLIC)]);

        assert_eq!(refused(&policy, url, LlmProvider).await, message, "{url}");

        let lines = logger.lines();
        assert_eq!(lines.len(), 1, "{url}");
        assert_eq!(lines[0].field("reason").cloned(), str_field(reason), "{url}");
        assert_eq!(lines[0].field("purpose").cloned(), str_field("llm-provider"), "{url}");
    }
}

#[tokio::test]
async fn an_unparseable_url_is_reported_with_no_hostname_or_port() {
    let (policy, logger) = reporting(&[]);

    refused(&policy, "not a url", JobPosting).await;

    let line = &logger.lines()[0];
    assert_eq!(line.field("hostname"), None);
    assert_eq!(line.field("port"), None);
    assert_eq!(line.field("addressClass"), None);
}

#[tokio::test]
async fn reports_the_default_port_of_the_scheme_and_an_explicit_one() {
    let (policy, logger) = reporting(&[]);

    refused(&policy, "https://127.0.0.1/", JobPosting).await;
    refused(&policy, "http://10.0.0.5:8080/", JobPosting).await;
    refused(&policy, "https://user@example.com:8443/", JobPosting).await;

    let lines = logger.lines();
    assert_eq!(lines[0].field("port"), Some(&LogValue::Int(443)));
    assert_eq!(lines[1].field("port"), Some(&LogValue::Int(8080)));
    assert_eq!(lines[1].field("addressClass").cloned(), str_field("rfc1918"));
    assert_eq!(lines[2].field("port"), Some(&LogValue::Int(8443)));
    assert_eq!(lines[2].field("addressClass"), None);
}

/// A job-posting URL carries a query string and a query string carries
/// user data, so the path and query must never reach the log: the
/// hostname is the whole of what is reported about where the request was
/// headed.
#[tokio::test]
async fn never_logs_the_path_query_string_or_full_url() {
    let (policy, logger) = reporting(&[]);

    refused(
        &policy,
        "http://169.254.169.254/latest/meta-data/iam/?token=s3cret&email=someone@example.com",
        JobPosting,
    )
    .await;

    let logged = format!("{:?}", logger.lines());
    assert!(logged.contains("169.254.169.254"));
    assert!(!logged.contains("s3cret"));
    assert!(!logged.contains("someone@example.com"));
    assert!(!logged.contains("meta-data"));
    assert!(!logged.contains("/latest"));
}

#[tokio::test]
async fn reports_a_refusal_in_permissive_mode_too() {
    let logger = Arc::new(FakeLogger::default());
    let policy =
        ResolvingOutboundUrlPolicy::with_lookup(false, resolving(&[]), Some(logger.clone()));

    refused(&policy, "file:///etc/hosts", JobPosting).await;

    let lines = logger.lines();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].field("reason").cloned(), str_field("unsupported_scheme"));
    assert_eq!(lines[0].field("purpose").cloned(), str_field("job-posting"));
}

#[tokio::test]
async fn still_refuses_when_no_logger_is_supplied() {
    refused(&strict(&[]), "http://127.0.0.1/", JobPosting).await;
}

// ── in every mode ───────────────────────────────────────────────────

#[tokio::test]
async fn rejects_a_malformed_url() {
    refused(&strict(&[]), "not a url", JobPosting).await;
    refused(&permissive(resolving(&[])), "not a url", JobPosting).await;
    refused(&strict(&[]), "", JobPosting).await;
    refused(&strict(&[]), "example.com/jobs/1", JobPosting).await;
}

#[tokio::test]
async fn rejects_non_http_schemes() {
    refused(&strict(&[]), "file:///etc/passwd", JobPosting).await;
    refused(&strict(&[]), "ftp://example.com/", JobPosting).await;
    refused(&permissive(resolving(&[])), "gopher://example.com/", JobPosting).await;
}

#[tokio::test]
async fn rejects_embedded_credentials() {
    let policy = strict(&[("example.com", PUBLIC)]);
    refused(&policy, "https://user:pw@example.com/", JobPosting).await;
    refused(&policy, "https://user@example.com/", JobPosting).await;
    refused(&policy, "https://:pw@example.com/", JobPosting).await;
    refused(&permissive(resolving(&[])), "http://user:pw@localhost/", JobPosting).await;
}

// ── strict mode ─────────────────────────────────────────────────────

#[tokio::test]
async fn allows_a_public_https_host() {
    strict(&[("api.example.com", PUBLIC)])
        .assert_allowed("https://api.example.com/v1/chat/completions", LlmProvider)
        .await
        .unwrap();
}

#[tokio::test]
async fn requires_https_for_an_llm_provider_but_not_for_a_job_posting() {
    let policy = strict(&[("jobs.example.com", PUBLIC)]);

    refused(&policy, "http://jobs.example.com/v1", LlmProvider).await;
    policy.assert_allowed("http://jobs.example.com/posting/1", JobPosting).await.unwrap();
}

#[tokio::test]
async fn rejects_a_literal_private_address() {
    for url in [
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
        "http://192.168.1.10:8080/",
        "http://127.0.0.1:3001/admin/trash/purge",
        "http://[::1]:3001/",
        "http://0.0.0.0/",
    ] {
        assert_eq!(refused(&strict(&[]), url, JobPosting).await, "URL host is not allowed");
    }
}

/// The URL parser rewrites these into the dotted form before the policy
/// sees them, so an obfuscated loopback or metadata address is refused
/// like the plain one.
#[tokio::test]
async fn rejects_a_private_ipv4_address_in_a_non_dotted_spelling() {
    for url in [
        "http://2130706433/",
        "http://0x7f.1/",
        "http://0177.0.0.1/",
        "http://0xa9fea9fe/",
        "http://[fe80::1]/",
        "http://[fd00::1]/",
        "http://[::]/",
    ] {
        let lookup = resolving(&[]);
        let policy = ResolvingOutboundUrlPolicy::with_lookup(true, lookup.clone(), None);

        assert_eq!(refused(&policy, url, JobPosting).await, "URL host is not allowed");
        assert_eq!(lookup.calls(), 0, "{url}");
    }
}

/// KNOWN GAP, ported as it stands from `apps/api`: an IPv4-mapped IPv6
/// *literal in a URL* is allowed in strict mode. The URL parser
/// normalises `[::ffff:169.254.169.254]` to the hex spelling
/// `::ffff:a9fe:a9fe`, which the dotted-form check in `classify_v6` does
/// not recognise, so it is classified `public`. (The dotted spelling,
/// which is how a resolver reports such an address, is caught.) This
/// test pins the behaviour the two implementations share today; fix
/// both together and flip it.
#[tokio::test]
async fn an_ipv4_mapped_literal_in_a_url_slips_through_as_apps_api_lets_it() {
    assert_eq!(classify_address("::ffff:a9fe:a9fe"), AddressClass::Public);
    assert_eq!(classify_address("::ffff:7f00:1"), AddressClass::Public);

    let policy = strict(&[]);
    policy.assert_allowed("http://[::ffff:169.254.169.254]/", JobPosting).await.unwrap();
    policy.assert_allowed("http://[::ffff:127.0.0.1]/", JobPosting).await.unwrap();
}

#[tokio::test]
async fn rejects_a_reserved_hostname_without_resolving_it() {
    for url in [
        "http://localhost/",
        "http://api.localhost/",
        "http://redis.internal/",
        "http://printer.local/",
        "http://LOCALHOST/",
    ] {
        let lookup = resolving(&[]);
        let policy = ResolvingOutboundUrlPolicy::with_lookup(true, lookup.clone(), None);

        assert_eq!(refused(&policy, url, JobPosting).await, "URL host is not allowed");
        assert_eq!(lookup.calls(), 0, "{url}");
    }
}

#[tokio::test]
async fn rejects_a_public_looking_hostname_that_resolves_to_a_private_address() {
    let policy = strict(&[("metadata.example.com", &["169.254.169.254"])]);
    refused(&policy, "https://metadata.example.com/", LlmProvider).await;
}

#[tokio::test]
async fn rejects_a_hostname_that_resolves_to_an_ipv4_mapped_private_address() {
    let policy = strict(&[("mapped.example.com", &["::ffff:10.0.0.1"])]);
    refused(&policy, "https://mapped.example.com/", LlmProvider).await;
}

#[tokio::test]
async fn rejects_a_hostname_if_any_of_its_addresses_is_private() {
    let policy = strict(&[("mixed.example.com", &["93.184.216.34", "10.0.0.1"])]);
    refused(&policy, "https://mixed.example.com/", LlmProvider).await;
}

#[tokio::test]
async fn rejects_a_hostname_that_does_not_resolve() {
    let message = refused(&strict(&[]), "https://nope.invalid/", LlmProvider).await;
    assert_eq!(message, "URL host could not be resolved");
}

#[tokio::test]
async fn rejects_a_hostname_that_resolves_to_nothing_as_not_an_ip() {
    let (policy, logger) = reporting(&[("empty.example.com", &[])]);

    refused(&policy, "https://empty.example.com/", LlmProvider).await;

    let line = &logger.lines()[0];
    assert_eq!(line.field("reason").cloned(), str_field("private_address"));
    assert_eq!(line.field("addressClass").cloned(), str_field("not_an_ip"));
}

#[tokio::test]
async fn rejects_a_hostname_whose_answer_is_not_an_address() {
    let policy = strict(&[("odd.example.com", &["not-an-ip"])]);
    refused(&policy, "https://odd.example.com/", LlmProvider).await;
}

#[tokio::test]
async fn rejects_ports_that_only_make_sense_for_internal_services() {
    let policy = strict(&[("db.example.com", PUBLIC)]);

    for port in [22, 25, 3306, 5432, 6379, 9200, 11211, 27017] {
        let url = format!("https://db.example.com:{port}/");
        assert_eq!(refused(&policy, &url, LlmProvider).await, "URL port is not allowed");
    }
    policy.assert_allowed("https://db.example.com:8443/", LlmProvider).await.unwrap();
}

#[tokio::test]
async fn checks_the_scheme_before_the_port_and_the_port_before_the_host() {
    let policy = strict(&[]);

    assert_eq!(
        refused(&policy, "http://localhost:6379/", LlmProvider).await,
        "Provider base URL must use https"
    );
    assert_eq!(
        refused(&policy, "http://localhost:6379/", JobPosting).await,
        "URL port is not allowed"
    );
}

// ── permissive mode (development, CI) ───────────────────────────────

#[tokio::test]
async fn permissive_mode_allows_localhost_and_private_addresses_without_resolving() {
    let lookup = resolving(&[]);
    let policy = permissive(lookup.clone());

    policy
        .assert_allowed("http://localhost:3001/llm-test/fake/chat/completions", LlmProvider)
        .await
        .unwrap();
    policy.assert_allowed("http://192.168.1.20:11434/v1", LlmProvider).await.unwrap();
    policy.assert_allowed("http://unresolvable.invalid:6379/", JobPosting).await.unwrap();
    assert_eq!(lookup.calls(), 0);
}

#[tokio::test]
async fn permissive_mode_still_rejects_schemes_other_than_http() {
    refused(&permissive(resolving(&[])), "file:///etc/hosts", JobPosting).await;
}

#[test]
fn remembers_the_mode_it_was_built_with() {
    assert!(ResolvingOutboundUrlPolicy::new(true, None).is_strict());
    assert!(!ResolvingOutboundUrlPolicy::new(false, None).is_strict());
}

#[tokio::test]
async fn the_system_resolver_reports_addresses_as_text() {
    let addresses = SystemHostLookup.lookup("localhost").await.unwrap();

    assert!(!addresses.is_empty());
    assert!(addresses.iter().all(|address| is_private_address(address)), "{addresses:?}");
}
