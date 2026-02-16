/**
 * Simplified Search Tool Configuration
 * Focuses on Tavily and Serper as primary providers
 */

import { z } from 'zod';

export type SearchProvider = 'exa' | 'tavily' | 'serper' | 'duckduckgo';

export const SearchConfigSchema = z.object({
  exaApiKey: z.string().optional(),
  tavilyApiKey: z.string().optional(),
  serperApiKey: z.string().optional(),
  defaultProvider: z.enum(['exa', 'tavily', 'serper', 'duckduckgo', 'auto']).default('auto'),
  enableFallback: z.boolean().default(true),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

// Provider metadata
export const SEARCH_PROVIDERS = {
  exa: {
    name: 'Exa',
    endpoint: 'https://api.exa.ai/search',
    envVar: 'EXA_API_KEY',
    priority: 0, // Highest priority - semantic/neural search preferred for AI agents
  },
  tavily: {
    name: 'Tavily',
    endpoint: 'https://api.tavily.com/search',
    envVar: 'TAVILY_API_KEY',
    priority: 1,
  },
  serper: {
    name: 'Serper',
    endpoint: 'https://google.serper.dev/search',
    envVar: 'SERPER_API_KEY',
    priority: 2,
  },
  duckduckgo: {
    name: 'DuckDuckGo',
    endpoint: 'https://html.duckduckgo.com/html/',
    envVar: '', // No API key required — zero-config fallback
    priority: 10, // Lowest priority: keyed providers always preferred
  },
} as const;

/**
 * Simplified Search Configuration Manager
 */
export class SearchConfigManager {
  private config: SearchConfig;

  constructor(config?: Partial<SearchConfig>) {
    this.config = SearchConfigSchema.parse(config || {});
  }

  getApiKey(provider: SearchProvider): string | null {
    // First check config, then fall back to env vars
    if (provider === 'exa' && this.config.exaApiKey) {
      return this.config.exaApiKey;
    }
    if (provider === 'tavily' && this.config.tavilyApiKey) {
      return this.config.tavilyApiKey;
    }
    if (provider === 'serper' && this.config.serperApiKey) {
      return this.config.serperApiKey;
    }

    // Fall back to environment variable
    return process.env[SEARCH_PROVIDERS[provider].envVar] || null;
  }

  isProviderAvailable(provider: SearchProvider): boolean {
    // DuckDuckGo is always available (no API key required)
    if (provider === 'duckduckgo') return true;
    return !!this.getApiKey(provider);
  }

  getAvailableProviders(): SearchProvider[] {
    return (Object.keys(SEARCH_PROVIDERS) as SearchProvider[])
      .filter(p => this.isProviderAvailable(p))
      .sort((a, b) => SEARCH_PROVIDERS[a].priority - SEARCH_PROVIDERS[b].priority);
  }

  selectProvider(): SearchProvider | null {
    if (this.config.defaultProvider !== 'auto') {
      const provider = this.config.defaultProvider;
      if (this.isProviderAvailable(provider)) {
        return provider;
      }
    }

    const available = this.getAvailableProviders();
    return available[0] || null;
  }

  getFallbackProvider(excludeProvider: SearchProvider): SearchProvider | null {
    if (!this.config.enableFallback) return null;

    const available = this.getAvailableProviders();
    return available.find(p => p !== excludeProvider) || null;
  }

  isSearchAvailable(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  getStatus() {
    const providers = (Object.keys(SEARCH_PROVIDERS) as SearchProvider[]).map(id => ({
      id,
      name: SEARCH_PROVIDERS[id].name,
      configured: !!this.getApiKey(id),
      available: this.isProviderAvailable(id),
    }));

    return {
      available: this.isSearchAvailable(),
      providers,
      defaultProvider: this.config.defaultProvider,
      selectedProvider: this.selectProvider(),
    };
  }
}