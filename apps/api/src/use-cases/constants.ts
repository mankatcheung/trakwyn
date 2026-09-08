/**
 * Application-policy constants: the rules the use-case layer enforces.
 *
 * Everything here is a business decision — how long a token stays valid, how
 * many applications a user may hold, how much job-description text is worth
 * sending to a model. None of it names a transport, a cookie, a route, or a
 * vendor endpoint; those belong to `http/constants.ts` and
 * `infrastructure/config/constants.ts` respectively, which may import this
 * file but never the other way round.
 *
 * Split out of the former root-level `src/constants.ts` (JEF-253), which mixed
 * all three concerns in one module that 23% of the package imported.
 */

/**
 * Access- and refresh-token lifetimes, in seconds. The source of truth for
 * how long a session lives.
 *
 * `http/constants.ts` re-exports this as `COOKIE_MAX_AGE_S` for the cookies
 * that carry the tokens, and `SESSION`/`SESSION_BLOCKLIST` derive their own
 * windows from it — so the lifetime is stated once and every consumer follows
 * it, rather than each restating 15 minutes and 7 days.
 */
export const TOKEN_LIFETIME_S = {
  ACCESS_TOKEN: 15 * 60, // 15 minutes
  REFRESH_TOKEN: 7 * 24 * 60 * 60, // 7 days
} as const;

/** JWT sign expiry strings (jsonwebtoken format). */
export const JWT_EXPIRY = {
  ACCESS: '15m',
  REFRESH: '7d',
} as const;

/** Session (device/refresh-token tracking) settings. */
export const SESSION = {
  /** How long a session stays active without a refresh, in milliseconds — mirrors the refresh JWT's lifetime and slides forward on each refresh. */
  TTL_MS: TOKEN_LIFETIME_S.REFRESH_TOKEN * 1000,
  /** Window after a rotation in which the just-superseded refresh token is still accepted, to absorb benign concurrent-tab refresh races without flagging them as reuse. */
  ROTATION_GRACE_MS: 10 * 1000,
} as const;

/**
 * Step-up re-authentication settings (JEF-44). `authTime` — the epoch-ms of a
 * session's last full authentication (login or step-up reauth) — is carried
 * through the JWT and preserved across refreshes. For 2FA-enabled accounts,
 * sensitive account changes (email/password change, account deletion)
 * require `authTime` to be within this window, or a fresh TOTP step-up via
 * the `reauthenticate` mutation. Non-2FA accounts already re-verify their
 * password inline on every such mutation, so freshness adds no extra check
 * for them.
 */
export const REAUTH = {
  FRESHNESS_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
} as const;

/** API-token (`trakwyn_...`) settings. */
export const API_TOKEN = {
  PREFIX: 'trakwyn_',
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 24,
} as const;

/** Read-only share-link (`jfsl_...`) settings — see ShareLink domain entity. */
export const SHARE_LINK = {
  PREFIX: 'jfsl_',
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 24,
} as const;

/** Password-reset token settings. */
export const PASSWORD_RESET_TOKEN = {
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 32,
  /** How long a reset link stays valid, in milliseconds. */
  TTL_MS: 60 * 60 * 1000, // 1 hour
} as const;

/** Minimum length enforced server-side for any newly-set password. */
export const PASSWORD_MIN_LENGTH = 8;

/** API-token scopes (mirrors the `ApiTokenScope` domain union). */
export const API_TOKEN_SCOPE = {
  FULL: 'full',
  READ: 'read',
} as const;

/** Backup/recovery codes issued alongside TOTP enrollment. */
export const TOTP_BACKUP_CODES = {
  /** How many single-use codes to generate at enrollment. */
  COUNT: 10,
  /** Number of random bytes hex-encoded into each code (16 hex chars). */
  RANDOM_BYTES: 8,
} as const;

