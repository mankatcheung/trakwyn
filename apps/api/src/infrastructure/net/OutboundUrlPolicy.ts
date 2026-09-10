import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type {
  IOutboundUrlPolicy,
  OutboundUrlPurpose,
} from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import {
  ENV,
  NODE_ENV,
  OUTBOUND_URL,
  OUTBOUND_URL_POLICY,
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
 * IPv4 ranges that are never a legitimate LLM endpoint or job board: this
 * host, RFC1918, link-local (where cloud metadata services live), CGNAT,
 * and multicast/reserved.
 */
function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateV6(ip: string): boolean {
  const v6 = ip.toLowerCase();
  // IPv4-mapped addresses (::ffff:10.0.0.1) are checked as the IPv4 they wrap.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateV4(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80') ||
    v6.startsWith('ff')
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}

/**
 * The one place that decides where the server will connect on a user's
 * behalf — see `IOutboundUrlPolicy` for why there is one at all.
 *
 * Resolves DNS itself rather than trusting the hostname's spelling, so a
 * name that points at 169.254.169.254 is refused the same as the literal.
 * The check is repeated at request time by the callers precisely because a
 * resolution can change after the URL was saved.
 */
export class OutboundUrlPolicy implements IOutboundUrlPolicy {
  private readonly strict: boolean;
  private readonly lookup: Lookup;

  constructor(options: OutboundUrlPolicyOptions = {}) {
    this.strict = options.strict ?? strictFromEnv();
    this.lookup = options.lookup ?? defaultLookup;
  }

  async assertAllowed(raw: string, purpose: OutboundUrlPurpose): Promise<void> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ValidationError('URL is not valid');
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new ValidationError('URL must use http or https');
    }
    if (url.username || url.password) {
      throw new ValidationError('URL must not contain credentials');
    }
    if (!this.strict) return;

    // A provider endpoint carries the user's API key on every call, and the
    // server will keep calling it for as long as the key is saved: plaintext
    // http is not an acceptable transport for that. A job posting is a
    // public page read once, and plenty of them are still served over http.
    if (purpose === 'llm-provider' && url.protocol !== 'https:') {
      throw new ValidationError('Provider base URL must use https');
    }

    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if ((OUTBOUND_URL.BLOCKED_PORTS as readonly number[]).includes(port)) {
      throw new ValidationError('URL port is not allowed');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      throw new ValidationError('URL host is not allowed');
    }

    let addresses: string[];
    if (isIP(hostname)) {
      addresses = [hostname];
    } else {
      try {
        addresses = await this.lookup(hostname);
      } catch {
        throw new ValidationError('URL host could not be resolved');
      }
    }
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new ValidationError('URL host is not allowed');
    }
  }
}
