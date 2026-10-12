use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use reqwest::header::{ACCEPT, CONTENT_TYPE, LOCATION, USER_AGENT};

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::job_posting_source_resolver::{
    JobPostingSource, JobPostingSourceResolver,
};
use crate::use_cases::ports::outbound_url_policy::{OutboundUrlPolicy, OutboundUrlPurpose};

const FETCH_USER_AGENT: &str = "Mozilla/5.0 (compatible; TrakwynBot/1.0)";
const FETCH_ACCEPT: &str = "text/html, text/plain;q=0.9";
/// Per hop, from connect to the end of the body.
const FETCH_TIMEOUT: Duration = Duration::from_millis(10_000);
/// The parser only reads the first few thousand characters of the stripped
/// text, and 1 MB of HTML is far more than that.
const MAX_BYTES: usize = 1024 * 1024;
/// Each hop is re-checked against the outbound URL policy.
const MAX_REDIRECTS: usize = 3;
/// A `<main>`/`<article>` with less text than this is a template shell, not
/// the posting: fall back to the whole page.
const MIN_CONTENT_REGION_CHARS: usize = 200;
const REDIRECT_STATUSES: [u16; 5] = [301, 302, 303, 307, 308];
const CONTENT_REGION_TAGS: [&str; 2] = ["main", "article"];
const ACCEPTED_CONTENT_TYPES: [&str; 2] = ["text/html", "text/plain"];

/// Turns "paste a link" into text for the job-description parser.
///
/// The URL is whatever the user typed, and the server fetches it from inside
/// its own network, so this goes through the [`OutboundUrlPolicy`].
/// Redirects are followed by hand rather than by the HTTP client so that
/// every hop is checked too: a public job board that 302s to an internal
/// host is the same attack with one more step. The body is read up to a
/// fixed size and then abandoned.
pub struct FetchJobPostingSourceResolver {
    outbound_url_policy: Arc<dyn OutboundUrlPolicy>,
    client: reqwest::Client,
}

impl FetchJobPostingSourceResolver {
    pub fn new(outbound_url_policy: Arc<dyn OutboundUrlPolicy>) -> DomainResult<Self> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(DomainError::internal)?;
        Ok(Self { outbound_url_policy, client })
    }

    async fn fetch_page(&self, initial_url: &str) -> DomainResult<String> {
        let mut url = initial_url.to_string();
        for _hop in 0..=MAX_REDIRECTS {
            self.outbound_url_policy.assert_allowed(&url, OutboundUrlPurpose::JobPosting).await?;

            let response = self
                .client
                .get(&url)
                .header(USER_AGENT, FETCH_USER_AGENT)
                .header(ACCEPT, FETCH_ACCEPT)
                .timeout(FETCH_TIMEOUT)
                .send()
                .await
                .map_err(fetch_failed)?;

            let status = response.status();
            if REDIRECT_STATUSES.contains(&status.as_u16()) {
                let location = response
                    .headers()
                    .get(LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| {
                        DomainError::service_unavailable("Could not fetch the job posting")
                    })?;
                url = reqwest::Url::parse(&url)
                    .and_then(|base| base.join(location))
                    .map_err(DomainError::internal)?
                    .to_string();
                continue;
            }

            if !status.is_success() {
                return Err(DomainError::service_unavailable(format!(
                    "Could not fetch the job posting (HTTP {})",
                    status.as_u16()
                )));
            }

            let content_type = response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            if !is_web_page(content_type) {
                return Err(DomainError::validation("The link did not return a web page"));
            }

            return read_bounded(response, MAX_BYTES).await;
        }

        Err(DomainError::service_unavailable("The job posting link redirected too many times"))
    }
}

#[async_trait]
impl JobPostingSourceResolver for FetchJobPostingSourceResolver {
    async fn resolve(&self, source: JobPostingSource) -> DomainResult<String> {
        let text = source.text.as_deref().map(str::trim).unwrap_or_default();
        if !text.is_empty() {
            return Ok(text.to_string());
        }

        let url = source.url.as_deref().map(str::trim).unwrap_or_default();
        if !url.is_empty() {
            let html = self.fetch_page(url).await?;
            return Ok(strip_html(&html));
        }

        Err(DomainError::internal("Either text or url must be provided"))
    }
}

