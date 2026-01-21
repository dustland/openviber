/**
 * WebTool - Simplified version using external services (Firecrawl/Jina)
 */

import { z } from 'zod';
import { Tool, ToolFunction, ToolMetadata, ToolConfig, ConfigSchema } from './base';

export class WebTool extends Tool {
  private config: ToolConfig = {
    jinaApiKey: null,
    firecrawlApiKey: null,
    defaultProvider: 'firecrawl', // firecrawl or jina
    timeout: 30000,
    maxContentLength: 100000,
    followRedirects: true,
    userAgent: 'Mozilla/5.0 (compatible; ViberBot/1.0)',
    enableJavaScript: false, // for providers that support it
  };

  getMetadata(): ToolMetadata {
    const jinaApiKey = this.getJinaApiKey();
    const firecrawlApiKey = this.getFirecrawlApiKey();

    let availableProviders: string[] = [];
    if (jinaApiKey) availableProviders.push('Jina');
    if (firecrawlApiKey) availableProviders.push('Firecrawl');

    return {
      id: 'web',
      name: 'Web Tools',
      description: availableProviders.length > 0
        ? `Extract web content, check URL availability, and crawl websites (Providers: ${availableProviders.join(', ')})`
        : 'Web content extraction, URL checking, and website crawling (requires API configuration)',
      category: 'web',
    };
  }

  getConfigSchema(): ConfigSchema {
    return {
      jinaApiKey: {
        name: 'Jina API Key',
        type: 'string',
        description: 'Jina API key for advanced content extraction',
        envVar: 'JINA_API_KEY',
        required: false,
      },
      firecrawlApiKey: {
        name: 'Firecrawl API Key',
        type: 'string',
        description: 'Firecrawl API key for JavaScript rendering',
        envVar: 'FIRECRAWL_API_KEY',
        required: false,
      },
      defaultProvider: {
        name: 'Default Provider',
        type: 'select',
        description: 'Default content extraction provider',
        options: ['firecrawl', 'jina'],
        defaultValue: 'firecrawl',
        required: false,
      },
      timeout: {
        name: 'Request Timeout',
        type: 'number',
        description: 'Request timeout in milliseconds',
        defaultValue: 30000,
        min: 1000,
        max: 120000,
        required: false,
      },
      maxContentLength: {
        name: 'Max Content Length',
        type: 'number',
        description: 'Maximum content length to extract (in characters)',
        defaultValue: 500000,
        required: false,
      },
      userAgent: {
        name: 'User Agent',
        type: 'string',
        description: 'Custom user agent string for HTTP requests',
        required: false,
      },
      enableJavaScript: {
        name: 'Enable JavaScript',
        type: 'boolean',
        description: 'Enable JavaScript rendering for dynamic content (requires compatible provider)',
        defaultValue: false,
        required: false,
      },
    };
  }

  getConfig(): ToolConfig {
    return this.config;
  }

  setConfig(config: ToolConfig): void {
    this.config = { ...this.config, ...config };
  }

  isAvailable(): boolean {
    // Tool is available if at least one provider is configured
    return !!(this.getJinaApiKey() || this.getFirecrawlApiKey());
  }

  private getJinaApiKey(): string | null {
    return this.config.jinaApiKey || process.env.JINA_API_KEY || null;
  }

  private getFirecrawlApiKey(): string | null {
    return this.config.firecrawlApiKey || process.env.FIRECRAWL_API_KEY || null;
  }

  private get providers() {
    return {
      jina: {
        apiKey: this.getJinaApiKey(),
        endpoint: 'https://r.jina.ai',
      },
      firecrawl: {
        apiKey: this.getFirecrawlApiKey(),
        endpoint: 'https://api.firecrawl.dev/v0',
      },
    };
  }

