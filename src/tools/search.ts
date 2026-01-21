/**
 * Simplified SearchTool - Focuses on essential search functionality
 */

import { z } from 'zod';
import { Tool, ToolFunction, ToolMetadata, ToolConfig, ConfigSchema } from './base';
import { SearchConfigManager, SearchProvider, SEARCH_PROVIDERS } from './search-config';

// Search result interfaces
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  score?: number;
  publishedDate?: string;
}

export interface SearchResponse {
  provider: string;
  query: string;
  results: SearchResult[];
  totalResults?: number;
}

/**
 * Simplified SearchTool
 */
export class SearchTool extends Tool {
  private configManager: SearchConfigManager;
  private config: any = {};

  constructor() {
    super();
    this.configManager = new SearchConfigManager();
  }

  getMetadata(): ToolMetadata {
    const status = this.configManager.getStatus();
    const availableProviders = status.providers
      .filter(p => p.available)
      .map(p => p.name)
      .join(' and ');
    
    return {
      id: 'search',
      name: 'Web Search',
      description: availableProviders 
        ? `Search the web for current information using ${availableProviders}`
        : 'Web search functionality (requires TAVILY_API_KEY or SERPER_API_KEY)',
      category: 'search',
    };
  }

  getConfigSchema(): ConfigSchema {
    return {
      defaultProvider: {
        name: '默认搜索提供商',
        type: 'select',
        description: '选择默认使用的搜索引擎提供商',
        options: [
          { value: 'auto', label: '自动选择', description: '根据可用性自动选择最佳搜索引擎' },
          { value: 'tavily', label: 'Tavily', description: '专为 AI 优化的搜索引擎，提供高质量结构化结果' },
          { value: 'serper', label: 'Serper', description: 'Google 搜索 API，提供全面的搜索结果' },
        ],
        defaultValue: 'auto',
        required: false,
      },
      enableFallback: {
        name: '启用备用提供商',
        type: 'boolean',
        description: '当主提供商失败时自动切换到备用提供商',
        defaultValue: true,
        required: false,
      },
      tavilyApiKey: {
        name: 'Tavily API 密钥',
        type: 'string',
        description: '用于 Tavily 网络搜索服务的 API 密钥。可以在此直接设置，或通过环境变量 TAVILY_API_KEY 提供',
        envVar: 'TAVILY_API_KEY',
        required: false,
      },
      serperApiKey: {
        name: 'Serper API 密钥',
        type: 'string',
        description: '用于 Serper (Google 搜索) 服务的 API 密钥。可以在此直接设置，或通过环境变量 SERPER_API_KEY 提供',
        envVar: 'SERPER_API_KEY',
        required: false,
      },
      defaultLanguage: {
        name: '默认语言',
        type: 'select',
        description: '搜索结果的默认语言偏好',
        options: [
          { value: 'auto', label: '自动检测' },
          { value: 'zh-CN', label: '简体中文' },
          { value: 'zh-TW', label: '繁体中文' },
          { value: 'en', label: 'English' },
          { value: 'ja', label: '日本語' },
          { value: 'ko', label: '한국어' },
        ],
        defaultValue: 'auto',
        required: false,
      },
      defaultCountry: {
        name: '默认地区',
        type: 'select',
        description: '搜索结果的默认地区偏好',
        options: [
          { value: 'auto', label: '自动选择' },
          { value: 'CN', label: '中国大陆' },
          { value: 'TW', label: '中国台湾省' },
          { value: 'HK', label: '中国香港' },
          { value: 'US', label: '美国' },
          { value: 'JP', label: '日本' },
          { value: 'KR', label: '韩国' },
        ],
        defaultValue: 'auto',
        required: false,
      },
      defaultSearchType: {
        name: '默认搜索类型',
        type: 'select',
        description: '默认的搜索类型',
        options: [
          { value: 'general', label: '常规搜索' },
          { value: 'news', label: '新闻搜索' },
        ],
        defaultValue: 'general',
        required: false,
      },
      defaultNewsDays: {
        name: '新闻时间范围',
        type: 'number',
        description: '新闻搜索的默认时间范围（天数）',
        defaultValue: 7,
        required: false,
      },
      includeDomains: {
        name: '优先域名',
        type: 'array',
        description: '优先显示这些域名的搜索结果（例如：["baidu.com", "zhihu.com"]）',
        defaultValue: [],
        required: false,
      },
      excludeDomains: {
        name: '排除域名',
        type: 'array',
        description: '从搜索结果中排除这些域名',
        defaultValue: [],
        required: false,
      },
    };
  }

