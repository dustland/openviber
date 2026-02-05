/**
 * Viber Unified State Store
 *
 * Single source of truth for all Viber state using Zustand.
 * Provides reactive state management with automatic synchronization.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Space, Artifact, Task, Agent, Tool } from "../data/types";
import { getViberDataManager } from "../data/manager";

interface ViberState {
  // Spaces
  spaces: Map<string, Space>;
  currentSpaceId: string | null;

  // Artifacts (indexed by spaceId)
  artifacts: Map<string, Artifact[]>;

  // Tasks (indexed by spaceId)
  tasks: Map<string, Task[]>;

  // Agents and Tools (global)
  agents: Agent[];
  tools: Tool[];

  // Loading states
  loading: {
    spaces: boolean;
    artifacts: Record<string, boolean>;
    tasks: Record<string, boolean>;
    agents: boolean;
    tools: boolean;
  };

  // Error states
  errors: {
    spaces: Error | null;
    artifacts: Record<string, Error | null>;
    tasks: Record<string, Error | null>;
    agents: Error | null;
    tools: Error | null;
  };

  // Actions
  setSpaces: (spaces: Space[]) => void;
  setSpace: (space: Space) => void;
  removeSpace: (spaceId: string) => void;
  setCurrentSpaceId: (spaceId: string | null) => void;

  setArtifacts: (spaceId: string, artifacts: Artifact[]) => void;
  addArtifact: (spaceId: string, artifact: Artifact) => void;
  updateArtifact: (
    spaceId: string,
    artifactId: string,
    updates: Partial<Artifact>
  ) => void;
  removeArtifact: (spaceId: string, artifactId: string) => void;

  setTasks: (spaceId: string, tasks: Task[]) => void;
  addTask: (spaceId: string, task: Task) => void;
  updateTask: (spaceId: string, taskId: string, updates: Partial<Task>) => void;
  removeTask: (spaceId: string, taskId: string) => void;

  setAgents: (agents: Agent[]) => void;
  setTools: (tools: Tool[]) => void;

  setLoading: (key: string, value: boolean) => void;
  setError: (key: string, error: Error | null) => void;

  // Sync actions (sync with ViberDataManager)
  syncSpaces: () => Promise<void>;
  syncArtifacts: (spaceId: string) => Promise<void>;
  syncTasks: (spaceId: string) => Promise<void>;
  syncAgents: () => Promise<void>;
  syncTools: () => Promise<void>;
}

export const useViberStore = create<ViberState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    spaces: new Map(),
    currentSpaceId: null,
    artifacts: new Map(),
    tasks: new Map(),
    agents: [],
    tools: [],

    loading: {
      spaces: false,
      artifacts: {},
      tasks: {},
      agents: false,
      tools: false,
    },

    errors: {
      spaces: null,
      artifacts: {},
      tasks: {},
      agents: null,
      tools: null,
    },

    // Space actions
    setSpaces: (spaces) => {
      const spacesMap = new Map<string, Space>();
      spaces.forEach((space) => {
        spacesMap.set(space.id, space);
      });
      set({ spaces: spacesMap });
    },

    setSpace: (space) => {
      set((state) => {
        const newSpaces = new Map(state.spaces);
        newSpaces.set(space.id, space);
        return { spaces: newSpaces };
      });
    },

    removeSpace: (spaceId) => {
      set((state) => {
        const newSpaces = new Map(state.spaces);
        newSpaces.delete(spaceId);
        const newArtifacts = new Map(state.artifacts);
        newArtifacts.delete(spaceId);
        const newTasks = new Map(state.tasks);
        newTasks.delete(spaceId);
        return {
          spaces: newSpaces,
          artifacts: newArtifacts,
          tasks: newTasks,
          currentSpaceId:
            state.currentSpaceId === spaceId ? null : state.currentSpaceId,
        };
      });
    },

    setCurrentSpaceId: (spaceId) => {
      set({ currentSpaceId: spaceId });
    },

    // Artifact actions
    setArtifacts: (spaceId, artifacts) => {
      set((state) => {
        const newArtifacts = new Map(state.artifacts);
        newArtifacts.set(spaceId, artifacts);
        return { artifacts: newArtifacts };
      });
    },

    addArtifact: (spaceId, artifact) => {
      set((state) => {
        const newArtifacts = new Map(state.artifacts);
        const existing = newArtifacts.get(spaceId) || [];
        newArtifacts.set(spaceId, [...existing, artifact]);
        return { artifacts: newArtifacts };
      });
    },

    updateArtifact: (spaceId, artifactId, updates) => {
      set((state) => {
        const newArtifacts = new Map(state.artifacts);
        const existing = newArtifacts.get(spaceId) || [];
        const updated = existing.map((a) =>
          a.id === artifactId ? { ...a, ...updates } : a
        );
        newArtifacts.set(spaceId, updated);
        return { artifacts: newArtifacts };
      });
    },

    removeArtifact: (spaceId, artifactId) => {
      set((state) => {
        const newArtifacts = new Map(state.artifacts);
        const existing = newArtifacts.get(spaceId) || [];
        const filtered = existing.filter((a) => a.id !== artifactId);
        newArtifacts.set(spaceId, filtered);
        return { artifacts: newArtifacts };
      });
    },

    // Task actions
    setTasks: (spaceId, tasks) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        newTasks.set(spaceId, tasks);
        return { tasks: newTasks };
      });
    },

    addTask: (spaceId, task) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        const existing = newTasks.get(spaceId) || [];
        newTasks.set(spaceId, [...existing, task]);
        return { tasks: newTasks };
      });
    },

    updateTask: (spaceId, taskId, updates) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        const existing = newTasks.get(spaceId) || [];
        const updated = existing.map((t) =>
          t.id === taskId ? { ...t, ...updates } : t
        );
        newTasks.set(spaceId, updated);
        return { tasks: newTasks };
      });
    },

    removeTask: (spaceId, taskId) => {
      set((state) => {
        const newTasks = new Map(state.tasks);
        const existing = newTasks.get(spaceId) || [];
        const filtered = existing.filter((t) => t.id !== taskId);
        newTasks.set(spaceId, filtered);
        return { tasks: newTasks };
      });
    },

    // Agent and Tool actions
    setAgents: (agents) => {
      set({ agents });
    },

    setTools: (tools) => {
      set({ tools });
    },

    // Loading and error actions
    setLoading: (key, value) => {
      set((state) => {
        const [category, subKey] = key.split(":");
        if (subKey) {
          // Nested key like "artifacts:spaceId"
          return {
            loading: {
              ...state.loading,
              [category]: {
                ...((state.loading[
                  category as keyof typeof state.loading
                ] as Record<string, boolean>) || {}),
                [subKey]: value,
              },
            },
          };
        } else {
          // Top-level key
          return {
            loading: {
              ...state.loading,
              [key]: value,
            },
          };
        }
      });
    },

    setError: (key, error) => {
      set((state) => {
        const [category, subKey] = key.split(":");
        if (subKey) {
          // Nested key like "artifacts:spaceId"
          return {
            errors: {
              ...state.errors,
              [category]: {
                ...((state.errors[
                  category as keyof typeof state.errors
                ] as Record<string, Error | null>) || {}),
                [subKey]: error,
              },
            },
          };
        } else {
          // Top-level key
          return {
            errors: {
              ...state.errors,
              [key]: error,
            },
          };
        }
      });
    },

    // Sync actions
    syncSpaces: async () => {
      const manager = getViberDataManager();
      set({ loading: { ...get().loading, spaces: true } });
      try {
        const spaces = await manager.listSpaces();
        get().setSpaces(spaces);
        set({
          loading: { ...get().loading, spaces: false },
          errors: { ...get().errors, spaces: null },
        });
      } catch (error) {
        set({
          loading: { ...get().loading, spaces: false },
          errors: {
            ...get().errors,
            spaces: error instanceof Error ? error : new Error(String(error)),
          },
        });
      }
    },

    syncArtifacts: async (spaceId) => {
      const manager = getViberDataManager();
      set((state) => ({
        loading: {
          ...state.loading,
          artifacts: { ...state.loading.artifacts, [spaceId]: true },
        },
      }));
      try {
        const artifacts = await manager.getArtifacts(spaceId);
        get().setArtifacts(spaceId, artifacts);
        set((state) => ({
          loading: {
            ...state.loading,
            artifacts: { ...state.loading.artifacts, [spaceId]: false },
          },
          errors: {
            ...state.errors,
            artifacts: { ...state.errors.artifacts, [spaceId]: null },
          },
        }));
      } catch (error) {
        set((state) => ({
          loading: {
            ...state.loading,
            artifacts: { ...state.loading.artifacts, [spaceId]: false },
          },
          errors: {
            ...state.errors,
            artifacts: {
              ...state.errors.artifacts,
              [spaceId]:
                error instanceof Error ? error : new Error(String(error)),
            },
          },
        }));
      }
    },

    syncTasks: async (spaceId) => {
      const manager = getViberDataManager();
      set((state) => ({
        loading: {
          ...state.loading,
          tasks: { ...state.loading.tasks, [spaceId]: true },
        },
      }));
      try {
        const tasks = await manager.getTasks(spaceId);
        get().setTasks(spaceId, tasks);
        set((state) => ({
          loading: {
            ...state.loading,
            tasks: { ...state.loading.tasks, [spaceId]: false },
          },
          errors: {
            ...state.errors,
            tasks: { ...state.errors.tasks, [spaceId]: null },
          },
        }));
      } catch (error) {
        set((state) => ({
          loading: {
            ...state.loading,
            tasks: { ...state.loading.tasks, [spaceId]: false },
          },
          errors: {
            ...state.errors,
            tasks: {
              ...state.errors.tasks,
              [spaceId]:
                error instanceof Error ? error : new Error(String(error)),
            },
          },
        }));
      }
    },

    syncAgents: async () => {
      const manager = getViberDataManager();
      set({ loading: { ...get().loading, agents: true } });
      try {
        const agents = await manager.getAgents();
        get().setAgents(agents);
        set({
          loading: { ...get().loading, agents: false },
          errors: { ...get().errors, agents: null },
        });
      } catch (error) {
        set({
          loading: { ...get().loading, agents: false },
          errors: {
            ...get().errors,
            agents: error instanceof Error ? error : new Error(String(error)),
          },
        });
      }
    },

    syncTools: async () => {
      const manager = getViberDataManager();
      set({ loading: { ...get().loading, tools: true } });
      try {
        const tools = await manager.getTools();
        get().setTools(tools);
        set({
          loading: { ...get().loading, tools: false },
          errors: { ...get().errors, tools: null },
        });
      } catch (error) {
        set({
          loading: { ...get().loading, tools: false },
          errors: {
            ...get().errors,
            tools: error instanceof Error ? error : new Error(String(error)),
          },
        });
      }
    },
  }))
);

// Selector hooks for optimized re-renders
export const useViberSpaces = () =>
  useViberStore((state) => Array.from(state.spaces.values()));
export const useViberCurrentSpace = () => {
  const currentSpaceId = useViberStore((state) => state.currentSpaceId);
  const spaces = useViberStore((state) => state.spaces);
  return currentSpaceId ? spaces.get(currentSpaceId) || null : null;
};
export const useViberArtifacts = (spaceId: string | null | undefined) =>
  useViberStore((state) => (spaceId ? state.artifacts.get(spaceId) || [] : []));
export const useViberTasks = (spaceId: string | null | undefined) =>
  useViberStore((state) => (spaceId ? state.tasks.get(spaceId) || [] : []));
