/**
 * Proxy-aware Fetch Utility
 *
 * Creates a custom `fetch` function that routes requests through an HTTP proxy
 * (e.g., Clash Verge, V2Ray) when configured. This is passed to AI SDK providers
 * so all model API calls can be proxied for region-restricted access.
 */

import { ProxyAgent } from "undici";

export interface ProxyConfig {
  /** Proxy server URL, e.g. "http://127.0.0.1:7890" */
  proxyUrl?: string | null;
  /** Whether proxying is enabled */
  proxyEnabled?: boolean;
}

/**
 * Create a fetch function that routes through a proxy when configured.
 * Returns the native `globalThis.fetch` when proxy is disabled or not configured.
 */
export function createProxyFetch(config: ProxyConfig): typeof fetch {
  if (!config.proxyEnabled || !config.proxyUrl) {
    return globalThis.fetch;
  }

  const url = config.proxyUrl.trim();
  if (!url) {
    return globalThis.fetch;
  }

  try {
    const agent = new ProxyAgent(url);
    return ((input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, {
        ...init,
        // @ts-expect-error -- Node.js 22 supports `dispatcher` via undici but it's not in the DOM RequestInit type
        dispatcher: agent,
      })) as typeof fetch;
  } catch {
    // If ProxyAgent creation fails (e.g., invalid URL), fall back to native fetch
    console.warn(`[proxy-fetch] Failed to create proxy agent for "${url}", falling back to native fetch`);
    return globalThis.fetch;
  }
}
