export const SECURITY_EVENT_TYPES = [
  'password_changed',
  'email_changed',
  'totp_enabled',
  'totp_disabled',
  'totp_backup_codes_regenerated',
  'session_revoked',
  'other_sessions_revoked',
  'mcp_oauth_authorized',
  'mcp_oauth_token_issued',
  'mcp_oauth_refresh_reuse_detected',
  'mcp_oauth_code_reuse_detected',
  'mcp_oauth_token_revoked',
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/**
 * The event types that indicate a possible attack rather than a user acting
 * on their own account (JEF-354): a reused one-time credential means a copy
 * of it exists somewhere it should not. Declared here, beside the full list,
 * so the log level each type gets is decided once.
 */
export const SUSPICIOUS_SECURITY_EVENT_TYPES: ReadonlySet<SecurityEventType> = new Set([
  'mcp_oauth_refresh_reuse_detected',
  'mcp_oauth_code_reuse_detected',
]);

export type SecurityEvent = {
  id: string;
  userId: string;
  eventType: SecurityEventType;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};
