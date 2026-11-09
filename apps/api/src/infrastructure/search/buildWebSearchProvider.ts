import type { IWebSearchProvider } from '#src/use-cases/ports/IWebSearchProvider.js';
import { ENV, SEARCH_PROVIDER } from '#src/infrastructure/config/constants.js';
import { FakeWebSearchProvider } from './FakeWebSearchProvider.js';
import { TavilyWebSearchProvider } from './TavilyWebSearchProvider.js';

/**
 * The search provider `SEARCH_PROVIDER` names, or `null` for none (JEF-538).
 * `tavily` without a `TAVILY_API_KEY` is none as well, so an instance that
 * never set a key carries on exactly as before search existed, with no call
 * leaving the process. Unset is none: search is opt-in, and costs money.
 */
export function buildWebSearchProvider(
  env: NodeJS.ProcessEnv = process.env,
): IWebSearchProvider | null {
  switch (env[ENV.SEARCH_PROVIDER]) {
    case SEARCH_PROVIDER.TAVILY: {
      const apiKey = env[ENV.TAVILY_API_KEY]?.trim();
      return apiKey ? new TavilyWebSearchProvider({ apiKey }) : null;
    }
    case SEARCH_PROVIDER.FAKE:
      return new FakeWebSearchProvider();
    default:
      return null;
  }
}