/** Email-verification token settings. */
export const EMAIL_VERIFICATION_TOKEN = {
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 32,
  /** How long a verification link stays valid, in milliseconds. */
  TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/** Backup email verification token settings. */
export const BACKUP_EMAIL_VERIFICATION_TOKEN = {
  /** Number of random bytes hex-encoded into the token body. */
  RANDOM_BYTES: 32,
  /** How long a verification link stays valid, in milliseconds. */
  TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

/** `LLM_PROVIDER` values. */
export const LLM_PROVIDER = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLEAI: 'googleai',
  OPENROUTER: 'openrouter',
  MISTRAL: 'mistral',
  GROQ: 'groq',
  XAI: 'xai',
  DEEPSEEK: 'deepseek',
  NVIDIA: 'nvidia',
  CUSTOM: 'custom',
} as const;

/** LLM provider API URLs, default models, and other per-provider settings. */
export const LLM = {
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  /**
   * OpenAI's cost-tier model per its current model list (F11, checked
   * 2026-09-06); `gpt-4o-mini` is no longer listed there. OpenRouter keeps
   * its own id below until its catalogue is confirmed.
   */
  OPENAI_DEFAULT_MODEL: 'gpt-5.6-luna',
  ANTHROPIC_API_URL: 'https://api.anthropic.com/v1/messages',
  /**
   * Haiku 4.5 (T4). Haiku 3.5 was cheaper per token than it looked: its
   * prompt cache needs a 2 048-token prefix and the chat's tools + system
   * block sits right at that floor, so the `cache_control` marker was often
   * a no-op. Users who pinned a model on their key are unaffected.
   */
  ANTHROPIC_DEFAULT_MODEL: 'claude-haiku-4-5',
  ANTHROPIC_VERSION: '2023-06-01',
  GOOGLEAI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models',
  /** 2.5 Flash (T4): the first Flash tier eligible for Gemini's implicit prompt caching — 2.0 was not, whatever the request did. */
  GOOGLEAI_DEFAULT_MODEL: 'gemini-2.5-flash',
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_DEFAULT_MODEL: 'openai/gpt-4o-mini',
  MISTRAL_API_URL: 'https://api.mistral.ai/v1/chat/completions',
  MISTRAL_DEFAULT_MODEL: 'mistral-small-latest',
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROQ_DEFAULT_MODEL: 'llama-3.3-70b-versatile',
  XAI_API_URL: 'https://api.x.ai/v1/chat/completions',
  /** xAI's cheapest general-purpose Grok per its model list (F11, checked 2026-09-06); `grok-2-latest` is gone from it. */
  XAI_DEFAULT_MODEL: 'grok-4.3',
  DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',
  DEEPSEEK_DEFAULT_MODEL: 'deepseek-chat',
  NVIDIA_API_URL: 'https://integrate.api.nvidia.com/v1/chat/completions',
  NVIDIA_DEFAULT_MODEL: 'meta/llama-3.1-8b-instruct',
  /** Output-token budget applied when a caller doesn't specify one. */
  DEFAULT_MAX_TOKENS: 512,
  /**
   * Output-token budget for `TestLlmApiKeyUseCase`'s "does this key work"
   * ping (JEF-247) — a cheap `complete()` call just needs to confirm the
   * request succeeds, not produce a usable reply.
   */
  TEST_API_KEY_MAX_TOKENS: 5,
  /**
   * Hard ceiling on requested output tokens (JEF-126), enforced by every
   * provider regardless of what a caller asks for — clamps `maxTokens`
   * before it reaches the LLM API, so a bug or a future call site that
   * passes an unreasonably large value can't run up cost via unbounded
   * output length. Comfortably above the largest current explicit request
   * (GenerateCoverLetterUseCase's 1024).
   */
  MAX_OUTPUT_TOKENS_CAP: 2048,
  /** Per-attempt request timeout for non-streaming provider fetches, in milliseconds (JEF-110). */
  REQUEST_TIMEOUT_MS: 45_000,
  /**
   * Idle timeout for streaming provider fetches, in milliseconds (JEF-239
   * follow-up) — resets on every chunk received (see
   * `createIdleAbortController`), so it only fires when bytes actually stop
   * arriving, not from total stream duration. A fixed-duration timeout like
   * `REQUEST_TIMEOUT_MS` would otherwise abort a healthy, actively-streaming
   * reply that simply takes longer than one request "should." Kept equal to
   * `REQUEST_TIMEOUT_MS` since it represents the same "how long is too long
   * to hear nothing" tolerance, just measured between chunks instead of once
   * for the whole call.
   */
  STREAM_IDLE_TIMEOUT_MS: 45_000,
  /** Extra attempts after the first for transient (network / 5xx) failures — 4xx responses never retry, except a 429 that names a short Retry-After (below). */
  MAX_RETRIES: 2,
  /**
   * A 429 or 503 whose `Retry-After` is at most this long is waited out and
   * retried within the same attempt budget (F7); a longer one — or a 429
   * with no header — is returned to the caller as before. Bounded so a
   * request never sits on a provider's "try again in an hour".
   */
  RETRY_AFTER_MAX_MS: 5_000,
  /** Base delay before a retry, in milliseconds; doubles each attempt (300ms, 600ms, ...). */
  RETRY_BACKOFF_BASE_MS: 300,
} as const;

/**
 * Cache-key builders. Centralising the prefixes keeps the read paths and the
 * invalidation paths in lock-step.
 */
/** Deleted applications sit in Trash this long before the purge job removes them. */
export const TRASH = {
  RETENTION_MS: 30 * 24 * 60 * 60 * 1000,
} as const;

/** Background-job and business-rule durations, in milliseconds. */
export const DURATIONS_MS = {
  WEEK: 7 * 24 * 60 * 60 * 1000, // weekly-digest window — 7 days
} as const;

/** Reminder-eligibility windows, in milliseconds (used by the application-repository query). */
export const REMINDER_WINDOW_MS = {
  DUE_WITHIN: 24 * 60 * 60 * 1000, // send when followUpAt is within 24h
  RESEND_AFTER: 23 * 60 * 60 * 1000, // don't resend within 23h
} as const;

/** Weekly-digest resend-guard window, in milliseconds. */
export const DIGEST_WINDOW_MS = {
  /** Don't resend the digest if the last send was within this window (digest cadence is 7 days). */
  RESEND_AFTER: 6 * 24 * 60 * 60 * 1000, // 6 days
  DAILY_RESEND_AFTER: 23 * 60 * 60 * 1000, // 23 hours
} as const;

export const DIGEST_FREQUENCY = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  OFF: 'off',
} as const;

