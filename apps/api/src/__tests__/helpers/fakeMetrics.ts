import type {
  BreakerOpenReason,
  CostMismatchDirection,
  DatabasePoolState,
  EmailOutcome,
  EmailTemplate,
  FailOpenReason,
  IMetrics,
  LlmCallMetric,
  LlmCostMetric,
  LlmTokenDirection,
  MetricComponent,
  OutboundUrlRefusalReason,
  PoolAcquirePhase,
  RateLimitSubject,
  GraphqlClientKind,
} from '#src/infrastructure/observability/metrics.js';
import type { OutboundUrlPurpose } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { SecurityEventType } from '#src/domain/securityEvent/SecurityEvent.js';
import type { ApiTokenScope } from '#src/domain/apiToken/ApiToken.js';
import type { ToolCallOutcome, ToolSurface } from '#src/use-cases/ports/IToolCallObserver.js';

export interface GraphqlValidationFailureEvent {
  client: GraphqlClientKind;
  clientVersion?: string;
}

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

export interface ToolCallEvent {
  surface: ToolSurface;
  tool: string;
  outcome: ToolCallOutcome;
}

export interface McpToolRefusedEvent {
  tool: string;
  scope: ApiTokenScope;
}

export interface LlmTokensEvent {
  provider: string;
  direction: LlmTokenDirection;
  count: number;
}

export interface FakeMetrics extends IMetrics {
  hits: number;
  misses: number;
  failOpens: FailOpenEvent[];
  circuitTransitions: CircuitTransitionEvent[];
  databasePoolErrors: number;
  /** The `read` callbacks handed to `observeDatabasePool` — call one to see what the gauge would export. */
  databasePoolObservers: Array<() => DatabasePoolState>;
  databasePoolAcquireTimeouts: PoolAcquirePhase[];
  rateLimited: RateLimitedEvent[];
  outboundUrlRefused: OutboundUrlRefusedEvent[];
  emailsSent: EmailSentEvent[];
  securityEvents: SecurityEventType[];
  toolCalls: ToolCallEvent[];
  mcpToolRefused: McpToolRefusedEvent[];
  graphqlValidationFailures: GraphqlValidationFailureEvent[];
  llmCalls: LlmCallMetric[];
  llmTokens: LlmTokensEvent[];
  llmCosts: LlmCostMetric[];
  llmNeuronCosts: Array<{ model: string | null; feature: string; costMicros: number }>;
  llmCostMismatches: Array<{ model: string | null; direction: CostMismatchDirection }>;
  breakerOpens: BreakerOpenReason[];
  hostedCircuitTransitions: Array<{ model: string; from: string; to: string }>;
  hostedCircuitShortCircuits: string[];
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
    databasePoolObservers: [],
    databasePoolAcquireTimeouts: [],
    rateLimited: [],
    outboundUrlRefused: [],
    emailsSent: [],
    securityEvents: [],
    toolCalls: [],
    mcpToolRefused: [],
    graphqlValidationFailures: [],
    llmCalls: [],
    llmTokens: [],
    llmCosts: [],
    llmNeuronCosts: [],
    llmCostMismatches: [],
    breakerOpens: [],
    hostedCircuitTransitions: [],
    hostedCircuitShortCircuits: [],
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
    observeDatabasePool: (read) => {
      fake.databasePoolObservers.push(read);
    },
    recordDatabasePoolAcquireTimeout: (phase) => {
      fake.databasePoolAcquireTimeouts.push(phase);
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
    recordToolCall: (surface, tool, outcome) => {
      fake.toolCalls.push({ surface, tool, outcome });
    },
    recordMcpToolRefused: (tool, scope) => {
      fake.mcpToolRefused.push({ tool, scope });
    },
    recordGraphqlValidationFailure: (client, clientVersion) => {
      fake.graphqlValidationFailures.push({ client, clientVersion });
    },
    recordLlmCall: (call) => {
      fake.llmCalls.push(call);
    },
    recordLlmTokens: (provider, direction, count) => {
      fake.llmTokens.push({ provider, direction, count });
    },
    recordLlmNeuronCost: (model, feature, costMicros) => {
      fake.llmNeuronCosts.push({ model, feature, costMicros });
    },
    recordLlmCostMismatch: (model, direction) => {
      fake.llmCostMismatches.push({ model, direction });
    },
    recordLlmCost: (cost) => {
      fake.llmCosts.push(cost);
    },
    recordHostedAiBreakerOpen: (reason) => {
      fake.breakerOpens.push(reason);
    },
    recordHostedAiCircuitTransition: (model, from, to) => {
      fake.hostedCircuitTransitions.push({ model, from, to });
    },
    recordHostedAiCircuitShortCircuit: (model) => {
      fake.hostedCircuitShortCircuits.push(model);
    },
  };
  return fake;
}
