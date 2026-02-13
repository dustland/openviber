import { writable, derived } from "svelte/store";

const STORAGE_KEY = "openviber:pinned-tasks";

function loadPinned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v: unknown) => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function savePinned(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore quota errors
  }
}

function createPinnedTasksStore() {
  const { subscribe, set, update } = writable<Set<string>>(loadPinned());

  return {
    subscribe,

    /** Toggle pin state for a task ID */
    togglePin(id: string) {
      update((ids) => {
        const next = new Set(ids);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        savePinned(next);
        return next;
      });
    },

    /** Pin a specific task */
    pin(id: string) {
      update((ids) => {
        if (ids.has(id)) return ids;
        const next = new Set(ids);
        next.add(id);
        savePinned(next);
        return next;
      });
    },

    /** Unpin a specific task */
    unpin(id: string) {
      update((ids) => {
        if (!ids.has(id)) return ids;
        const next = new Set(ids);
        next.delete(id);
        savePinned(next);
        return next;
      });
    },
  };
}

export const pinnedTasksStore = createPinnedTasksStore();

/** Derived store: check if a specific task is pinned */
export function isPinned(id: string) {
  return derived(pinnedTasksStore, ($pinned) => $pinned.has(id));
}