/** Default field values applied when the caller omits them. */
export const DEFAULTS = {
  APPLICATION_STATUS: 'draft',
  DOCUMENT_TYPE: 'other',
  INTERVIEW_TYPE: 'other',
  INTERVIEW_OUTCOME: 'pending',
  API_TOKEN_SCOPE: API_TOKEN_SCOPE.FULL,
} as const;

/** Account security activity log settings. */
export const LOGIN_HISTORY = {
  /** Max number of recent login events surfaced to the user. */
  LIMIT: 20,
} as const;

/** Unified security activity feed (logins + password/email/2FA/session events). */
export const SECURITY_ACTIVITY = {
  /**
   * Max number of items in the merged feed, and the per-source fetch limit
   * (each source is fetched up to this many, then merged/sorted/truncated,
   * so the most recent N overall are never missed even if one source
   * dominates recent activity).
   */
  LIMIT: 20,
} as const;

/** Limits for bulk-write mutations (e.g. bulk update/delete applications). */
export const BULK_ACTIONS = {
  /** Max number of IDs accepted in a single bulk mutation call. */
  MAX_IDS: 200,
} as const;

export const BOARD = {
  /**
   * Max cards accepted in one kanban column reorder. Deliberately not
   * BULK_ACTIONS.MAX_IDS: that caps how much a user may act on at once,
   * whereas this caps a column the user did not choose the size of. A drag
   * refused because the column grew past a bulk-action limit would be a dead
   * end with nothing the user could do about it.
   */
  MAX_REORDER_IDS: 500,
} as const;

/** Notification types (mirrors the Notification.type Drizzle enum) — drives which icon the inbox shows. */
export const NOTIFICATION_TYPE = {
  INTERVIEW_REMINDER: 'interview_reminder',
  FOLLOW_UP_REMINDER: 'follow_up_reminder',
  SECURITY_ALERT: 'security_alert',
} as const;

