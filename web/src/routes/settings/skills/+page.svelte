<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle,
    ChevronDown,
    Download,
    ExternalLink,
    Loader2,
    Puzzle,
    Search,
    Settings2,
    Sparkles,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";

  interface SkillInfo {
    id: string;
    name: string;
    description: string;
    source: string | null;
    version: string | null;
  }

  interface DiscoverSkill {
    id: string;
    importId?: string;
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

  interface SourceConfig {
    enabled: boolean;
    url?: string;
    apiKey?: string;
    displayName: string;
    description: string;
    defaultUrl: string;
    urlLabel: string;
    apiKeyLabel: string;
    apiKeyEnvVar: string;
    docsUrl: string;
  }

  interface SourceOption {
    id: string;
    label: string;
    enabled: boolean;
    docsUrl?: string;
  }

  interface ImportState {
    status: "idle" | "importing" | "success" | "error";
    message?: string;
  }

  const REQUEST_TIMEOUT_MS = 10_000;

  // ── Installed skills state ──
  let installed = $state<SkillInfo[]>([]);
  let installedLoading = $state(true);
  let installedError = $state<string | null>(null);

  // ── Sources state ──
  let sources = $state<SourceOption[]>([]);
  let sourcesRaw = $state<Record<string, SourceConfig>>({});
  let sourcesLoading = $state(true);

  // ── Hub dialog state ──
  let hubDialogOpen = $state(false);
  let hubInitialized = $state(false);
  let searchQuery = $state("");
  let sourceFilter = $state("");
  let sortOrder = $state("relevance");
  let page = $state(1);
  let limit = $state(12);
  let discoverSkills = $state<DiscoverSkill[]>([]);
  let total = $state(0);
  let totalPages = $state(0);
  let discoverLoading = $state(false);
  let discoverError = $state<string | null>(null);
  let importStates = $state<Record<string, ImportState>>({});

  const sourceLabelMap = $derived(new Map(sources.map((s) => [s.id, s.label])));
  const enabledSourcesCount = $derived(sources.filter((s) => s.enabled).length);

  function getSkillKey(skill: DiscoverSkill) {
    return `${skill.source}:${skill.id}`;
  }
  function getSourceLabel(source: string) {
    return sourceLabelMap.get(source) || source;
  }

  function timeoutMessage(fallback: string) {
    return `Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. ${fallback}`;
  }

  function formatFetchError(
    error: unknown,
    fallback = "Please retry.",
  ): string {
    if (error instanceof DOMException && error.name === "AbortError") {
      return timeoutMessage(fallback);
    }
    return error instanceof Error ? error.message : fallback;
  }

  async function fetchWithTimeout(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Data fetching ──

  async function fetchInstalled() {
    installedLoading = true;
    installedError = null;
    try {
      const res = await fetchWithTimeout("/api/skills");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load skills");
      }
      const data = await res.json();
      installed = data.skills ?? [];
    } catch (e) {
      installedError = formatFetchError(
        e,
        "Failed to load skills. Please retry.",
      );
      installed = [];
    } finally {
      installedLoading = false;
    }
  }

  async function fetchSources() {
    sourcesLoading = true;
    try {
      const res = await fetchWithTimeout("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      sourcesRaw = (data.sources ?? {}) as Record<string, SourceConfig>;
      sources = Object.entries(sourcesRaw).map(([id, meta]) => ({
        id,
        label: meta?.displayName || id,
        enabled: Boolean(meta?.enabled),
        docsUrl: meta?.docsUrl || undefined,
      }));
    } catch {
      // Non-fatal
      sources = [];
      sourcesRaw = {};
    } finally {
      sourcesLoading = false;
    }
  }

  async function toggleSource(id: string) {
    const idx = sources.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const newEnabled = !sources[idx].enabled;
    // Optimistic update
    sources = sources.map((s) =>
      s.id === id ? { ...s, enabled: newEnabled } : s,
    );
    try {
      const payload: Record<string, { enabled: boolean }> = {};
      for (const s of sources) {
        payload[s.id] = { enabled: s.id === id ? newEnabled : s.enabled };
      }
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: payload }),
      });
    } catch {
      // Revert on failure
      sources = sources.map((s) =>
        s.id === id ? { ...s, enabled: !newEnabled } : s,
      );
    }
  }

  async function searchDiscover(nextPage = 1) {
    if (enabledSourcesCount === 0) {
      discoverError = "Enable at least one skill source to search.";
      discoverSkills = [];
      total = 0;
      totalPages = 0;
      return;
    }
    discoverLoading = true;
    discoverError = null;
    page = nextPage;
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (sourceFilter) params.set("source", sourceFilter);
      params.set("sort", sortOrder);
      params.set("page", String(nextPage));
      params.set("limit", String(limit));
      const res = await fetch(`/api/hub/skills/search?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to search");
      }
      const data = await res.json();
      discoverSkills = data.skills ?? [];
      total = data.total ?? 0;
      totalPages = data.totalPages ?? 1;
      page = data.page ?? nextPage;
    } catch (e) {
      discoverError = e instanceof Error ? e.message : "Failed to search";
      discoverSkills = [];
      total = 0;
      totalPages = 0;
    } finally {
      discoverLoading = false;
    }
  }

  async function importSkill(skill: DiscoverSkill) {
    const key = getSkillKey(skill);
    importStates = { ...importStates, [key]: { status: "importing" } };
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: skill.importId || skill.id,
          source: skill.source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to import");
      importStates = {
        ...importStates,
        [key]: { status: "success", message: data.message },
      };
      await fetchInstalled();
    } catch (e) {
      importStates = {
        ...importStates,
        [key]: {
          status: "error",
          message: e instanceof Error ? e.message : "Failed to import",
        },
      };
    }
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchDiscover(1);
    }
  }

  function openHub() {
    hubDialogOpen = true;
    if (!hubInitialized && enabledSourcesCount > 0) {
      hubInitialized = true;
      searchDiscover(1);
    }
  }

  onMount(async () => {
    await Promise.all([fetchInstalled(), fetchSources()]);
  });
</script>

<svelte:head>
  <title>Skills — OpenViber</title>
</svelte:head>

<div class="skills-page">
  <header class="skills-header">
    <div class="header-text">
      <div class="title-row">
        <div class="title-icon">
          <Puzzle class="size-5" />
        </div>
        <h1>Skills</h1>
      </div>
      <p class="subtitle">Manage installed skills across all vibers.</p>
    </div>
    <div class="header-actions">
      <span class="skill-count"
        >{installed.length} skill{installed.length === 1 ? "" : "s"}</span
      >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button variant="outline" size="sm" {...props}>
              <Settings2 class="size-3.5" />
              Sources
              <ChevronDown class="size-3" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
          <DropdownMenu.Label>Skill Sources</DropdownMenu.Label>
          <DropdownMenu.Separator />
          {#each sources as source (source.id)}
            <DropdownMenu.CheckboxItem
              checked={source.enabled}
              onCheckedChange={() => toggleSource(source.id)}
            >
              {source.label}
              {#if source.docsUrl}
                <a
                  href={source.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex ml-auto"
                  onclick={(e) => e.stopPropagation()}
                >
                  <ExternalLink class="size-3 text-muted-foreground" />
                </a>
              {/if}
            </DropdownMenu.CheckboxItem>
          {/each}
          {#if sources.length === 0 && !sourcesLoading}
            <DropdownMenu.Item disabled>No sources configured</DropdownMenu.Item
            >
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Button variant="default" size="sm" onclick={openHub}>
        <Sparkles class="size-3.5" />
        Install Skills
      </Button>
    </div>
  </header>

  {#if installedError}
    <div class="error-banner">
      <AlertCircle class="size-4" />
      <span>{installedError}</span>
    </div>
  {/if}

  {#if installedLoading}
    <div class="skills-grid">
      {#each Array(4) as _}
        <div class="skill-card">
          <div class="card-top">
            <Skeleton class="size-9 rounded-lg shrink-0" />
            <div
              class="card-info"
              style="display:flex;flex-direction:column;gap:0.375rem;flex:1"
            >
              <Skeleton class="h-4 w-28 rounded" />
              <Skeleton class="h-3 w-full rounded" />
            </div>
          </div>
          <div class="card-meta">
            <Skeleton class="h-3 w-20 rounded" />
            <Skeleton class="h-5 w-14 rounded-full" />
          </div>
        </div>
      {/each}
    </div>
  {:else if installed.length === 0}
    <div class="empty-state">
      <Puzzle class="size-14 empty-icon" />
      <h2>No skills installed</h2>
      <p>Discover and import skills from configured sources.</p>
      <button type="button" class="empty-action" onclick={openHub}>
        <Sparkles class="size-4" />
        Install Skills
      </button>
    </div>
  {:else}
    <div class="skills-grid">
      {#each installed as skill (skill.id)}
        <div class="skill-card">
          <div class="card-top">
            <div class="card-icon">
              <Puzzle class="size-5" />
            </div>
            <div class="card-info">
              <h3>{skill.name}</h3>
              {#if skill.description}
                <p class="card-desc">{skill.description}</p>
              {/if}
            </div>
          </div>
          <div class="card-meta">
            {#if skill.source}
              <span class="source-badge">{skill.source}</span>
            {/if}
            {#if skill.version}
              <span class="version-badge">v{skill.version}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- ── Hub Dialog ─────────────────────── -->
<Dialog.Root bind:open={hubDialogOpen}>
  <Dialog.Content
    class="max-w-3xl max-h-[80vh] flex flex-col overflow-hidden p-0"
  >
    <div class="hub-dialog">
      <div class="hub-header">
        <h2>Skill Hub</h2>
        <p>Discover and import skills from configured sources.</p>
      </div>

      {#if enabledSourcesCount === 0}
        <div class="empty-state hub-empty">
          <AlertCircle class="size-8 empty-icon" />
          <h2>No sources enabled</h2>
          <p>Enable at least one skill source using the Sources dropdown.</p>
        </div>
      {:else}
        <div class="search-bar">
          <div class="search-input-wrap">
            <Search class="size-4 search-icon" />
            <input
              type="text"
              bind:value={searchQuery}
              onkeydown={handleSearchKeydown}
              placeholder="Search skills..."
            />
          </div>
          <select bind:value={sourceFilter} onchange={() => searchDiscover(1)}>
            <option value="">All sources</option>
            {#each sources as source (source.id)}
              <option value={source.id} disabled={!source.enabled}>
                {source.label}{source.enabled ? "" : " (disabled)"}
              </option>
            {/each}
          </select>
          <button
            type="button"
            class="search-btn"
            onclick={() => searchDiscover(1)}
            disabled={discoverLoading}
          >
            {#if discoverLoading}<Loader2
                class="size-4 animate-spin"
              />{:else}<Search class="size-4" />{/if}
            Search
          </button>
        </div>

        {#if discoverError}
          <div class="error-banner">
            <AlertCircle class="size-4" />
            <span>{discoverError}</span>
          </div>
        {:else if discoverLoading && discoverSkills.length === 0}
          <div class="loading-state compact">
            <Loader2 class="size-5 animate-spin" />
          </div>
        {:else if discoverSkills.length === 0 && !discoverLoading}
          <div class="empty-state hub-empty">
            <Search class="size-8 empty-icon" />
            <h2>Search the Skill Hub</h2>
            <p>Find and import skills from your configured sources.</p>
          </div>
        {:else}
          <p class="result-count">{total} result{total === 1 ? "" : "s"}</p>
          <div class="discover-grid">
            {#each discoverSkills as skill (getSkillKey(skill))}
              {@const skillKey = getSkillKey(skill)}
              {@const importState = importStates[skillKey]}
              {@const isImporting = importState?.status === "importing"}
              {@const isImported = importState?.status === "success"}
              {@const hasError = importState?.status === "error"}
              <div class="discover-card">
                <div class="discover-card-top">
                  <h4>{skill.name}</h4>
                  <span class="source-chip">{getSourceLabel(skill.source)}</span
                  >
                </div>
                {#if skill.description}
                  <p class="discover-desc-text">{skill.description}</p>
                {/if}
                <div class="discover-meta">
                  <span>{skill.author}</span>
                  <span>v{skill.version}</span>
                </div>
                <div class="discover-actions">
                  <button
                    type="button"
                    onclick={() => importSkill(skill)}
                    disabled={isImporting || isImported}
                    class="import-btn"
                  >
                    {#if isImported}<CheckCircle class="size-3.5" />Imported
                    {:else if isImporting}<Loader2
                        class="size-3.5 animate-spin"
                      />Importing…
                    {:else if hasError}<Download class="size-3.5" />Retry
                    {:else}<Download class="size-3.5" />Import{/if}
                  </button>
                  {#if skill.url}
                    <a
                      href={skill.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="source-link"
                    >
                      <ExternalLink class="size-3.5" />
                    </a>
                  {/if}
                </div>
                {#if importState?.message}
                  <p class="import-msg" class:error={hasError}>
                    {importState.message}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
          <div class="pagination">
            <button
              type="button"
              onclick={() => searchDiscover(page - 1)}
              disabled={page <= 1 || discoverLoading}
            >
              <ArrowLeft class="size-4" />Prev
            </button>
            <span class="page-info"
              >Page {page} of {Math.max(totalPages, 1)}</span
            >
            <button
              type="button"
              onclick={() => searchDiscover(page + 1)}
              disabled={page >= totalPages || discoverLoading}
            >
              Next<ArrowRight class="size-4" />
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .skills-page {
    padding: 1.5rem;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .skills-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .header-text h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--foreground);
    line-height: 1.2;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .title-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
    background: hsl(var(--primary) / 0.1);
    color: var(--primary);
    flex-shrink: 0;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    margin-top: 0.25rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  @media (max-width: 640px) {
    .skills-header {
      flex-direction: column;
      align-items: stretch;
    }
    .header-actions {
      justify-content: space-between;
    }
  }

  .skill-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--muted);
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-weight: 500;
  }

  /* ── Error / Empty ──────────── */

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(var(--destructive) / 0.4);
    background: hsl(var(--destructive) / 0.08);
    font-size: 0.875rem;
    color: var(--destructive);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 4rem 2rem;
    text-align: center;
    flex: 1;
  }

  .empty-state h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .empty-state p {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    max-width: 24rem;
  }

  :global(.empty-icon) {
    color: var(--muted-foreground);
    opacity: 0.4;
    margin-bottom: 0.5rem;
  }

  .empty-action {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.75rem;
    padding: 0.5rem 1.25rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--primary-foreground);
    background: var(--primary);
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  .empty-action:hover {
    filter: brightness(0.92);
  }

  /* ── Skills grid ──────────── */

  .skills-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
  }

  .skill-card {
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--card);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    transition:
      box-shadow 0.15s,
      border-color 0.15s;
  }
  .skill-card:hover {
    box-shadow: 0 2px 8px hsl(0 0% 0% / 0.06);
    border-color: var(--border);
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background: var(--muted);
    color: var(--muted-foreground);
    flex-shrink: 0;
  }

  .card-info {
    flex: 1;
    min-width: 0;
  }

  .card-info h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--foreground);
    line-height: 1.3;
  }

  .card-desc {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    margin-top: 0.125rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .source-badge,
  .version-badge {
    font-size: 0.6875rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-weight: 500;
  }

  /* ── Loading state ──────────── */

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 0;
    color: var(--muted-foreground);
    font-size: 0.875rem;
  }
  .loading-state.compact {
    padding: 2rem 0;
  }

  /* ── Hub Dialog ──────────────── */

  .hub-dialog {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    overflow-y: auto;
    max-height: 75vh;
  }

  .hub-header h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--foreground);
  }
  .hub-header p {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    margin-top: 0.125rem;
  }

  .search-bar {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
    flex-wrap: wrap;
  }

  .search-input-wrap {
    position: relative;
    flex: 1;
    min-width: 160px;
  }
  .search-input-wrap input {
    width: 100%;
    height: 2.25rem;
    padding: 0 0.75rem 0 2rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--background);
    font-size: 0.8125rem;
    color: var(--foreground);
  }
  .search-input-wrap input:focus {
    outline: none;
    border-color: var(--ring);
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  :global(.search-icon) {
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-foreground);
    pointer-events: none;
  }

  .search-bar select {
    height: 2.25rem;
    padding: 0 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--background);
    font-size: 0.8125rem;
    color: var(--foreground);
    cursor: pointer;
  }

  .search-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0 0.875rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
    transition: background 0.15s;
  }
  .search-btn:hover:not(:disabled) {
    background: var(--accent);
  }
  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .result-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .discover-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.625rem;
  }

  .discover-card {
    border: 1px solid var(--border);
    border-radius: 0.625rem;
    padding: 0.875rem;
    background: var(--card);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .discover-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .discover-card-top h4 {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-chip {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 9999px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-weight: 500;
    flex-shrink: 0;
  }

  .discover-desc-text {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .discover-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.6875rem;
    color: var(--muted-foreground);
  }

  .discover-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .import-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
    transition: background 0.15s;
  }
  .import-btn:hover:not(:disabled) {
    background: var(--accent);
  }
  .import-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .source-link {
    display: inline-flex;
    align-items: center;
    color: var(--muted-foreground);
    transition: color 0.15s;
  }
  .source-link:hover {
    color: var(--foreground);
  }

  .import-msg {
    font-size: 0.6875rem;
    color: var(--muted-foreground);
  }
  .import-msg.error {
    color: var(--destructive);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding-top: 0.5rem;
  }
  .pagination button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
  }
  .pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .page-info {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .hub-empty {
    padding: 2rem;
  }
</style>
