<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    ExternalLink,
    Loader2,
    Search,
    Sparkles,
    X,
  } from "@lucide/svelte";

  interface DiscoverSkill {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    source: string;
    url: string;
    tags: string[];
    popularity?: number;
    updatedAt?: string;
    license?: string;
  }

  interface SourceOption {
    id: string;
    label: string;
    enabled: boolean;
    docsUrl?: string;
    description?: string;
  }

  interface SourcePreviewState {
    loading: boolean;
    error: string | null;
    skills: DiscoverSkill[];
  }

  const SEARCH_LIMIT = 24;

  let sources = $state<SourceOption[]>([]);
  let sourcesLoading = $state(true);
  let sourcesError = $state<string | null>(null);
  let selectedSourceIds = $state<string[]>([]);

  let query = $state("");
  let lastSearchQuery = $state("");
  let sortOrder = $state<"relevance" | "popularity" | "recent" | "name">(
    "relevance",
  );
  let perSourceLimit = $state(8);

  let previewBySource = $state<Record<string, SourcePreviewState>>({});
  let previewLoading = $state(false);

  let searchResults = $state<DiscoverSkill[]>([]);
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);
  let page = $state(1);
  let total = $state(0);
  let totalPages = $state(0);

  const enabledSources = $derived(sources.filter((source) => source.enabled));
  const selectedSources = $derived(
    enabledSources.filter((source) => selectedSourceIds.includes(source.id)),
  );
  const hasActiveSearch = $derived(lastSearchQuery.trim().length > 0);
  const sourceMeta = $derived.by(() => {
    const map = new Map<string, SourceOption>();
    for (const source of sources) {
      map.set(source.id, source);
    }
    return map;
  });
  const previewSourceErrors = $derived.by(() =>
    selectedSources
      .map((source) => ({
        sourceId: source.id,
        label: source.label,
        error: previewBySource[source.id]?.error,
      }))
      .filter((entry): entry is { sourceId: string; label: string; error: string } =>
        Boolean(entry.error),
      ),
  );
  const combinedPreviewResults = $derived.by(() => {
    const combined: DiscoverSkill[] = [];
    const seen = new Set<string>();

    for (const source of selectedSources) {
      const preview = previewBySource[source.id];
      if (!preview?.skills?.length) continue;
      for (const skill of preview.skills) {
        const key = getSkillKey(skill);
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push(skill);
      }
    }

    if (sortOrder === "popularity") {
      combined.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (sortOrder === "recent") {
      combined.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortOrder === "name") {
      combined.sort((a, b) => a.name.localeCompare(b.name));
    }

    return combined;
  });

  function getSkillKey(skill: DiscoverSkill) {
    return `${skill.source}:${skill.id}`;
  }

  function getSourceLabel(source: string) {
    return sourceMeta.get(source)?.label || source;
  }

  function formatDate(value?: string) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  async function fetchSources() {
    sourcesLoading = true;
    sourcesError = null;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load skill sources");
      }

      const data = await res.json();
      const raw = (data.sources ?? {}) as Record<
        string,
        {
          displayName?: string;
          description?: string;
          enabled?: boolean;
          docsUrl?: string;
        }
      >;

      const nextSources = Object.entries(raw)
        .map(([id, source]) => ({
          id,
          label: source.displayName || id,
          description: source.description || "",
          enabled: Boolean(source.enabled),
          docsUrl: source.docsUrl || undefined,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      sources = nextSources;
      selectedSourceIds = nextSources
        .filter((source) => source.enabled)
        .map((source) => source.id);
    } catch (error) {
      sourcesError =
        error instanceof Error ? error.message : "Failed to load skill sources";
      sources = [];
      selectedSourceIds = [];
    } finally {
      sourcesLoading = false;
    }
  }

  async function fetchSourcePreview(
    sourceId: string,
  ): Promise<SourcePreviewState> {
    try {
      const params = new URLSearchParams({
        source: sourceId,
        sort: sortOrder,
        page: "1",
        limit: String(perSourceLimit),
      });
      const res = await fetch(`/api/skill-hub?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load ${sourceId} skills`);
      }
      const data = await res.json();
      return {
        loading: false,
        error: null,
        skills: data.skills ?? [],
      };
    } catch (error) {
      return {
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : `Failed to load ${sourceId} skills`,
        skills: [],
      };
    }
  }

  async function loadSourcePreviews() {
    if (selectedSources.length === 0) {
      previewBySource = {};
      return;
    }

    previewLoading = true;
    const currentSources = [...selectedSources];

    const loadingState: Record<string, SourcePreviewState> = {};
    for (const source of currentSources) {
      loadingState[source.id] = { loading: true, error: null, skills: [] };
    }
    previewBySource = loadingState;

    const entries = await Promise.all(
      currentSources.map(
        async (source) =>
          [source.id, await fetchSourcePreview(source.id)] as const,
      ),
    );

    const next: Record<string, SourcePreviewState> = {};
    for (const [sourceId, state] of entries) {
      next[sourceId] = state;
    }

    previewBySource = next;
    previewLoading = false;
  }

  async function runSearch(nextPage = 1) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      clearSearch();
      return;
    }

    if (selectedSources.length === 0) {
      searchError = "Select at least one enabled source to search.";
      searchResults = [];
      total = 0;
      totalPages = 0;
      page = 1;
      return;
    }

    searchLoading = true;
    searchError = null;
    lastSearchQuery = trimmedQuery;

    try {
      const params = new URLSearchParams();
      params.set("q", trimmedQuery);
      params.set("sources", selectedSources.map((source) => source.id).join(","));
      params.set("sort", sortOrder);
      params.set("page", String(nextPage));
      params.set("limit", String(SEARCH_LIMIT));

      const res = await fetch(`/api/skill-hub?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to search skills");
      }

      const data = await res.json();
      searchResults = data.skills ?? [];
      total = data.total ?? 0;
      totalPages = data.totalPages ?? 0;
      page = data.page ?? nextPage;
    } catch (error) {
      searchError =
        error instanceof Error ? error.message : "Failed to search skills";
      searchResults = [];
      total = 0;
      totalPages = 0;
      page = 1;
    } finally {
      searchLoading = false;
    }
  }

  function clearSearch() {
    query = "";
    lastSearchQuery = "";
    searchError = null;
    searchResults = [];
    total = 0;
    totalPages = 0;
    page = 1;
    void loadSourcePreviews();
  }

  function toggleSource(sourceId: string) {
    if (selectedSourceIds.includes(sourceId)) {
      selectedSourceIds = selectedSourceIds.filter((id) => id !== sourceId);
    } else {
      selectedSourceIds = [...selectedSourceIds, sourceId];
    }

    if (hasActiveSearch) {
      void runSearch(1);
    } else {
      void loadSourcePreviews();
    }
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void runSearch(1);
  }

  function handleSortChange() {
    if (hasActiveSearch) {
      void runSearch(1);
    } else {
      void loadSourcePreviews();
    }
  }

  function handleLimitChange() {
    if (!hasActiveSearch) {
      void loadSourcePreviews();
    }
  }

  onMount(async () => {
    await fetchSources();
    if (!sourcesError) {
      await loadSourcePreviews();
    }
  });
</script>

<svelte:head>
  <title>Hub - OpenViber</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
    <div class="space-y-4">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Skill discovery
          </p>
          <h1 class="text-2xl font-semibold text-foreground">Hub</h1>
          <p class="text-sm text-muted-foreground mt-0.5">
            Discover OpenClaw-compatible skills from the curated catalog.
            <a
              href="https://github.com/VoltAgent/awesome-openclaw-skills"
              target="_blank"
              rel="noopener noreferrer"
              class="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
            >
              Browse curated list
              <ExternalLink class="size-3.5" />
            </a>
          </p>
        </div>
      </header>

      <section class="rounded-xl border border-border bg-card p-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="hub-search">Search skills</label>
          <div class="relative min-w-[220px] flex-1">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="hub-search"
              type="search"
              bind:value={query}
              onkeydown={handleSearchKeydown}
              placeholder="Search skills across selected sources..."
              class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            />
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => {
                void runSearch(1);
              }}
              disabled={searchLoading || sourcesLoading}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {#if searchLoading}
                <Loader2 class="size-4 animate-spin" />
                Searching...
              {:else}
                <Search class="size-4" />
                Search
              {/if}
            </button>
            {#if hasActiveSearch}
              <button
                type="button"
                onclick={clearSearch}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X class="size-4" />
                Clear
              </button>
            {/if}
          </div>
        </div>

        <div class="mt-3 border-t border-border/50 pt-3">
          <div class="flex items-center gap-2">
            <p class="shrink-0 text-xs font-medium text-muted-foreground ml-1 mr-1">
              Sources:
            </p>
            {#if enabledSources.length === 0}
              <p class="text-xs text-muted-foreground">
                No enabled sources. Configure them in
                <a href="/settings/skills" class="text-primary hover:underline"
                  >Settings → Skills</a
                >.
              </p>
            {:else}
              <div class="min-w-0 flex-1 overflow-x-auto pb-1">
                <div class="flex min-w-max items-center gap-2">
                  {#each enabledSources as source (source.id)}
                    <label
                      class="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer whitespace-nowrap {selectedSourceIds.includes(
                        source.id,
                      )
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent'}"
                    >
                      <input
                        type="checkbox"
                        class="size-3.5 rounded border-input"
                        checked={selectedSourceIds.includes(source.id)}
                        onchange={() => toggleSource(source.id)}
                      />
                      <span>{source.label}</span>
                    </label>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </section>

      {#if sourcesError}
        <div
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2"
        >
          <AlertCircle class="size-4 shrink-0" />
          {sourcesError}
        </div>
      {/if}

      {#if hasActiveSearch}
        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-foreground">
                Results for "{lastSearchQuery}"
              </h2>
              <p class="text-xs text-muted-foreground">
                {total} result{total === 1 ? "" : "s"} • page {page} of
                {Math.max(totalPages, 1)}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <label class="sr-only" for="hub-sort">Sort</label>
              <select
                id="hub-sort"
                bind:value={sortOrder}
                onchange={handleSortChange}
                class="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value="relevance">Sort: Relevance</option>
                <option value="popularity">Sort: Popularity</option>
                <option value="recent">Sort: Recent</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </div>

          {#if searchError}
            <div
              class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2"
            >
              <AlertCircle class="size-4 shrink-0" />
              {searchError}
            </div>
          {:else if searchLoading && searchResults.length === 0}
            <div class="flex items-center justify-center py-12">
              <Loader2 class="size-8 animate-spin text-muted-foreground/60" />
            </div>
          {:else if searchResults.length === 0}
            <div class="rounded-xl border border-dashed border-border p-8 text-center">
              <Sparkles class="mx-auto mb-3 size-10 text-muted-foreground/50" />
              <p class="text-sm text-muted-foreground">
                No skills found for this query.
              </p>
            </div>
          {:else}
            <div class="grid gap-4 lg:grid-cols-2">
              {#each searchResults as skill (getSkillKey(skill))}
                <div class="rounded-xl border border-border bg-card p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <h3 class="text-sm font-semibold text-card-foreground">
                        {skill.name}
                      </h3>
                      {#if skill.description}
                        <p class="mt-1 text-sm text-muted-foreground">
                          {skill.description}
                        </p>
                      {/if}
                    </div>
                    <span
                      class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {getSourceLabel(skill.source)}
                    </span>
                  </div>
                  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{skill.author}</span>
                    <span>v{skill.version}</span>
                    {#if skill.updatedAt}
                      <span>• {formatDate(skill.updatedAt)}</span>
                    {/if}
                  </div>
                  {#if skill.url}
                    <a
                      href={skill.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink class="size-3.5" />
                      View source
                    </a>
                  {/if}
                </div>
              {/each}
            </div>

            <div class="flex items-center justify-between">
              <button
                type="button"
                onclick={() => {
                  void runSearch(page - 1);
                }}
                disabled={page <= 1 || searchLoading}
                class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onclick={() => {
                  void runSearch(page + 1);
                }}
                disabled={page >= totalPages || searchLoading}
                class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          {/if}
        </section>
      {:else}
        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-lg font-semibold text-foreground">
              Top {perSourceLimit} per source
            </h2>
            <div class="flex items-center gap-2">
              <label class="sr-only" for="hub-sort">Sort</label>
              <select
                id="hub-sort"
                bind:value={sortOrder}
                onchange={handleSortChange}
                class="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value="relevance">Sort: Relevance</option>
                <option value="popularity">Sort: Popularity</option>
                <option value="recent">Sort: Recent</option>
                <option value="name">Sort: Name</option>
              </select>

              <label class="sr-only" for="hub-limit">First N per source</label>
              <select
                id="hub-limit"
                bind:value={perSourceLimit}
                onchange={handleLimitChange}
                class="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value={4}>Top 4/source</option>
                <option value={8}>Top 8/source</option>
                <option value={12}>Top 12/source</option>
              </select>

              {#if previewLoading}
                <p class="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Loader2 class="size-3.5 animate-spin" />
                  Refreshing...
                </p>
              {/if}
            </div>
          </div>

          {#if selectedSources.length === 0}
            <div class="rounded-xl border border-dashed border-border p-8 text-center">
              <AlertCircle class="mx-auto mb-3 size-10 text-muted-foreground/50" />
              <p class="text-sm text-muted-foreground">
                Select at least one source to view skills.
              </p>
            </div>
          {:else if previewLoading && combinedPreviewResults.length === 0}
            <div class="flex items-center justify-center py-12">
              <Loader2 class="size-8 animate-spin text-muted-foreground/60" />
            </div>
          {:else}
            {#if previewSourceErrors.length > 0}
              <div class="space-y-2">
                {#each previewSourceErrors as sourceError (sourceError.sourceId)}
                  <div
                    class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <span class="font-medium">{sourceError.label}:</span>
                    {sourceError.error}
                  </div>
                {/each}
              </div>
            {/if}

            {#if combinedPreviewResults.length === 0}
              <div
                class="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
              >
                No skills returned from selected sources.
              </div>
            {:else}
              <div class="grid gap-4 lg:grid-cols-2">
                {#each combinedPreviewResults as skill (getSkillKey(skill))}
                  <div class="rounded-xl border border-border bg-card p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <h3 class="text-sm font-semibold text-card-foreground">
                          {skill.name}
                        </h3>
                        {#if skill.description}
                          <p class="mt-1 text-sm text-muted-foreground">
                            {skill.description}
                          </p>
                        {/if}
                      </div>
                      <span
                        class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {getSourceLabel(skill.source)}
                      </span>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{skill.author}</span>
                      <span>v{skill.version}</span>
                      {#if skill.updatedAt}
                        <span>• {formatDate(skill.updatedAt)}</span>
                      {/if}
                    </div>
                    {#if skill.url}
                      <a
                        href={skill.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink class="size-3.5" />
                        View source
                      </a>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    </div>
  </div>
</div>
