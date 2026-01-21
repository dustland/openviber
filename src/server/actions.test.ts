import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actions from './actions';
import { ViberDataManager } from '../data/manager';

// Mock the DataManager
const mockManager = {
  getSpace: vi.fn(),
  listSpaces: vi.fn(),
  createSpace: vi.fn(),
  updateSpace: vi.fn(),
  deleteSpace: vi.fn(),
  getArtifacts: vi.fn(),
  getArtifact: vi.fn(),
} as unknown as ViberDataManager;

vi.mock('../data/manager', () => ({
  getViberDataManagerServer: () => mockManager,
  // Mock types/interfaces if needed
}));

describe('Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Space Actions', () => {
    it('getSpace should call manager.getSpace', async () => {
      const mockSpace = { id: 'space-1', name: 'Test' };
      (mockManager.getSpace as any).mockResolvedValue(mockSpace);

      const result = await actions.getSpace('space-1');
      expect(result).toEqual(mockSpace);
      expect(mockManager.getSpace).toHaveBeenCalledWith('space-1');
    });

    it('createSpace should call manager.createSpace', async () => {
      const input = { name: 'New Space' };
      const output = { id: 'space-1', ...input };
      (mockManager.createSpace as any).mockResolvedValue(output);

      const result = await actions.createSpace(input);
      expect(result).toEqual(output);
      expect(mockManager.createSpace).toHaveBeenCalledWith(input);
    });
  });

  describe('Artifact Actions', () => {
    it('getArtifacts should pass filters correctly', async () => {
      const filters = { category: 'input' as const };
      const output = [{ id: 'art-1' }];
      (mockManager.getArtifacts as any).mockResolvedValue(output);

      const result = await actions.getArtifacts('space-1', filters);
      expect(result).toEqual(output);
      expect(mockManager.getArtifacts).toHaveBeenCalledWith('space-1', filters);
    });
  });
});







