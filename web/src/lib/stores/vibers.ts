import { writable } from "svelte/store";

/** Shape of one viber from GET /api/vibers */
export interface ViberListItem {
  id: string;
  nodeId: string | null;
  nodeName: string | null;
  environmentId: string | null;
  environmentName: string | null;
  goal: string;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  nodeConnected: boolean | null;
  archivedAt: string | null;
}

const STORAGE_KEY = "openviber:vibers";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min for localStorage

function loadFromStorage(): ViberListItem[] | null {
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
    return list as ViberListItem[];
  } catch {
    return null;
  }
}

function saveToStorage(list: ViberListItem[]) {
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

interface VibersState {
  vibers: ViberListItem[];
  loading: boolean;
  error: string | null;
  includeArchived: boolean;
  fetchedAt: number;
}

function createVibersStore() {
  const initial = loadFromStorage();
  const { subscribe, set, update } = writable<VibersState>({
    vibers: initial ?? [],
    loading: false,
    error: null,
    includeArchived: false,
    fetchedAt: initial ? Date.now() : 0,
  });

  let fetchAbort: AbortController | null = null;

  async function fetchVibers(
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
      const res = await fetch(`/api/vibers${params}`, { signal });
      if (!res.ok) {
        const err = res.status === 401 ? "Unauthorized" : "Failed to load vibers";
        update((s) => ({
          ...s,
          vibers: [],
          loading: false,
          error: err,
          includeArchived,
          fetchedAt: 0,
        }));
        return;
      }
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []) as ViberListItem[];
      const now = Date.now();
      update((s) => ({
        ...s,
        vibers: list,
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
      console.error("Failed to fetch vibers:", e);
      update((s) => ({
        ...s,
        loading: false,
        error: "Failed to load vibers",
        includeArchived,
      }));
    } finally {
      fetchAbort = null;
    }
  }

  return {
    subscribe,

    /**
     * Load vibers (active only or including archived).
     * Uses cache: if we have data for the same filter and it's fresh, returns immediately and refetches in background.
     * Otherwise fetches and then updates the store.
     */
    async getVibers(includeArchived = false): Promise<void> {
      let state: VibersState;
      subscribe((s) => (state = s))();

      const cached =
        state!.includeArchived === includeArchived &&
        state!.vibers.length >= 0 &&
        state!.fetchedAt > 0;

      if (cached) {
        // Show cached, refetch in background (no loading flash)
        void fetchVibers(includeArchived, true);
        return;
      }
      await fetchVibers(includeArchived);
    },

    /** Mark cache stale and refetch (e.g. after create/archive/restore). */
    async invalidate(): Promise<void> {
      update((s) => ({ ...s, fetchedAt: 0 }));
      await fetchVibers(false);
    },

    /** Force refetch for current includeArchived. */
    async refresh(includeArchived = false): Promise<void> {
      update((s) => ({ ...s, fetchedAt: 0 }));
      await fetchVibers(includeArchived);
    },
  };
}

let store: ReturnType<typeof createVibersStore> | null = null;

export function getVibersStore() {
  if (!store) store = createVibersStore();
  return store;
}
