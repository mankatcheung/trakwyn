import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type {
  IOutboundUrlPolicy,
  OutboundUrlPurpose,
} from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import {
  otelMetrics,
  type IMetrics,
  type OutboundUrlRefusalReason,
} from '#src/infrastructure/observability/metrics.js';
import {
  ENV,
  NODE_ENV,
  OUTBOUND_URL,
  OUTBOUND_URL_POLICY,
  SECURITY_EVENTS,
} from '#src/infrastructure/config/constants.js';

type Lookup = (hostname: string) => Promise<string[]>;

export interface OutboundUrlPolicyOptions {
  /**
   * Refuse private, loopback and link-local destinations. Defaults to the
   * `OUTBOUND_URL_POLICY` env var when set (`strict` | `permissive`), else
   * to `NODE_ENV === 'production'`: in production the server's own network
   * is exactly what an SSRF is after, while a developer's laptop or CI is
   * theirs to point at — the e2e suite runs the "Custom (OpenAI-compatible)"
   * provider against the API's own fake completions route on localhost, and
   * a developer running Ollama does the same. The env override is for a
   * self-hosted production instance that deliberately wants a local model
   * reachable (F13).
   */
  strict?: boolean;
  /** Injectable for tests; defaults to a real DNS lookup returning every address. */
  lookup?: Lookup;
  /** Where refusals are reported (JEF-350). Optional so tests that only assert the throw need not supply one. */
  logger?: ILogger;
  metrics?: IMetrics;
}

function strictFromEnv(): boolean {
  const configured = process.env[ENV.OUTBOUND_URL_POLICY];
  if (configured === OUTBOUND_URL_POLICY.STRICT) return true;
  if (configured === OUTBOUND_URL_POLICY.PERMISSIVE) return false;
  return process.env[ENV.NODE_ENV] === NODE_ENV.PRODUCTION;
}

const defaultLookup: Lookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true })).map((entry) => entry.address);

/**
 * Which reserved range an address falls in. Reported alongside a refusal so
 * a probe at cloud metadata (`link_local`) is distinguishable from someone
 * pointing at their own laptop (`loopback`) — the two mean very different
 * things when they show up in production.
 */
export type AddressClass =
  | 'loopback'
  | 'rfc1918'
  | 'link_local'
  | 'cgnat'
  | 'ula'
  | 'multicast'
  | 'unspecified'
  | 'public'
  | 'not_an_ip';

function classifyV4(ip: string): AddressClass {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'link_local';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'rfc1918';
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat';
  if (a >= 224) return 'multicast';
  return 'public';
}

function classifyV6(ip: string): AddressClass {
  const v6 = ip.toLowerCase();
  // IPv4-mapped addresses (::ffff:10.0.0.1) are classified as the IPv4 they wrap.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return classifyV4(mapped[1] as string);
  if (v6 === '::') return 'unspecified';
  if (v6 === '::1') return 'loopback';
  if (v6.startsWith('fe80')) return 'link_local';
  if (v6.startsWith('fc') || v6.startsWith('fd')) return 'ula';
  if (v6.startsWith('ff')) return 'multicast';
  return 'public';
}

/**
 * The single source of truth for both the allow/deny decision and the class
 * reported with a refusal — so the two can never disagree about what an
 * address is. Anything unparseable is `not_an_ip`, which fails closed.
 */
export function classifyAddress(ip: string): AddressClass {
  const version = isIP(ip);
  if (version === 4) return classifyV4(ip);
  if (version === 6) return classifyV6(ip);
  return 'not_an_ip';
}

export function isPrivateAddress(ip: string): boolean {
  return classifyAddress(ip) !== 'public';
}

/** What a refusal is allowed to say about the URL. Never the URL itself. */
interface RefusalContext {
  hostname?: string;
  port?: number;
  addressClass?: AddressClass;
}