  getConfig(): ToolConfig {
    return {
      ...this.config,
      ...this.configManager.getStatus(),
    };
  }

  setConfig(config: ToolConfig): void {
    this.config = config;

    // Update config manager with new settings
    this.configManager = new SearchConfigManager({
      tavilyApiKey: config.tavilyApiKey,
      serperApiKey: config.serperApiKey,
      defaultProvider: config.defaultProvider,
      enableFallback: config.enableFallback,
    });
  }

  isAvailable(): boolean {
    return this.configManager.isSearchAvailable();
  }

  @ToolFunction({
    description: 'Search the web for information using configured search providers (Tavily or Serper). Returns relevant web pages with titles, URLs, and snippets. For news queries, automatically prioritizes recent articles and news sources. Supports multiple languages and locales.',
    input: z.object({
      query: z.string().min(1).describe('The search query or keywords to search for'),
      maxResults: z.number().min(1).max(20).optional().default(10).describe('Maximum number of search results to return (1-20, default: 10)'),
      searchType: z.enum(['general', 'news']).optional().default('general').describe('Type of search: "general" for all web results, "news" for recent news articles only'),
      days: z.number().min(1).max(365).optional().describe('For news searches, limit results to articles from the last N days (default: 7 for news, unlimited for general)'),
      language: z.string().optional().describe('Language code for results (e.g., "en" for English, "zh" for Chinese, "zh-CN" for Simplified Chinese, "zh-TW" for Traditional Chinese, "ja" for Japanese, "ko" for Korean). Defaults to auto-detect from query.'),
      country: z.string().optional().describe('Country code for localized results (e.g., "US", "CN", "JP", "KR", "TW", "HK"). Helps prioritize region-specific sources.'),
      includeDomains: z.array(z.string()).optional().describe('List of domains to prioritize in results (e.g., ["baidu.com", "zhihu.com"] for Chinese sources)'),
      excludeDomains: z.array(z.string()).optional().describe('List of domains to exclude from results'),
    })
  } as any)
  async search_web(input: {
    query: string;
    maxResults?: number;
    searchType?: 'general' | 'news';
    days?: number;
    language?: string;
    country?: string;
    includeDomains?: string[];
    excludeDomains?: string[];
  }): Promise<SearchResponse> {
    const provider = this.configManager.selectProvider();

    if (!provider) {
      throw new Error('No search provider available. Please configure TAVILY_API_KEY or SERPER_API_KEY.');
    }

    // Apply config defaults for missing parameters
    const effectiveInput = {
      ...input,
      searchType: input.searchType || (this.config.defaultSearchType as 'general' | 'news') || 'general',
      days: input.days || (input.searchType === 'news' || this.config.defaultSearchType === 'news' ? (this.config.defaultNewsDays || 7) : undefined),
      language: input.language || (this.config.defaultLanguage !== 'auto' ? this.config.defaultLanguage : undefined),
      country: input.country || (this.config.defaultCountry !== 'auto' ? this.config.defaultCountry : undefined),
      includeDomains: input.includeDomains || this.config.includeDomains || [],
      excludeDomains: input.excludeDomains || this.config.excludeDomains || [],
    };

    try {
      return await this.searchWithProvider(provider, effectiveInput);
    } catch (error) {
      // Try fallback if available
      const fallback = this.configManager.getFallbackProvider(provider);
      if (fallback) {
        console.warn(`Primary search provider ${provider} failed, trying fallback provider ${fallback}...`);
        return await this.searchWithProvider(fallback, effectiveInput);
      }
      throw error;
    }
  }

