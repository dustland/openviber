import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViberDataManager } from './manager';
import { DataAdapter } from './adapter';

// Mock the factory functions
const mockAdapter = {
  getSpace: vi.fn(),
  getSpaces: vi.fn(),
  saveSpace: vi.fn(),
  deleteSpace: vi.fn(),
  getArtifacts: vi.fn(),
  getArtifact: vi.fn(),
  saveArtifact: vi.fn(),
  deleteArtifact: vi.fn(),
  getTasks: vi.fn(),
  getTask: vi.fn(),
  saveTask: vi.fn(),
  deleteTask: vi.fn(),
  getAgents: vi.fn(),
  getAgent: vi.fn(),
  getTools: vi.fn(),
  getTool: vi.fn(),
} as unknown as DataAdapter;

vi.mock('@/viber/data/factory', () => ({
  getDataAdapter: () => mockAdapter,
  getServerDataAdapter: () => mockAdapter,
}));

describe('ViberDataManager', () => {
  let manager: ViberDataManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ViberDataManager(mockAdapter);
  });

  describe('Space Operations', () => {
    it('should get a space and cache it', async () => {
      const mockSpace = { id: 'space-1', name: 'Test Space' };
      (mockAdapter.getSpace as any).mockResolvedValue(mockSpace);

      // First call - should hit adapter
      const result1 = await manager.getSpace('space-1');
      expect(result1).toEqual(mockSpace);
      expect(mockAdapter.getSpace).toHaveBeenCalledTimes(1);

      // Second call - should hit cache
      const result2 = await manager.getSpace('space-1');
      expect(result2).toEqual(mockSpace);
      expect(mockAdapter.getSpace).toHaveBeenCalledTimes(1);
    });

    it('should list spaces with filters', async () => {
      const mockSpaces = [
        { id: 'space-1', name: 'Test Space 1', userId: 'user-1' },
        { id: 'space-2', name: 'Test Space 2', userId: 'user-2' },
      ];
      (mockAdapter.getSpaces as any).mockResolvedValue(mockSpaces);

      const result = await manager.listSpaces({ userId: 'user-1' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('space-1');
    });

    it('should create a space and invalidate cache', async () => {
      const newSpace = { id: 'space-new', name: 'New Space' };
      (mockAdapter.saveSpace as any).mockResolvedValue(newSpace);

      await manager.createSpace({ name: 'New Space' });
      expect(mockAdapter.saveSpace).toHaveBeenCalled();

      // Cache should be invalidated - verify by checking if getSpace calls adapter again
      (mockAdapter.getSpace as any).mockResolvedValue(newSpace);
      await manager.getSpace('space-new');
      expect(mockAdapter.getSpace).toHaveBeenCalled();
    });
  });

  describe('Artifact Operations', () => {
    it('should get artifacts with filters', async () => {
      const mockArtifacts = [
        { id: 'art-1', spaceId: 'space-1', category: 'input' },
        { id: 'art-2', spaceId: 'space-1', category: 'output' },
      ];
      (mockAdapter.getArtifacts as any).mockResolvedValue(mockArtifacts);

      const result = await manager.getArtifacts('space-1', { category: 'input' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('art-1');
    });
  });

  describe('Real-time Subscriptions', () => {
    it('should notify subscribers on update', async () => {
      const spaceId = 'space-1';
      const callback = vi.fn();
      const mockSpace = { id: spaceId, name: 'Old Name' };
      const updatedSpace = { id: spaceId, name: 'New Name' };

      (mockAdapter.getSpace as any).mockResolvedValue(mockSpace);
      (mockAdapter.saveSpace as any).mockResolvedValue(updatedSpace);

      // Subscribe
      const unsubscribe = manager.subscribeToSpace(spaceId, callback);

      // Should receive initial value
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for promise in subscribe
      expect(callback).toHaveBeenCalledWith(mockSpace);

      // Update
      await manager.updateSpace(spaceId, { name: 'New Name' });

      // Should receive update
      expect(callback).toHaveBeenCalledWith(updatedSpace);

      unsubscribe();
    });
  });
});







