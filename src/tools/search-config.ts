/**
 * Simplified Search Tool Configuration
 * Focuses on Tavily and Serper as primary providers
 */

import { z } from 'zod';

export type SearchProvider = 'tavily' | 'serper';

export const SearchConfigSchema = z.object({
  tavilyApiKey: z.string().optional(),
  serperApiKey: z.string().optional(),
  defaultProvider: z.enum(['tavily', 'serper', 'auto']).default('auto'),
  enableFallback: z.boolean().default(true),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;

// Provider metadata
export const SEARCH_PROVIDERS = {
  tavily: {
    name: 'Tavily',
    endpoint: 'https://api.tavily.com/search',
    envVar: 'TAVILY_API_KEY',
    priority: 1, // Higher priority
  },
  serper: {
    name: 'Serper',  
    endpoint: 'https://google.serper.dev/search',
    envVar: 'SERPER_API_KEY',
    priority: 2,
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