  @ToolFunction({
    description: 'Extract and parse web page content into structured formats (markdown, text, HTML). Supports JavaScript-rendered pages and can capture metadata, links, and images. Uses Firecrawl or Jina services for reliable extraction.',
    input: z.object({
      url: z.string().url().describe('The URL to extract content from'),
      provider: z.enum(['jina', 'firecrawl']).optional().describe('Extraction provider to use (auto-selects if not specified)'),
      format: z.enum(['markdown', 'text', 'html', 'all']).optional().default('markdown').describe('Output format for the extracted content'),
      includeMetadata: z.boolean().optional().default(true).describe('Include page metadata (title, description, author, etc.)'),
      includeLinks: z.boolean().optional().default(false).describe('Extract and include all links found on the page'),
      includeImages: z.boolean().optional().default(false).describe('Extract and include all images found on the page'),
      waitForSelector: z.string().optional().describe('CSS selector to wait for before extraction (for dynamic content)'),
      screenshot: z.boolean().optional().default(false).describe('Capture a screenshot of the page (Firecrawl only)'),
      maxLength: z.number().optional().describe('Maximum content length in characters (truncates if exceeded)'),
      timeout: z.number().optional().default(30000).describe('Maximum time to wait for page load in milliseconds'),
    })
  })
  async fetch_webpage(input: {
    url: string;
    provider?: 'jina' | 'firecrawl';
    format?: 'markdown' | 'text' | 'html' | 'all';
    includeMetadata?: boolean;
    includeLinks?: boolean;
    includeImages?: boolean;
    waitForSelector?: string;
    screenshot?: boolean;
    maxLength?: number;
    timeout?: number;
  }) {
    // Auto-select provider if not specified
    const provider = input.provider || this.selectProvider();

    if (!provider) {
      throw new Error('No web extraction provider configured. Please configure Firecrawl or Jina API key.');
    }

    switch (provider) {
      case 'jina':
        return await this.extractWithJina(input);
      case 'firecrawl':
        return await this.extractWithFirecrawl(input);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  @ToolFunction({
    description: 'Crawl a website to extract content from multiple pages. Follows links up to a specified depth and returns structured content from all discovered pages. Useful for documentation sites, blogs, or comprehensive site analysis.',
    input: z.object({
      url: z.string().url().describe('The starting URL for the crawl'),
      maxPages: z.number().min(1).max(100).optional().default(10).describe('Maximum number of pages to crawl (1-100)'),
      maxDepth: z.number().min(1).max(5).optional().default(2).describe('Maximum depth to follow links from the starting page (1-5)'),
      includePattern: z.string().optional().describe('Regex pattern - only crawl URLs matching this pattern'),
      excludePattern: z.string().optional().describe('Regex pattern - skip URLs matching this pattern'),
      format: z.enum(['markdown', 'text', 'html']).optional().default('markdown').describe('Output format for extracted content'),
    })
  })
  async crawl_website(input: {
    url: string;
    maxPages?: number;
    maxDepth?: number;
    includePattern?: string;
    excludePattern?: string;
    format?: 'markdown' | 'text' | 'html';
  }) {
    if (!this.providers.firecrawl.apiKey) {
      throw new Error('Web crawling requires Firecrawl API key to be configured');
    }

    // Start crawl job
    const startResponse = await fetch(`${this.providers.firecrawl.endpoint}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.providers.firecrawl.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: input.url,
        crawlerOptions: {
          maxPages: input.maxPages || 10,
          maxDepth: input.maxDepth || 2,
          includes: input.includePattern ? [input.includePattern] : undefined,
          excludes: input.excludePattern ? [input.excludePattern] : undefined,
        },
        pageOptions: {
          onlyMainContent: true,
        },
      }),
    });

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Failed to start crawl: ${error}`);
    }

    const { jobId } = await startResponse.json();

    // Poll for results
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5 second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`${this.providers.firecrawl.endpoint}/crawl/status/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${this.providers.firecrawl.apiKey}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to check crawl status');
      }

      const status = await statusResponse.json();

      if (status.status === 'completed') {
        return {
          url: input.url,
          pages: status.data,
          totalPages: status.total,
          provider: 'firecrawl',
          crawledAt: new Date().toISOString(),
        };
      } else if (status.status === 'failed') {
        throw new Error(`Crawl failed: ${status.error}`);
      }

      attempts++;
    }

    throw new Error('Crawl timed out after 5 minutes');
  }

  @ToolFunction({
    description: 'Check if a URL is accessible and retrieve basic information about the resource. Returns HTTP status, content type, size, and last modified date without downloading the full content.',
    input: z.object({
      url: z.string().url().describe('The URL to check for accessibility'),
      timeout: z.number().optional().default(5000).describe('Maximum time to wait for response in milliseconds'),
    })
  })
  async check_url(input: { url: string; timeout?: number }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeout || 5000);

    try {
      const response = await fetch(input.url, {
        method: 'HEAD',
        headers: {
          'User-Agent': this.config.userAgent || 'Mozilla/5.0 (compatible; ViberBot/1.0)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return {
        url: input.url,
        accessible: response.ok,
        statusCode: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        lastModified: response.headers.get('last-modified'),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      return {
        url: input.url,
        accessible: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private selectProvider(): string | null {
    if (this.providers.firecrawl.apiKey) return 'firecrawl';
    if (this.providers.jina.apiKey) return 'jina';
    return null;
  }

  private async extractWithJina(input: any) {
    const provider = this.providers.jina;

    if (!provider.apiKey) {
      throw new Error('Jina API key not configured');
    }

    // Jina uses URL-based API
    const jinaUrl = `${provider.endpoint}/${input.url}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    };

    // Add format preferences
    if (input.format === 'markdown') {
      headers['X-Return-Format'] = 'markdown';
    } else if (input.format === 'text') {
      headers['X-Return-Format'] = 'text';
    }

    const response = await fetch(jinaUrl, {
      headers,
      signal: AbortSignal.timeout(input.timeout || 30000),
    });

    if (!response.ok) {
      throw new Error(`Jina extraction failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    let result: any;

    if (contentType?.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      result = {
        content: text,
        format: input.format || 'markdown',
      };
    }

    // Apply max length if specified
    let content = result.content || result.text || result.markdown;
    if (input.maxLength && content && content.length > input.maxLength) {
      content = content.substring(0, input.maxLength) + '...';
    }

    return {
      url: input.url,
      title: result.title,
      content,
      markdown: result.markdown,
      text: result.text,
      html: result.html,
      metadata: result.metadata ? {
        description: result.metadata.description,
        author: result.metadata.author,
        publishedDate: result.metadata.publishedDate,
        keywords: result.metadata.keywords,
        language: result.metadata.language,
        image: result.metadata.ogImage || result.metadata.image,
      } : undefined,
      links: input.includeLinks ? result.links : undefined,
      images: input.includeImages ? result.images : undefined,
      provider: 'jina',
      extractedAt: new Date().toISOString(),
    };
  }

  private async extractWithFirecrawl(input: any) {
    const provider = this.providers.firecrawl;
    if (!provider.apiKey) {
      throw new Error('Firecrawl API key not configured');
    }

    const response = await fetch(`${provider.endpoint}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: input.url,
        pageOptions: {
          onlyMainContent: true,
          includeHtml: input.format === 'html' || input.format === 'all',
          screenshot: input.screenshot,
          waitFor: input.waitForSelector ? parseInt(input.waitForSelector) : undefined,
        },
        timeout: input.timeout,
      }),
      signal: AbortSignal.timeout(input.timeout || 30000),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Firecrawl extraction failed: ${error}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(`Firecrawl extraction failed: ${data.error}`);
    }

    const result = data.data;

    // Apply max length if specified
    let content = result.markdown || result.content;
    if (input.maxLength && content && content.length > input.maxLength) {
      content = content.substring(0, input.maxLength) + '...';
    }

    return {
      url: input.url,
      title: result.metadata?.title,
      content,
      markdown: result.markdown,
      text: result.content,
      html: result.html,
      metadata: {
        description: result.metadata?.description,
        author: result.metadata?.author,
        publishedDate: result.metadata?.publishedTime,
        modifiedDate: result.metadata?.modifiedTime,
        keywords: result.metadata?.keywords?.split(',').map((k: string) => k.trim()),
        language: result.metadata?.language,
        image: result.metadata?.ogImage,
        favicon: result.metadata?.favicon,
      },
      links: input.includeLinks ? result.links : undefined,
      images: input.includeImages ? result.images : undefined,
      screenshot: input.screenshot ? result.screenshot : undefined,
      provider: 'firecrawl',
      extractedAt: new Date().toISOString(),
    };
  }
}