<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    CheckCircle,
    Download,
    ExternalLink,
    Loader2,
    Search,
    Sparkles,
  } from "@lucide/svelte";

  interface SkillResult {
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
  }

  interface ImportState {
    status: "idle" | "importing" | "success" | "error";
    message?: string;
  }

  let searchQuery = $state("");
  let sourceFilter = $state("");
  let sortOrder = $state("relevance");
  let page = $state(1);
  let limit = $state(12);

  let skills = $state<SkillResult[]>([]);
  let total = $state(0);
  let totalPages = $state(0);

  let loading = $state(false);
  let error = $state<string | null>(null);

  let sources = $state<SourceOption[]>([]);
  let sourcesLoading = $state(true);
  let sourcesError = $state<string | null>(null);

  let importStates = $state<Record<string, ImportState>>({});

  const enabledSources = $derived(sources.filter((s) => s.enabled));
  const enabledSourcesCount = $derived(enabledSources.length);
  const sourceLabelMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const source of sources) {
      map.set(source.id, source.label);
    }
    return map;
  });

  function getSkillKey(skill: SkillResult) {
    return `${skill.source}:${skill.id}`;
  }

  function getSourceLabel(source: string) {
    return sourceLabelMap.get(source) || source;
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
        throw new Error(data.error || "Failed to load sources");
      }
      const data = await res.json();
      const nextSources: SourceOption[] = Object.entries(data.sources ?? {}).map(
        ([id, meta]) => ({
          id,
          label: meta.displayName || id,
          enabled: Boolean(meta.enabled),
          docsUrl: meta.docsUrl || undefined,
        }),
      );
      sources = nextSources;
    } catch (e) {
      sourcesError = e instanceof Error ? e.message : "Failed to load sources";
    } finally {
      sourcesLoading = false;
    }
  }

  async function searchSkills(nextPage = 1) {
    if (enabledSourcesCount === 0) {
      error = "Enable at least one skill source to search.";
      skills = [];
      total = 0;
      totalPages = 0;
      return;
    }

    loading = true;
    error = null;
    page = nextPage;
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (sourceFilter) params.set("source", sourceFilter);
      if (sortOrder) params.set("sort", sortOrder);
      params.set("page", String(nextPage));
      params.set("limit", String(limit));

      const res = await fetch(`/api/skill-hub?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to search skill hub");
      }
      const data = await res.json();
      skills = data.skills ?? [];
      total = data.total ?? 0;
      totalPages = data.totalPages ?? 1;
      page = data.page ?? nextPage;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to search skill hub";
      skills = [];
      total = 0;
      totalPages = 0;
    } finally {
      loading = false;
    }
  }

  async function importSkill(skill: SkillResult) {
    const key = getSkillKey(skill);
    importStates = {
      ...importStates,
      [key]: { status: "importing" },
    };
    try {
      const res = await fetch("/api/skill-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: skill.id, source: skill.source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import skill");
      }
      importStates = {
        ...importStates,
        [key]: { status: "success", message: data.message },
      };
    } catch (e) {
      importStates = {
        ...importStates,
        [key]: {
          status: "error",
          message: e instanceof Error ? e.message : "Failed to import skill",
        },
      };
    }
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchSkills(1);
    }
  }

  onMount(async () => {
    await fetchSources();
    if (!sourcesError) {
      await searchSkills(1);
    }
  });
</script>

<svelte:head>
  <title>Skill Hub - OpenViber</title>
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center gap-3 mb-2">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
          <Sparkles class="size-5 text-primary" />
        </div>
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Skill Hub</h1>
          <p class="text-sm text-muted-foreground">
            Discover and import skills from OpenClaw and other ecosystems.
          </p>
        </div>
      </div>
      <div class="rounded-lg border border-border/60 bg-card/60 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm text-foreground font-medium">
            OpenClaw ecosystem
          </p>
          <p class="text-xs text-muted-foreground">
            Browse community skills and bring them into your local OpenViber project.
          </p>
        </div>
        <a
          href="https://hub.openclaw.org"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ExternalLink class="size-4" />
          Explore OpenClaw
        </a>
      </div>
    </header>

    <section class="mb-6 space-y-3">
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,auto] lg:items-end">
          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-2" for="skill-search">
              Search skills
            </label>
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                id="skill-search"
                type="search"
                bind:value={searchQuery}
                onkeydown={handleSearchKeydown}
                placeholder="Search OpenClaw, GitHub, npm, and more"
                class="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-2" for="source-filter">
              Source
            </label>
            <select
              id="source-filter"
              bind:value={sourceFilter}
              onchange={() => searchSkills(1)}
              class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
            >
              <option value="">All enabled sources</option>
              {#each sources as source (source.id)}
                <option value={source.id} disabled={!source.enabled}>
                  {source.label}{source.enabled ? "" : " (disabled)"}
                </option>
              {/each}
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-muted-foreground mb-2" for="sort-order">
              Sort
            </label>
            <select
              id="sort-order"
              bind:value={sortOrder}
              onchange={() => searchSkills(1)}
              class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
            >
              <option value="relevance">Relevance</option>
              <option value="popularity">Popularity</option>
              <option value="recent">Recently updated</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div class="flex items-end">
            <button
              type="button"
              onclick={() => searchSkills(1)}
              disabled={loading || sourcesLoading || enabledSourcesCount === 0}
              class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if loading}
                <Loader2 class="size-4 animate-spin" />
                Searching...
              {:else}
                <Search class="size-4" />
                Search
              {/if}
            </button>
          </div>
        </div>
      </div>

      {#if sourcesError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle class="size-4" />
          {sourcesError}
        </div>
      {:else if sourcesLoading}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 class="size-3 animate-spin" />
          Loading skill sources...
        </div>
      {:else}
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span class="font-medium text-foreground">Enabled sources:</span>
          {#if enabledSourcesCount === 0}
            <span>No sources enabled.</span>
            <a href="/settings" class="text-primary hover:underline">
              Enable sources in General settings
            </a>
          {:else}
            {#each enabledSources as source (source.id)}
              <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                {source.label}
                {#if source.docsUrl}
                  <a
                    href={source.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-muted-foreground hover:text-foreground"
                    title={`Open ${source.label} docs`}
                  >
                    <ExternalLink class="size-3" />
                  </a>
                {/if}
              </span>
            {/each}
          {/if}
        </div>
        <p class="text-xs text-muted-foreground">
          Imported skills are installed to <code class="rounded bg-muted px-1.5 py-0.5 text-[11px]">~/.openviber/skills</code>.
          Restart your viber to load them.
        </p>
      {/if}
    </section>

    {#if error}
      <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 mb-6">
        <AlertCircle class="size-5 text-destructive shrink-0" />
        <p class="text-sm text-destructive">{error}</p>
      </div>
    {:else if loading}
      <div class="flex items-center justify-center py-16">
        <div class="animate-pulse flex flex-col items-center gap-3">
          <Loader2 class="size-8 text-muted-foreground/60 animate-spin" />
          <p class="text-sm text-muted-foreground">Searching skill hubs...</p>
        </div>
      </div>
    {:else if skills.length === 0}
      <div class="rounded-xl border border-dashed border-border p-12 text-center">
        <Sparkles class="size-12 text-muted-foreground/50 mx-auto mb-4" />
        <h2 class="text-lg font-medium text-foreground mb-2">
          No skills found
        </h2>
        <p class="text-sm text-muted-foreground max-w-md mx-auto">
          Try a different search or pick another source. OpenClaw is a great place to start.
        </p>
      </div>
    {:else}
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-muted-foreground">
          {total} result{total === 1 ? "" : "s"} found
        </p>
        <p class="text-xs text-muted-foreground">
          Page {page} of {Math.max(totalPages, 1)}
        </p>
      </div>

      <div class="grid gap-4">
        {#each skills as skill (getSkillKey(skill))}
          {@const skillKey = getSkillKey(skill)}
          {@const importState = importStates[skillKey]}
          {@const isImporting = importState?.status === "importing"}
          {@const isImported = importState?.status === "success"}
          {@const hasError = importState?.status === "error"}
          <div class="rounded-xl border border-border bg-card p-5">
            <div class="flex flex-col gap-4">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <h3 class="text-lg font-semibold text-card-foreground mb-1">
                    {skill.name}
                  </h3>
                  {#if skill.description}
                    <p class="text-sm text-muted-foreground">
                      {skill.description}
                    </p>
                  {/if}
                </div>
                <span class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {getSourceLabel(skill.source)}
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{skill.author}</span>
                <span class="text-muted-foreground/40">|</span>
                <span>v{skill.version}</span>
                {#if skill.updatedAt}
                  <span class="text-muted-foreground/40">|</span>
                  <span>{formatDate(skill.updatedAt)}</span>
                {/if}
                {#if skill.popularity}
                  <span class="text-muted-foreground/40">|</span>
                  <span>Stars {skill.popularity}</span>
                {/if}
              </div>

              {#if skill.tags?.length}
                <div class="flex flex-wrap gap-2">
                  {#each skill.tags.slice(0, 4) as tag}
                    <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {tag}
                    </span>
                  {/each}
                </div>
              {/if}

              <div class="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onclick={() => importSkill(skill)}
                  disabled={isImporting || isImported}
                  class="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {#if isImported}
                    <CheckCircle class="size-3.5" />
                    Imported
                  {:else if isImporting}
                    <Loader2 class="size-3.5 animate-spin" />
                    Importing...
                  {:else if hasError}
                    <Download class="size-3.5" />
                    Retry import
                  {:else}
                    <Download class="size-3.5" />
                    Import
                  {/if}
                </button>
                {#if skill.url}
                  <a
                    href={skill.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink class="size-3.5" />
                    View source
                  </a>
                {/if}
              </div>

              {#if importState?.message}
                <p
                  class={`text-xs ${
                    hasError ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {importState.message}
                </p>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="mt-6 flex items-center justify-between">
        <button
          type="button"
          onclick={() => searchSkills(page - 1)}
          disabled={page <= 1 || loading}
          class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft class="size-4" />
          Previous
        </button>
        <button
          type="button"
          onclick={() => searchSkills(page + 1)}
          disabled={page >= totalPages || loading}
          class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <ArrowRight class="size-4" />
        </button>
      </div>
    {/if}
  </div>
</div>
