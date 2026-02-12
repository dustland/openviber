import { writable } from "svelte/store";

/** Shape of one task from GET /api/tasks */
export interface TaskListItem {
  id: string;
  viberId: string | null;
  viberName: string | null;
  environmentId: string | null;
  environmentName: string | null;
  goal: string;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  viberConnected: boolean | null;
  archivedAt: string | null;
}

const STORAGE_KEY = "openviber:tasks";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min for localStorage

function loadFromStorage(): TaskListItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { list, at } = JSON.parse(raw) as {
      list?: unknown;
      at?: number;
    };
    if (!Array.isArray(list) || typeof at !== "number") return null;
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return list as TaskListItem[];
  } catch {
    return null;
  }
}

function saveToStorage(list: TaskListItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ list, at: Date.now() }),
    );
  } catch {
    // ignore
  }
}

interface TasksState {
  tasks: TaskListItem[];
  loading: boolean;
  error: string | null;
  includeArchived: boolean;
  fetchedAt: number;
}

function createTasksStore() {
  const initial = loadFromStorage();
  const { subscribe, set, update } = writable<TasksState>({
    tasks: initial ?? [],
    loading: false,
    error: null,
    includeArchived: false,
    fetchedAt: initial ? Date.now() : 0,
  });

  let fetchAbort: AbortController | null = null;

  async function fetchTasks(
    includeArchived = false,
    backgroundRefetch = false,
  ): Promise<void> {
    if (!backgroundRefetch) {
      update((s) => ({ ...s, loading: true, error: null }));
    }

    fetchAbort?.abort();
    fetchAbort = new AbortController();
    const signal = fetchAbort.signal;

    try {
      const params = includeArchived ? "?include_archived=true" : "";
      const res = await fetch(`/api/tasks${params}`, { signal });
      if (!res.ok) {
        const err = res.status === 401 ? "Unauthorized" : "Failed to load tasks";
        update((s) => ({
          ...s,
          tasks: [],
          loading: false,
          error: err,
          includeArchived,
          fetchedAt: 0,
        }));
        return;
      }
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []) as TaskListItem[];
      const now = Date.now();
      update((s) => ({
        ...s,
        tasks: list,
        loading: false,
        error: null,
        includeArchived,
        fetchedAt: now,
      }));
      if (!includeArchived) {
        saveToStorage(list);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      console.error("Failed to fetch tasks:", e);
      update((s) => ({
        ...s,
        loading: false,
        error: "Failed to load tasks",
        includeArchived,
      }));
    } finally {
      fetchAbort = null;
    }
  }

  return {
    subscribe,

    /**
     * Load tasks (active only or including archived).
     * Uses cache: if we have data for the same filter and it's fresh, returns immediately and refetches in background.
     * Otherwise fetches and then updates the store.
     */
    async getTasks(includeArchived = false): Promise<void> {
      let state: TasksState;
      subscribe((s) => (state = s))();

      const cached =
        state!.includeArchived === includeArchived &&
        state!.tasks.length > 0 &&
        state!.fetchedAt > 0;

      if (cached) {
        // Show cached, refetch in background (no loading flash)
        void fetchTasks(includeArchived, true);
        return;
      }
      await fetchTasks(includeArchived);
    },

    /** Mark cache stale and refetch (e.g. after create/archive/restore). */
    async invalidate(): Promise<void> {
      let state: TasksState;
      subscribe((s) => (state = s))();
      update((s) => ({ ...s, fetchedAt: 0 }));
      await fetchTasks(state!.includeArchived);
    },

    /** Force refetch for current includeArchived. */
    async refresh(includeArchived = false): Promise<void> {
      update((s) => ({ ...s, fetchedAt: 0 }));
      await fetchTasks(includeArchived);
    },
  };
}

let store: ReturnType<typeof createTasksStore> | null = null;

export function getTasksStore() {
  if (!store) store = createTasksStore();
  return store;
}
