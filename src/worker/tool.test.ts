import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildToolMap } from './tool';
import * as config from './config';
import * as mcpClient from './mcp-client';

// Mock loadGlobalConfig
vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>();
  return {
    ...actual,
    loadGlobalConfig: vi.fn(),
  };
});

// Mock mcp-client
vi.mock('./mcp-client', () => ({
  createMcpClient: vi.fn(),
}));

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

    // Mock createMcpClient to return a dummy client
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      callTool: vi.fn(),
    };
    vi.mocked(mcpClient.createMcpClient).mockResolvedValue(mockClient as any);

    // Call buildToolMap with 'github'
    await buildToolMap(['github']);

    // Check if it created the MCP client
    expect(mcpClient.createMcpClient).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'github' })
    );

    // Check if it listed tools
    expect(mockClient.listTools).toHaveBeenCalled();
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
