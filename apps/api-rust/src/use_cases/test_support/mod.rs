//! In-memory doubles for the ports, one module per domain, for use-case
//! tests. Cross-cutting doubles (tokens, blocklist, ids) are in
//! `infrastructure`.

mod activity_logs;
mod applications;
mod conversations;
mod cookie_consents;
mod document_drafts;
mod documents;
mod educations;
mod infrastructure;
mod logging;
mod messages;
mod notes;
mod notifications;
mod push_subscriptions;
mod skills;
mod transactions;
mod work_experiences;

pub use activity_logs::FakeActivityLogRepository;
pub use applications::{application_owned_by, FakeApplicationRepository};
pub use conversations::FakeConversationRepository;
pub use cookie_consents::FakeCookieConsentRepository;
pub use document_drafts::FakeDocumentDraftRepository;
pub use documents::FakeDocumentRepository;
pub use educations::FakeEducationRepository;
pub use infrastructure::{sequential_ids, FakeSessionBlocklist, FakeTokenService};
pub use logging::{FakeLogger, LogLevel, LoggedLine};
pub use messages::FakeMessageRepository;
pub use notes::FakeNoteRepository;
pub use notifications::FakeNotificationRepository;
pub use push_subscriptions::FakePushSubscriptionRepository;
pub use skills::FakeSkillRepository;
pub use transactions::FakeTransactionManager;
pub use work_experiences::FakeWorkExperienceRepository;