/// The URL is stripped from the source: it is user data.
fn fetch_failed(err: reqwest::Error) -> DomainError {
    DomainError::internal(err.without_url())
}

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// `text/html` or `text/plain`, whatever parameters follow.
fn is_web_page(content_type: &str) -> bool {
    let lower = content_type.to_ascii_lowercase();
    ACCEPTED_CONTENT_TYPES.iter().any(|accepted| {
        lower
            .strip_prefix(accepted)
            .is_some_and(|rest| !rest.bytes().next().is_some_and(is_word_byte))
    })
}

/// Reads at most `max_bytes` of a response body and stops, where reading the
/// whole body would buffer it however large it is: a user-supplied URL can
/// point at a multi-gigabyte file. Dropping the response afterwards closes
/// the connection rather than draining the rest.
async fn read_bounded(mut response: reqwest::Response, max_bytes: usize) -> DomainResult<String> {
    let mut received: Vec<u8> = Vec::new();
    while received.len() < max_bytes {
        let Some(chunk) = response.chunk().await.map_err(fetch_failed)? else {
            break;
        };
        let remaining = max_bytes - received.len();
        let chunk: &[u8] = chunk.as_ref();
        received.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
    }
    drop(response);

    let text = String::from_utf8_lossy(&received);
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

/// A job page is mostly not the job: navigation, cookie banners, "similar
/// roles", footers. When the page marks its content with `<main>` or
/// `<article>`, only that part is kept (the largest such block, and only if
/// it holds a real amount of text, since some templates ship an empty shell)
/// so what the parser reads is the posting rather than the chrome around it.
fn strip_html(html: &str) -> String {
    to_text(content_region(html).unwrap_or(html))
}

fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

fn content_region(html: &str) -> Option<&str> {
    let mut best: Option<(&str, usize)> = None;
    for block in content_blocks(html) {
        let length = utf16_len(&to_text(block));
        if length >= MIN_CONTENT_REGION_CHARS && best.is_none_or(|(_, longest)| length > longest) {
            best = Some((block, length));
        }
    }
    best.map(|(block, _)| block)
}

/// Every non-overlapping `<main …>…</main>` or `<article …>…</article>`,
/// case-insensitively, each ending at the first matching close tag.
fn content_blocks(html: &str) -> Vec<&str> {
    // ASCII lowering keeps every byte offset, so indexes found in `lower`
    // are valid in `html`.
    let lower = html.to_ascii_lowercase();
    let mut blocks = Vec::new();
    let mut from = 0;
    while let Some(offset) = lower[from..].find('<') {
        let start = from + offset;
        match match_content_block(&lower, start) {
            Some(end) => {
                blocks.push(&html[start..end]);
                from = end;
            }
            None => from = start + 1,
        }
    }
    blocks
}

/// The end of the content block opening at `start`, if one does.
fn match_content_block(lower: &str, start: usize) -> Option<usize> {
    let after_bracket = &lower[start + 1..];
    let tag = CONTENT_REGION_TAGS.into_iter().find(|tag| {
        after_bracket
            .strip_prefix(tag)
            .is_some_and(|rest| !rest.bytes().next().is_some_and(is_word_byte))
    })?;
    let after_name = start + 1 + tag.len();
    let open_end = after_name + lower[after_name..].find('>')? + 1;
    let close = format!("</{tag}>");
    let close_start = open_end + lower[open_end..].find(&close)?;
    Some(close_start + close.len())
}

/// Removes every `<tag …>…</tag>` element, case-insensitively, each ending
/// at the first close tag. An element that is never closed is left alone.
fn remove_elements(html: &str, tag: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let (open, close) = (format!("<{tag}"), format!("</{tag}>"));
    let mut out = String::with_capacity(html.len());
    let mut from = 0;
    while let Some(offset) = lower[from..].find(&open) {
        let start = from + offset;
        let Some(close_offset) = lower[start + open.len()..].find(&close) else {
            break;
        };
        out.push_str(&html[from..start]);
        from = start + open.len() + close_offset + close.len();
    }
    out.push_str(&html[from..]);
    out
}

/// Replaces every tag (`<`, at least one character that is not `>`, `>`)
/// with a space.
fn replace_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut from = 0;
    while let Some(offset) = html[from..].find('<') {
        let start = from + offset;
        let Some(close_offset) = html[start + 1..].find('>') else {
            break;
        };
        out.push_str(&html[from..start]);
        if close_offset == 0 {
            // `<>` is not a tag; keep the bracket and look again after it.
            out.push('<');
            from = start + 1;
        } else {
            out.push(' ');
            from = start + 1 + close_offset + 1;
        }
    }
    out.push_str(&html[from..]);
    out
}

