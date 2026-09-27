import type { IncomingMessage } from 'node:http';
import type { Attributes } from '@opentelemetry/api';
import { parseTrakwynClientUserAgent } from '#src/infrastructure/device/trakwynClientUserAgent.js';

/**
 * Attribute keys for the mobile app's build (JEF-376). `device.*` and `os.*`
 * are the OTel semantic conventions, spelled out rather than imported from the
 * unstable `incubating` entry point. Kept beside their only writer, as
 * `LLM_SPAN` is beside `TracingLLMProvider`.
 */
export const CLIENT_SPAN = {
  CLIENT_NAME: 'app.client.name',
  CLIENT_VERSION: 'app.client.version',
  DEVICE_MODEL: 'device.model.name',
  OS_NAME: 'os.name',
  OS_VERSION: 'os.version',
  MOBILE_CLIENT_NAME: 'trakwyn-mobile',
} as const;

/**
 * Records which build of the mobile app sent a request, as fields on its HTTP
 * server span, so Axiom can filter and group by app version, device model and
 * OS without a regex over `user_agent.original`.
 *
 * Only the Trakwyn mobile User-Agent is read; browsers, the CLI and the
 * extension get no attributes. A part the app left empty (Expo reports no
 * model on some devices) is left off rather than recorded as `""`.
 */
export function clientIdentitySpanAttributes(
  request: Pick<IncomingMessage, 'headers'>,
): Attributes {
  const client = parseTrakwynClientUserAgent(request.headers['user-agent']);
  if (!client) return {};

  return {
    [CLIENT_SPAN.CLIENT_NAME]: CLIENT_SPAN.MOBILE_CLIENT_NAME,
    [CLIENT_SPAN.CLIENT_VERSION]: client.version,
    ...(client.model && { [CLIENT_SPAN.DEVICE_MODEL]: client.model }),
    ...(client.osName && { [CLIENT_SPAN.OS_NAME]: client.osName }),
    ...(client.osVersion && { [CLIENT_SPAN.OS_VERSION]: client.osVersion }),
  };
}
