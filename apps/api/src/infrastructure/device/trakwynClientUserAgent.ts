/** The parts of a Trakwyn mobile app User-Agent. An empty part is `undefined`. */
export interface TrakwynClientUserAgent {
  version: string;
  model?: string;
  /** The whole OS part, e.g. `iOS 17.4`. */
  os?: string;
  osName?: string;
  osVersion?: string;
}

const MOBILE_USER_AGENT = /^TrakwynMobile\/(\S+)\s+\(([^;)]*);([^)]*)\)/;

function present(part: string | undefined): string | undefined {
  const trimmed = part?.trim();
  return trimmed ? trimmed : undefined;
}

/** `iOS 17.4` → `iOS` / `17.4`; `Android` → `Android` with no version. */
function splitOs(os: string): { osName: string; osVersion?: string } {
  const lastSpace = os.lastIndexOf(' ');
  if (lastSpace === -1) return { osName: os };
  return { osName: os.slice(0, lastSpace), osVersion: os.slice(lastSpace + 1) };
}

/**
 * Parses the User-Agent apps/mobile sends,
 * `TrakwynMobile/<version> (<model>; <os> <os version>)` (src/lib/userAgent.ts),
 * or returns null for any other client. Shared by the session label
 * (DeviceLabelService) and the span attributes (clientIdentity.ts) so the two
 * cannot read the format differently.
 */
export function parseTrakwynClientUserAgent(
  userAgent: string | null | undefined,
): TrakwynClientUserAgent | null {
  const m = userAgent?.match(MOBILE_USER_AGENT);
  if (!m?.[1]) return null;

  const os = present(m[3]);
  return {
    version: m[1],
    model: present(m[2]),
    os,
    ...(os ? splitOs(os) : {}),
  };
}