/// Whitespace as the original implementation's regular expressions count it.
fn is_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

/// Collapses every run of two or more whitespace characters to one space. A
/// lone whitespace character is kept as it is.
fn collapse_whitespace(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if is_space(c) && chars.peek().copied().is_some_and(is_space) {
            while chars.peek().copied().is_some_and(is_space) {
                chars.next();
            }
            out.push(' ');
        } else {
            out.push(c);
        }
    }
    out
}

fn to_text(html: &str) -> String {
    let without_code = remove_elements(&remove_elements(html, "script"), "style");
    let decoded = replace_tags(&without_code)
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"");
    collapse_whitespace(&decoded).trim_matches(is_space).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::llm::stub_server::{StubReply, StubServer};
    use crate::use_cases::errors::ErrorCode;
    use crate::use_cases::test_support::RecordingOutboundUrlPolicy;

    fn resolver(
        policy: RecordingOutboundUrlPolicy,
    ) -> (FetchJobPostingSourceResolver, Arc<RecordingOutboundUrlPolicy>) {
        let policy = Arc::new(policy);
        (FetchJobPostingSourceResolver::new(policy.clone()).unwrap(), policy)
    }

    fn link(url: &str) -> JobPostingSource {
        JobPostingSource { text: None, url: Some(url.to_string()) }
    }

    async fn resolve_page(reply: StubReply) -> DomainResult<String> {
        let server = StubServer::start(vec![reply]).await;
        let (resolver, _) = resolver(RecordingOutboundUrlPolicy::allow_all());
        resolver.resolve(link(&server.url("/job"))).await
    }

    #[tokio::test]
    async fn returns_trimmed_text_when_text_is_provided() {
        let (resolver, policy) = resolver(RecordingOutboundUrlPolicy::allow_all());
        let source = JobPostingSource {
            text: Some("  Senior Engineer at Acme  ".to_string()),
            url: Some("https://example.com/job".to_string()),
        };
        assert_eq!(resolver.resolve(source).await.unwrap(), "Senior Engineer at Acme");
        assert!(policy.checks().is_empty());
    }

    #[tokio::test]
    async fn fails_when_neither_text_nor_url_is_provided() {
        let (resolver, _) = resolver(RecordingOutboundUrlPolicy::allow_all());
        let err = resolver.resolve(JobPostingSource::default()).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(err.to_string().contains("Either text or url must be provided"));
    }

    #[tokio::test]
    async fn fails_when_text_is_whitespace_only() {
        let (resolver, _) = resolver(RecordingOutboundUrlPolicy::allow_all());
        let source = JobPostingSource { text: Some("   ".to_string()), url: None };
        let err = resolver.resolve(source).await.unwrap_err();
        assert!(err.to_string().contains("Either text or url must be provided"));
    }

    #[tokio::test]
    async fn fetches_the_url_and_strips_html_tags() {
        let server = StubServer::start(vec![StubReply::html(
            "<html><body><p>Senior Engineer at Acme</p><script>alert(\"x\")</script></body></html>",
        )])
        .await;
        let (resolver, policy) = resolver(RecordingOutboundUrlPolicy::allow_all());
        let url = server.url("/job");

        let result = resolver.resolve(link(&format!("  {url}  "))).await.unwrap();

        assert_eq!(result, "Senior Engineer at Acme");
        let sent = server.only_request();
        assert_eq!(sent.method, "GET");
        assert_eq!(sent.uri, "/job");
        assert_eq!(sent.header("user-agent"), Some(FETCH_USER_AGENT));
        assert_eq!(sent.header("accept"), Some("text/html, text/plain;q=0.9"));
        assert_eq!(policy.checks(), vec![(url, OutboundUrlPurpose::JobPosting)]);
    }

    #[tokio::test]
    async fn asks_the_outbound_policy_first_and_does_not_fetch_what_it_refuses() {
        let server = StubServer::start(vec![StubReply::html("<p>secret</p>")]).await;
        let (resolver, policy) = resolver(RecordingOutboundUrlPolicy::refuse_all());
        let url = server.url("/latest/meta-data/");

        let err = resolver.resolve(link(&url)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(policy.checks(), vec![(url, OutboundUrlPurpose::JobPosting)]);
        assert_eq!(server.request_count(), 0);
    }

    #[tokio::test]
    async fn follows_a_redirect_by_hand_rechecking_each_hop_against_the_policy() {
        let server = StubServer::start(vec![
            StubReply::redirect(302, "/careers/123"),
            StubReply::html("<p>Staff Engineer</p>"),
        ])
        .await;
        let (resolver, policy) = resolver(RecordingOutboundUrlPolicy::allow_all());

        let result = resolver.resolve(link(&server.url("/job"))).await.unwrap();

        assert_eq!(result, "Staff Engineer");
        assert_eq!(
            policy.checks(),
            vec![
                (server.url("/job"), OutboundUrlPurpose::JobPosting),
                (server.url("/careers/123"), OutboundUrlPurpose::JobPosting),
            ]
        );
        let paths: Vec<_> = server.requests().into_iter().map(|request| request.uri).collect();
        assert_eq!(paths, vec!["/job", "/careers/123"]);
    }

    #[tokio::test]
    async fn follows_every_redirect_status() {
        for status in REDIRECT_STATUSES {
            let server = StubServer::start(vec![
                StubReply::redirect(status, "/moved"),
                StubReply::html("<p>Staff Engineer</p>"),
            ])
            .await;
            let (resolver, _) = resolver(RecordingOutboundUrlPolicy::allow_all());
            let result = resolver.resolve(link(&server.url("/job"))).await;
            assert_eq!(result.unwrap(), "Staff Engineer", "status {status}");
        }
    }

    #[tokio::test]
    async fn refuses_a_redirect_to_a_destination_the_policy_rejects() {
        let server = StubServer::start(vec![
            StubReply::redirect(301, "http://10.0.0.5/secret"),
            StubReply::html("<p>never served</p>"),
        ])
        .await;
        let (resolver, policy) =
            resolver(RecordingOutboundUrlPolicy::allow_all().refusing("http://10.0.0.5/secret"));

        let err = resolver.resolve(link(&server.url("/job"))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(server.request_count(), 1);
        assert_eq!(policy.checks().len(), 2);
    }

    #[tokio::test]
    async fn fails_on_a_redirect_with_no_location() {
        let err = resolve_page(StubReply::text(302, "")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::ServiceUnavailable);
        assert_eq!(err.to_string(), "Could not fetch the job posting");
    }

    #[tokio::test]
    async fn gives_up_after_too_many_redirects() {
        let server = StubServer::start(vec![StubReply::redirect(302, "/again")]).await;
        let (resolver, policy) = resolver(RecordingOutboundUrlPolicy::allow_all());

        let err = resolver.resolve(link(&server.url("/job"))).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::ServiceUnavailable);
        assert_eq!(err.to_string(), "The job posting link redirected too many times");
        assert_eq!(server.request_count(), MAX_REDIRECTS + 1);
        assert_eq!(policy.checks().len(), MAX_REDIRECTS + 1);
    }

    #[tokio::test]
    async fn fails_with_a_coded_error_when_the_fetch_is_not_ok() {
        let err = resolve_page(StubReply::text(404, "gone")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::ServiceUnavailable);
        assert_eq!(err.to_string(), "Could not fetch the job posting (HTTP 404)");
    }

    #[tokio::test]
    async fn reports_an_unreachable_host_as_an_internal_error() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/job", listener.local_addr().unwrap());
        drop(listener);
        let (resolver, _) = resolver(RecordingOutboundUrlPolicy::allow_all());

        let err = resolver.resolve(link(&url)).await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(!err.to_string().contains("127.0.0.1"));
    }

    #[tokio::test]
    async fn rejects_a_response_that_is_not_a_web_page() {
        let reply = StubReply::text(200, "%PDF-1.4").with_header("content-type", "application/pdf");
        let err = resolve_page(reply).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
        assert_eq!(err.to_string(), "The link did not return a web page");
    }

    #[tokio::test]
    async fn rejects_a_response_with_no_content_type() {
        let err = resolve_page(StubReply::text(200, "hello")).await.unwrap_err();
        assert_eq!(err.code(), ErrorCode::Validation);
    }

    #[tokio::test]
    async fn accepts_plain_text() {
        let reply =
            StubReply::text(200, "Senior Engineer").with_header("content-type", "text/plain");
        assert_eq!(resolve_page(reply).await.unwrap(), "Senior Engineer");
    }

    #[tokio::test]
    async fn reads_at_most_max_bytes_of_the_body() {
        let huge = format!("<p>{}</p>", "a".repeat(MAX_BYTES * 2));
        let result = resolve_page(StubReply::html(huge)).await.unwrap();
        // The cut lands inside the text, so the `<p>` that opened it is all
        // that is stripped.
        assert_eq!(result.len(), MAX_BYTES - "<p>".len());
    }

    #[tokio::test]
    async fn keeps_only_the_main_or_article_region_when_the_page_marks_one() {
        let posting = "We are hiring a Staff Engineer to lead the platform team. ".repeat(8);
        let page = format!(
            "<html><body><nav>Home Jobs Login</nav><main><h1>Staff Engineer</h1><p>{posting}</p></main><footer>Cookie policy · Similar roles</footer></body></html>"
        );
        let result = resolve_page(StubReply::html(page)).await.unwrap();
        assert!(result.contains("Staff Engineer"));
        assert!(!result.contains("Cookie policy"));
        assert!(!result.contains("Home Jobs Login"));
    }

    #[tokio::test]
    async fn falls_back_to_the_whole_page_when_the_content_region_is_only_a_template_shell() {
        let page = "<html><body><main></main><div id=\"app\"><p>Senior Engineer at Acme</p></div></body></html>";
        assert_eq!(resolve_page(StubReply::html(page)).await.unwrap(), "Senior Engineer at Acme");
    }

    #[tokio::test]
    async fn decodes_common_html_entities() {
        let page = "<p>Acme &amp; Co &lt;engineer&gt; &quot;remote&quot;</p>";
        assert_eq!(
            resolve_page(StubReply::html(page)).await.unwrap(),
            "Acme & Co <engineer> \"remote\""
        );
    }

    #[test]
    fn picks_the_largest_content_region_and_matches_tags_case_insensitively() {
        let short = "a".repeat(MIN_CONTENT_REGION_CHARS);
        let long = "b".repeat(MIN_CONTENT_REGION_CHARS + 1);
        let page = format!(
            "<nav>menu</nav><ARTICLE class=\"x\">{short}</Article><Main>{long}</MAIN><mainframe>no</mainframe>"
        );
        assert_eq!(strip_html(&page), long);
    }

    #[test]
    fn a_content_region_that_never_closes_is_ignored() {
        let text = "c".repeat(MIN_CONTENT_REGION_CHARS);
        assert_eq!(strip_html(&format!("<p>before</p><main>{text}")), format!("before {text}"));
    }

    #[test]
    fn to_text_drops_scripts_and_styles_and_collapses_whitespace() {
        let html = "<STYLE>p { color: red }</style><p>one</p>\n\n  <script type=\"x\">var a = '<b>';</SCRIPT><p>two\nthree</p>";
        assert_eq!(to_text(html), "one two\nthree");
    }

    #[test]
    fn to_text_leaves_unclosed_or_empty_brackets_alone() {
        assert_eq!(to_text("a <> b"), "a <> b");
        assert_eq!(to_text("1 < 2"), "1 < 2");
        assert_eq!(to_text("<script>never closed"), "never closed");
        assert_eq!(to_text("x&nbsp;&amp;lt;y"), "x <y");
    }

    #[test]
    fn recognises_web_page_content_types() {
        assert!(is_web_page("text/html"));
        assert!(is_web_page("TEXT/HTML; charset=utf-8"));
        assert!(is_web_page("text/plain;charset=utf-8"));
        assert!(!is_web_page("text/htmlx"));
        assert!(!is_web_page("application/json"));
        assert!(!is_web_page(" text/html"));
        assert!(!is_web_page(""));
    }
}
