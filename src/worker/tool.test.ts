import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildToolMap } from './tool';
import * as config from './config';

// Mock loadGlobalConfig
vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>();
  return {
    ...actual,
    loadGlobalConfig: vi.fn(),
  };
});

describe('buildToolMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should identify MCP tools from config', async () => {
    // Mock config to return an MCP server
    vi.mocked(config.loadGlobalConfig).mockResolvedValue({
      mcp_servers: [
        {
          name: 'github',
          command: 'npx',
          args: []
        }
      ]
    });

    // Mock console.warn to suppress expected output
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Call buildToolMap with 'github'
    await buildToolMap(['github']);

    // Check if it tried to load MCP client (by checking the warning message)
    // This confirms it went down the MCP path
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('MCP client creation not implemented for: github')
    );

    consoleSpy.mockRestore();
  });

  it('should treat unknown tools as custom tools (and fail to find them)', async () => {
    // Mock config to return NO MCP servers
    vi.mocked(config.loadGlobalConfig).mockResolvedValue({});

    // Mock console.warn
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Call buildToolMap with 'github'
    await buildToolMap(['github']);

    // Check if it treated it as a custom tool (which is not found)
    // This confirms it went down the custom tool path
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Tool not found: github')
    );

    consoleSpy.mockRestore();
  });
});
