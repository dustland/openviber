/**
 * Playground Space Store
 * localStorage-backed Space implementation for the playground demo
 */

import { writable, get } from 'svelte/store';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Artifact {
  id: string;
  name: string;
  content: string;
  type: 'markdown' | 'code' | 'text';
  createdAt: number;
}

export interface PlaygroundSpace {
  messages: Message[];
  artifacts: Artifact[];
  config: {
    model: string;
    agentName: string;
  };
}

const SPACE_KEY = 'viber-playground-space';

function createDefaultSpace(): PlaygroundSpace {
  return {
    messages: [],
    artifacts: [],
    config: {
      model: 'openai:gpt-4o',
      agentName: 'Assistant',
    },
  };
}

function loadFromStorage(): PlaygroundSpace {
  if (typeof window === 'undefined') return createDefaultSpace();

  try {
    const stored = localStorage.getItem(SPACE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load space from localStorage:', e);
  }
  return createDefaultSpace();
}

function saveToStorage(space: PlaygroundSpace) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(SPACE_KEY, JSON.stringify(space));
  } catch (e) {
    console.warn('Failed to save space to localStorage:', e);
  }
}

function createPlaygroundStore() {
  const { subscribe, set, update } = writable<PlaygroundSpace>(createDefaultSpace());

  return {
    subscribe,

    // Initialize from localStorage (call on mount)
    init() {
      const space = loadFromStorage();
      set(space);
    },

    // Add a message
    addMessage(role: Message['role'], content: string) {
      update(space => {
        const newMessage: Message = {
          id: crypto.randomUUID(),
          role,
          content,
          timestamp: Date.now(),
        };
        const updated = {
          ...space,
          messages: [...space.messages, newMessage],
        };
        saveToStorage(updated);
        return updated;
      });
    },

    // Add an artifact
    addArtifact(name: string, content: string, type: Artifact['type'] = 'text') {
      update(space => {
        const newArtifact: Artifact = {
          id: crypto.randomUUID(),
          name,
          content,
          type,
          createdAt: Date.now(),
        };
        const updated = {
          ...space,
          artifacts: [...space.artifacts, newArtifact],
        };
        saveToStorage(updated);
        return updated;
      });
    },

    // Update artifact content
    updateArtifact(id: string, content: string) {
      update(space => {
        const updated = {
          ...space,
          artifacts: space.artifacts.map(a =>
            a.id === id ? { ...a, content } : a
          ),
        };
        saveToStorage(updated);
        return updated;
      });
    },

    // Delete an artifact
    deleteArtifact(id: string) {
      update(space => {
        const updated = {
          ...space,
          artifacts: space.artifacts.filter(a => a.id !== id),
        };
        saveToStorage(updated);
        return updated;
      });
    },

    // Clear all messages
    clearMessages() {
      update(space => {
        const updated = { ...space, messages: [] };
        saveToStorage(updated);
        return updated;
      });
    },

    // Clear everything
    clearSpace() {
      const fresh = createDefaultSpace();
      set(fresh);
      saveToStorage(fresh);
    },

    // Get current state
    getState(): PlaygroundSpace {
      return get({ subscribe });
    },
  };
}

export const playgroundStore = createPlaygroundStore();