/**
 * The one place that decides where the server will connect on a user's
 * behalf — see `IOutboundUrlPolicy` for why there is one at all.
 *
 * Resolves DNS itself rather than trusting the hostname's spelling, so a
 * name that points at 169.254.169.254 is refused the same as the literal.
 * The check is repeated at request time by the callers precisely because a
 * resolution can change after the URL was saved.
 *
 * Every refusal is logged and counted (JEF-350). Because all four check
 * sites — `SaveLlmApiKeyUseCase` and `TestLlmApiKeyUseCase` at save time,
 * `OpenAICompatibleLLMProvider` and `FetchJobPostingSourceResolver` (per
 * redirect hop) at call time — share this one injected instance, doing it
 * here covers all of them without any of them knowing.
 *
 * **What is reported is deliberately narrow:** hostname, port, the resolved
 * address class and a reason code. Not the URL — a job-posting link carries
 * a query string, and query strings carry user data (JEF-348).
 */
export class OutboundUrlPolicy implements IOutboundUrlPolicy {
  private readonly strict: boolean;
  private readonly lookup: Lookup;
  private readonly logger?: ILogger;
  private readonly metrics: IMetrics;

  constructor(options: OutboundUrlPolicyOptions = {}) {
    this.strict = options.strict ?? strictFromEnv();
    this.lookup = options.lookup ?? defaultLookup;
    this.logger = options.logger;
    this.metrics = options.metrics ?? otelMetrics;
  }

  private refuse(
    message: string,
    reason: OutboundUrlRefusalReason,
    purpose: OutboundUrlPurpose,
    context: RefusalContext = {},
  ): never {
    this.logger?.warn('Outbound URL refused', {
      event: SECURITY_EVENTS.OUTBOUND_URL_REFUSED,
      reason,
      purpose,
      ...(context.hostname === undefined ? {} : { hostname: context.hostname }),
      ...(context.port === undefined ? {} : { port: context.port }),
      ...(context.addressClass === undefined ? {} : { addressClass: context.addressClass }),
    });
    this.metrics.recordOutboundUrlRefused(reason, purpose);
    throw new ValidationError(message);
  }

  async assertAllowed(raw: string, purpose: OutboundUrlPurpose): Promise<void> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      // No hostname to report: it did not parse into one.
      this.refuse('URL is not valid', 'invalid_url', purpose);
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const where: RefusalContext = { hostname, port };

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      this.refuse('URL must use http or https', 'unsupported_scheme', purpose, where);
    }
    if (url.username || url.password) {
      this.refuse('URL must not contain credentials', 'embedded_credentials', purpose, where);
    }
    if (!this.strict) return;

    // A provider endpoint carries the user's API key on every call, and the
    // server will keep calling it for as long as the key is saved: plaintext
    // http is not an acceptable transport for that. A job posting is a
    // public page read once, and plenty of them are still served over http.
    if (purpose === 'llm-provider' && url.protocol !== 'https:') {
      this.refuse('Provider base URL must use https', 'insecure_provider_url', purpose, where);
    }

    if ((OUTBOUND_URL.BLOCKED_PORTS as readonly number[]).includes(port)) {
      this.refuse('URL port is not allowed', 'blocked_port', purpose, where);
    }

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      this.refuse('URL host is not allowed', 'reserved_hostname', purpose, where);
    }

    let addresses: string[];
    if (isIP(hostname)) {
      addresses = [hostname];
    } else {
      try {
        addresses = await this.lookup(hostname);
      } catch {
        this.refuse('URL host could not be resolved', 'unresolvable_host', purpose, where);
      }
    }

    // An empty answer is reported as `not_an_ip` for the same reason
    // `classifyAddress` returns it: nothing usable came back, so fail closed.
    const blocked = addresses.map(classifyAddress).find((cls) => cls !== 'public');
    if (addresses.length === 0 || blocked) {
      this.refuse('URL host is not allowed', 'private_address', purpose, {
        ...where,
        addressClass: blocked ?? 'not_an_ip',
      });
    }
  }
}
