import type {
  EmailOutcome,
  EmailTemplate,
  FailOpenReason,
  IMetrics,
  MetricComponent,
  OutboundUrlRefusalReason,
  RateLimitSubject,
} from '#src/infrastructure/observability/metrics.js';
import type { OutboundUrlPurpose } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { SecurityEventType } from '#src/domain/securityEvent/SecurityEvent.js';

export interface FailOpenEvent {
  component: MetricComponent;
  reason: FailOpenReason;
}

export interface CircuitTransitionEvent {
  component: MetricComponent;
  from: string;
  to: string;
}

export interface RateLimitedEvent {
  route: string;
  subject: RateLimitSubject;
}

export interface OutboundUrlRefusedEvent {
  reason: OutboundUrlRefusalReason;
  purpose: OutboundUrlPurpose;
}

export interface EmailSentEvent {
  template: EmailTemplate;
  outcome: EmailOutcome;
}

export interface FakeMetrics extends IMetrics {
  hits: number;
  misses: number;
  failOpens: FailOpenEvent[];
  circuitTransitions: CircuitTransitionEvent[];
  databasePoolErrors: number;
  rateLimited: RateLimitedEvent[];
  outboundUrlRefused: OutboundUrlRefusedEvent[];
  emailsSent: EmailSentEvent[];
  securityEvents: SecurityEventType[];
}

/**
 * Recording IMetrics stand-in — lets tests assert on what was measured
 * without standing up an OTel SDK and an in-memory metric reader.
 */
export function makeFakeMetrics(): FakeMetrics {
  const fake: FakeMetrics = {
    hits: 0,
    misses: 0,
    failOpens: [],
    circuitTransitions: [],
    databasePoolErrors: 0,
    rateLimited: [],
    outboundUrlRefused: [],
    emailsSent: [],
    securityEvents: [],
    recordCacheHit: () => {
      fake.hits++;
    },
    recordCacheMiss: () => {
      fake.misses++;
    },
    recordFailOpen: (component, reason) => {
      fake.failOpens.push({ component, reason });
    },
    recordCircuitTransition: (component, from, to) => {
      fake.circuitTransitions.push({ component, from, to });
    },
    recordDatabasePoolError: () => {
      fake.databasePoolErrors++;
    },
    recordRateLimited: (route, subject) => {
      fake.rateLimited.push({ route, subject });
    },
    recordOutboundUrlRefused: (reason, purpose) => {
      fake.outboundUrlRefused.push({ reason, purpose });
    },
    recordEmailSent: (template, outcome) => {
      fake.emailsSent.push({ template, outcome });
    },
    recordSecurityEvent: (type) => {
      fake.securityEvents.push(type);
    },
  };
  return fake;
}