  private async searchWithProvider(
    provider: SearchProvider,
    input: {
      query: string;
      maxResults?: number;
      searchType?: 'general' | 'news';
      days?: number;
      language?: string;
      country?: string;
      includeDomains?: string[];
      excludeDomains?: string[];
    }
  ): Promise<SearchResponse> {
    const apiKey = this.configManager.getApiKey(provider);
    if (!apiKey) {
      throw new Error(`${provider} API key is not configured`);
    }

    const endpoint = SEARCH_PROVIDERS[provider].endpoint;

    switch (provider) {
      case 'tavily':
        return await this.searchWithTavily(endpoint, apiKey, input);
      case 'serper':
        return await this.searchWithSerper(endpoint, apiKey, input);
      default:
        throw new Error(`Search provider ${provider} is not implemented`);
    }
  }

  private async searchWithTavily(
    endpoint: string,
    apiKey: string,
    input: {
      query: string;
      maxResults?: number;
      searchType?: 'general' | 'news';
      days?: number;
      language?: string;
      country?: string;
      includeDomains?: string[];
      excludeDomains?: string[];
    }
  ): Promise<SearchResponse> {
    const isNews = input.searchType === 'news';
    const days = input.days || (isNews ? 7 : undefined);

    const requestBody: any = {
      query: input.query,
      search_depth: 'advanced',
      max_results: input.maxResults || 10,
      include_raw_content: false,
      include_answer: false,
    };

    // Add news-specific parameters
    if (isNews) {
      requestBody.topic = 'news';
    }

    // Add language/locale parameters
    // Tavily doesn't have direct language parameter, but we can influence results via include_domains
    const defaultNewsDomains = isNews ? [
      'reuters.com', 'apnews.com', 'bbc.com', 'cnn.com',
      'theguardian.com', 'nytimes.com', 'washingtonpost.com',
    ] : [];

    // Add language-specific domains
    const languageBasedDomains: string[] = [];
    if (input.language?.startsWith('zh') || input.country === 'CN' || input.country === 'TW' || input.country === 'HK') {
      languageBasedDomains.push(
        'sina.com.cn', '163.com', 'qq.com', 'sohu.com', 'ifeng.com',
        'people.com.cn', 'xinhuanet.com', 'chinanews.com', 'thepaper.cn',
        'caixin.com', 'guancha.cn', 'huanqiu.com', 'chinadaily.com.cn'
      );
    } else if (input.language === 'ja' || input.country === 'JP') {
      languageBasedDomains.push(
        'nhk.or.jp', 'asahi.com', 'nikkei.com', 'yomiuri.co.jp',
        'mainichi.jp', 'sankei.com', 'jiji.com'
      );
    } else if (input.language === 'ko' || input.country === 'KR') {
      languageBasedDomains.push(
        'chosun.com', 'donga.com', 'joins.com', 'hani.co.kr',
        'khan.co.kr', 'yna.co.kr'
      );
    }

    // Combine all domain preferences
    const allIncludeDomains = [
      ...(input.includeDomains || []),
      ...languageBasedDomains,
      ...(languageBasedDomains.length === 0 ? defaultNewsDomains : []),
    ];

    if (allIncludeDomains.length > 0) {
      requestBody.include_domains = allIncludeDomains;
    }

    // Add exclude domains if specified
    if (input.excludeDomains && input.excludeDomains.length > 0) {
      requestBody.exclude_domains = input.excludeDomains;
    }

    // Add time filter if specified
    if (days) {
      requestBody.days = days;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      provider: 'tavily',
      query: input.query,
      results: data.results.map((r: any) => {
        // Extract domain from URL for favicon
        let domain = '';
        let favicon = '';
        try {
          const urlObj = new URL(r.url);
          domain = urlObj.hostname.replace('www.', '');
          // Use Google's favicon service
          favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch {
          // Invalid URL, skip favicon
        }

        return {
          title: r.title,
          url: r.url,
          snippet: r.content,
          description: r.content, // Use content as description for consistency
          content: r.content, // Map to content field
          score: r.score,
          publishedDate: r.published_date,
          domain,
          favicon,
        };
      }),
      totalResults: data.results.length,
    };
  }

  private async searchWithSerper(
    endpoint: string,
    apiKey: string,
    input: {
      query: string;
      maxResults?: number;
      searchType?: 'general' | 'news';
      days?: number;
      language?: string;
      country?: string;
      includeDomains?: string[];
      excludeDomains?: string[];
    }
  ): Promise<SearchResponse> {
    const isNews = input.searchType === 'news';
    const days = input.days || (isNews ? 7 : undefined);

    // Use news endpoint for news searches
    const searchEndpoint = isNews ? 'https://google.serper.dev/news' : endpoint;

    const requestBody: any = {
      q: input.query,
      num: input.maxResults || 10,
    };

    // Add language parameter (Serper native support)
    // Serper uses hl (host language) parameter
    if (input.language) {
      // Convert language codes to Serper format
      let langCode = input.language;
      if (langCode === 'zh') langCode = 'zh-CN'; // Default Chinese to Simplified
      requestBody.hl = langCode;
    }

    // Add country/location parameter (Serper native support)
    // Serper uses gl (geolocation) parameter
    if (input.country) {
      requestBody.gl = input.country.toLowerCase();
    }

    // Add domain filters
    if (input.includeDomains && input.includeDomains.length > 0) {
      // Serper doesn't have include_domains, but we can modify the query
      const siteFilters = input.includeDomains.map(d => `site:${d}`).join(' OR ');
      requestBody.q = `${input.query} (${siteFilters})`;
    }

    if (input.excludeDomains && input.excludeDomains.length > 0) {
      // Add exclude site filters to query
      const excludeFilters = input.excludeDomains.map(d => `-site:${d}`).join(' ');
      requestBody.q = `${requestBody.q} ${excludeFilters}`;
    }

    // Add time range for news
    if (isNews && days) {
      // Serper uses tbs parameter for time filtering
      // qdr:d = past day, qdr:w = past week, qdr:m = past month, qdr:y = past year
      if (days <= 1) {
        requestBody.tbs = 'qdr:d';
      } else if (days <= 7) {
        requestBody.tbs = 'qdr:w';
      } else if (days <= 30) {
        requestBody.tbs = 'qdr:m';
      } else {
        requestBody.tbs = 'qdr:y';
      }
    }

    const response = await fetch(searchEndpoint, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Serper search failed: ${response.statusText}`);
    }

    const data = await response.json();

    // News results are in data.news array, regular results in data.organic
    const resultsArray = isNews ? (data.news || []) : (data.organic || []);

    return {
      provider: 'serper',
      query: input.query,
      results: resultsArray.map((r: any) => {
        // Extract domain from URL for favicon
        let domain = '';
        let favicon = '';
        try {
          const urlObj = new URL(r.link);
          domain = urlObj.hostname.replace('www.', '');
          // Use Google's favicon service
          favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch {
          // Invalid URL, skip favicon
        }

        return {
          title: r.title,
          url: r.link,
          snippet: r.snippet,
          description: r.snippet, // Use snippet as description for consistency
          content: r.snippet, // Also map to content for fallback
          publishedDate: r.date,
          domain,
          favicon,
        };
      }),
      totalResults: data.searchInformation?.totalResults,
    };
  }
}