export const DOCUMENT_TYPE = {
  RESUME: 'resume',
  COVER_LETTER: 'cover_letter',
  PORTFOLIO: 'portfolio',
  OTHER: 'other',
} as const;

/**
 * Character-truncation limits for job-description-derived content
 * interpolated into LLM prompts. Named here instead of scattered ad hoc
 * `.slice(N)` calls so token-budget decisions are visible in one place. These
 * are also exactly the fields wrapped with `wrapUntrustedContent` (see
 * JEF-112) — this content originates from an external job posting page or a
 * user paste of one, not from the requesting user's own account data.
 */
export const AI_PROMPT_INPUT = {
  /** ParseJobDescriptionUseCase — raw scraped/pasted job posting text. */
  JOB_POSTING_MAX_CHARS: 8000,
  /** GenerateCoverLetterUseCase — the application's job description field. */
  COVER_LETTER_JOB_DESCRIPTION_MAX_CHARS: 3000,
  /** GenerateCompanyBriefingUseCase — the application's job description field. */
  COMPANY_BRIEFING_JOB_DESCRIPTION_MAX_CHARS: 3000,
  /** ComputeResumeMatchScoreUseCase — the application's job description field. */
  RESUME_MATCH_JOB_DESCRIPTION_MAX_CHARS: 6000,
  /** Cover letter + resume generation — the user's notes on the application (JEF-205). */
  APPLICATION_NOTES_MAX_CHARS: 2000,
  /** Cover letter generation — the stored company briefing (JEF-205). */
  APPLICATION_BRIEFING_MAX_CHARS: 2000,
  /** Cover letter generation — opt-in cross-application context (JEF-249), notes + drafts combined. */
  CROSS_APPLICATION_CONTEXT_MAX_CHARS: 2000,
  /** Cover letter generation — how many *other* applications' notes/drafts to pull from, most recent first (JEF-249). */
  CROSS_APPLICATION_CONTEXT_MAX_APPLICATIONS: 3,
} as const;

/** In-app AI chat assistant settings. */
export const CHAT = {
  /** Hard cap on LLM<->tool round-trips within a single chat turn, to bound cost/latency. */
  MAX_TOOL_ITERATIONS: 5,
  /**
   * Longest message a user may send in one turn. Without it the only bound
   * was Fastify's 1 MB body limit — a message that size is ~250k tokens,
   * over most models' context, and it would have been stored and re-sent
   * on each of the next `MAX_HISTORY_MESSAGES` turns. Long enough to paste
   * a job description or a cover letter in full.
   */
  MAX_MESSAGE_CHARS: 8000,
  /**
   * Longest single string field a chat tool result may carry back to the
   * model, after which it is clipped with an ellipsis (T7). Generous — a
   * whole note or offer letter fits — but a bound: without it one
   * unbounded text column could cost more than the rest of the turn.
   */
  TOOL_RESULT_STRING_MAX_CHARS: 2000,
  /**
   * How much of a job description a chat list row carries (T1) — enough to
   * recognise the role, not the whole posting. `get_application` returns
   * the description up to `DETAIL_DESCRIPTION_MAX_CHARS` for questions
   * that need it.
   */
  LIST_DESCRIPTION_MAX_CHARS: 300,
  /**
   * Rows per `list_applications` page when the model does not ask for a
   * number (T5). Half of `PAGINATION.DEFAULT_LIMIT`: a chat answer
   * summarises, and a second page is one more tool call, whereas an
   * oversized first page is paid for on every later iteration of the turn.
   */
  LIST_DEFAULT_LIMIT: 10,
  /** How many result rows a persisted tool trace names before "+N more" (F10). */
  TOOL_TRACE_MAX_ROWS: 10,
  DETAIL_DESCRIPTION_MAX_CHARS: 3000,
  /** Auto-derived conversation title is truncated to this many characters of the first message. */
  TITLE_MAX_LENGTH: 50,
  /**
   * Only the most recent messages of a conversation's stored history are
   * sent back to the model on each turn — the rest is never resent (JEF-237).
   * Without this, a long-running conversation resends every prior turn on
   * every new message, so cost and latency both grow without bound as the
   * conversation gets longer. 40 messages is 20 user/assistant turns; a hard
   * cutoff rather than summarization — simpler, no extra LLM call, at the
   * cost of the assistant losing anything before the cutoff. Only what's
   * sent to the *model* is capped: `GetChatHistoryUseCase` (what the UI
   * displays) still reads the complete, uncapped history from the
   * repository — this constant is consulted only inside
   * `StreamChatWithAssistantUseCase`.
   */
  MAX_HISTORY_MESSAGES: 40,
  /**
   * The same cap by size (T6): forty messages of a few words is nothing,
   * forty pasted cover letters is not. Oldest messages are dropped first
   * until the history fits, on top of the message-count cap above. Roughly
   * 6k tokens — a long conversation still fits comfortably under it.
   */
  MAX_HISTORY_CHARS: 24_000,
} as const;

/** Defaults/limits for cursor-paginated list queries. */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/** Per-user content quotas. Counters are maintained transactionally by the repositories. */
export const CONTENT_LIMITS = {
  APPLICATIONS_PER_USER: 50,
  DOCUMENTS_PER_APPLICATION: 10,
} as const;

/** Named MIME type constants, for referencing specific types instead of repeating string literals. */
export const MIME_TYPE = {
  PDF: 'application/pdf',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TEXT_PLAIN: 'text/plain',
  PNG: 'image/png',
  JPEG: 'image/jpeg',
} as const;

/** MIME types accepted for document uploads (resumes, cover letters, portfolios). */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  MIME_TYPE.PDF,
  MIME_TYPE.DOC,
  MIME_TYPE.DOCX,
  MIME_TYPE.TEXT_PLAIN,
  MIME_TYPE.PNG,
  MIME_TYPE.JPEG,
] as const;

/** Max accepted document upload size, in bytes. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Bounds on reading an uploaded resume back for analysis
 * (`ComputeResumeMatchScoreUseCase`). The size limit is the upload cap
 * restated at read time — storage is trusted, but a stale or oversized
 * object should not be parsed on the request path — and the timeouts keep a
 * pathological PDF from holding a request open indefinitely.
 */
export const RESUME_TEXT_EXTRACTION = {
  MAX_BYTES: MAX_DOCUMENT_SIZE_BYTES,
  FETCH_TIMEOUT_MS: 15_000,
  EXTRACT_TIMEOUT_MS: 20_000,
} as const;

/** MIME types accepted for avatar/profile-photo uploads. */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Max accepted avatar upload size, in bytes. */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * MCP OAuth token and client policy: prefixes, entropy, and lifetimes.
 *
 * The endpoint *paths* that MCP clients call live in `http/constants.ts` as
 * `MCP_OAUTH_ROUTES` — those are transport. `RESOURCE` stays here because it
 * is the OAuth resource identifier (the token audience these use cases
 * validate against), not a route the server registers.
 */
export const MCP_OAUTH = {
  RESOURCE: '/mcp',
  CLIENT_ID_PREFIX: 'trakwyn_mcp_client_',
  CLIENT_ID_RANDOM_BYTES: 16,
  AUTHORIZATION_CODE_PREFIX: 'trakwyn_mcp_code_',
  AUTHORIZATION_CODE_RANDOM_BYTES: 32,
  AUTHORIZATION_CODE_TTL_MS: 5 * 60 * 1000,
  REFRESH_TOKEN_PREFIX: 'trakwyn_mcp_refresh_',
  REFRESH_TOKEN_RANDOM_BYTES: 32,
  REFRESH_TOKEN_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  ACCESS_TOKEN_PREFIX: 'trakwyn_mcp_',
  ACCESS_TOKEN_RANDOM_BYTES: 32,
  ACCESS_TOKEN_TTL_MS: 60 * 60 * 1000,
  /** How long a rendered consent screen stays submittable. */
  CONSENT_TOKEN_TTL_MS: 10 * 60 * 1000,
} as const;
