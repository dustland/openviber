<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Copy,
    Download,
    ExternalLink,
    FileText,
    Link2,
    Loader2,
    Puzzle,
    Search,
    Server,
    Sparkles,
    Play,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";

  interface UnmetRequirement {
    type: "oauth" | "env" | "bin";
    label: string;
    hint?: string;
    connectUrl?: string;
    envName?: string;
  }

  interface SkillRequirementStatus {
    ready: boolean;
    unmet: UnmetRequirement[];
    loading: boolean;
  }

  interface InstalledSkill {
    id: string;
    name: string;
    description: string;
    usedByVibers: { id: string; name: string }[];
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

  interface SourceOption {
    id: string;
    label: string;
    enabled: boolean;
    docsUrl?: string;
  }

  interface ViberSkillInfo {
    id?: string;
    name: string;
  }

  interface ViberOption {
    id: string;
    name: string;
    viber_id: string | null;
    status: "pending" | "active" | "offline";
    skills?: ViberSkillInfo[];
  }

  interface PlaygroundResult {
    ok: boolean;
    status: string;
    viberId: string;
    result?: unknown;
    partialText?: string;
    error?: string;
    message?: string;
  }

  interface ImportState {
    status: "idle" | "importing" | "success" | "error";
    message?: string;
  }

  let installed = $state<InstalledSkill[]>([]);
  let installedLoading = $state(true);
  let installedError = $state<string | null>(null);

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

  let sources = $state<SourceOption[]>([]);
  let sourcesLoading = $state(true);
  let sourcesError = $state<string | null>(null);
  let importStates = $state<Record<string, ImportState>>({});
  let requirementStatuses = $state<Record<string, SkillRequirementStatus>>({});
  let expandedSetup = $state<string | null>(null);
  let copiedHint = $state<string | null>(null);
  let vibers = $state<ViberOption[]>([]);
  let playgroundDialogOpen = $state(false);
  let playgroundSkill = $state<InstalledSkill | null>(null);
  let selectedPlaygroundViberId = $state<string>("");
  let playgroundRunning = $state(false);
  let playgroundError = $state<string | null>(null);
  let playgroundResult = $state<PlaygroundResult | null>(null);
  let playgroundScenario = $state("");

  const enabledSources = $derived(sources.filter((s) => s.enabled));
  const enabledSourcesCount = $derived(enabledSources.length);
  const sourceLabelMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const source of sources) {
      map.set(source.id, source.label);
    }
    return map;
  });
  const activeVibers = $derived(vibers.filter((v) => v.status === "active"));
  const selectedPlaygroundViber = $derived(
    activeVibers.find((v) => v.id === selectedPlaygroundViberId) ?? null,
  );

  function getSkillKey(skill: DiscoverSkill) {
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

  async function fetchInstalled() {
    installedLoading = true;
    installedError = null;
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load skills");
      }
      const data = await res.json();
      installed = data.skills ?? [];
    } catch (e) {
      installedError = e instanceof Error ? e.message : "Failed to load skills";
      installed = [];
    } finally {
      installedLoading = false;
    }
  }

  async function fetchVibers() {
    try {
      const res = await fetch("/api/vibers");
      if (!res.ok) {
        vibers = [];
        return;
      }
      const data = await res.json();
      vibers = data.vibers ?? [];
    } catch {
      vibers = [];
    }
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
      const raw = (data.sources ?? {}) as Record<
        string,
        { displayName?: string; enabled?: boolean; docsUrl?: string }
      >;
      const next: SourceOption[] = Object.entries(raw).map(([id, meta]) => ({
        id,
        label: meta?.displayName || id,
        enabled: Boolean(meta?.enabled),
        docsUrl: meta?.docsUrl || undefined,
      }));
      sources = next;
    } catch (e) {
      sourcesError = e instanceof Error ? e.message : "Failed to load sources";
    } finally {
      sourcesLoading = false;
    }
  }

  async function searchDiscover(nextPage = 1) {
    if (enabledSourcesCount === 0) {
      discoverError =
        "Enable at least one skill source in Settings → Skills to search.";
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
      const res = await fetch(`/api/skill-hub?${params.toString()}`);
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
      const res = await fetch("/api/skill-hub", {
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

  async function checkRequirements(skillId: string) {
    requirementStatuses = {
      ...requirementStatuses,
      [skillId]: { ready: false, unmet: [], loading: true },
    };
    try {
      const res = await fetch(
        `/api/skills/requirements?skillId=${encodeURIComponent(skillId)}`,
      );
      if (!res.ok) {
        requirementStatuses = {
          ...requirementStatuses,
          [skillId]: { ready: true, unmet: [], loading: false },
        };
        return;
      }
      const data = await res.json();
      requirementStatuses = {
        ...requirementStatuses,
        [skillId]: {
          ready: data.ready ?? true,
          unmet: data.unmet ?? [],
          loading: false,
        },
      };
    } catch {
      requirementStatuses = {
        ...requirementStatuses,
        [skillId]: { ready: true, unmet: [], loading: false },
      };
    }
  }

  async function checkAllRequirements() {
    // Skills that have known requirements
    const skillsToCheck = ["gmail"];
    for (const skillId of skillsToCheck) {
      await checkRequirements(skillId);
    }
  }

  function toggleSetup(skillId: string) {
    expandedSetup = expandedSetup === skillId ? null : skillId;
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    copiedHint = id;
    setTimeout(() => {
      if (copiedHint === id) copiedHint = null;
    }, 2000);
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchDiscover(1);
    }
  }

  function viberSupportsSkill(viber: ViberOption, skillId: string) {
    return (viber.skills ?? []).some((skill) => {
      const id = (skill.id || skill.name || "").toLowerCase();
      return id === skillId.toLowerCase();
    });
  }

  function openPlayground(skill: InstalledSkill) {
    playgroundDialogOpen = true;
    playgroundSkill = skill;
    playgroundError = null;
    playgroundResult = null;

    const preferredViber = activeVibers.find((v) =>
      skill.usedByVibers.some(
        (usedByViber) =>
          usedByViber.id === v.id || usedByViber.id === v.viber_id,
      ),
    );
    const fallbackViber = activeVibers.find((v) =>
      viberSupportsSkill(v, skill.id),
    );
    selectedPlaygroundViberId =
      preferredViber?.id || fallbackViber?.id || activeVibers[0]?.id || "";
  }

  async function runPlayground() {
    if (!playgroundSkill) return;
    playgroundRunning = true;
    playgroundError = null;
    playgroundResult = null;
    try {
      const selectedViber = activeVibers.find(
        (v) => v.id === selectedPlaygroundViberId,
      );
      const res = await fetch("/api/skills/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: playgroundSkill.id,
          viberId: selectedViber?.viber_id || selectedViber?.id,
          scenario: playgroundScenario.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to run playground");
      }
      playgroundResult = data;
      if (!data.ok) {
        playgroundError =
          data.message ||
          data.error ||
          "Playground run did not complete successfully.";
      }
    } catch (error) {
      playgroundError =
        error instanceof Error ? error.message : "Failed to run playground";
    } finally {
      playgroundRunning = false;
    }
  }

  function closePlaygroundDialog() {
    playgroundDialogOpen = false;
    playgroundSkill = null;
    playgroundError = null;
    playgroundResult = null;
    playgroundScenario = "";
  }

  $effect(() => {
    if (!playgroundDialogOpen && playgroundSkill) {
      playgroundSkill = null;
      playgroundError = null;
      playgroundResult = null;
    }
  });

  onMount(async () => {
    await Promise.all([fetchInstalled(), fetchSources(), fetchVibers()]);
    await checkAllRequirements();
    if (!sourcesError && enabledSourcesCount > 0) {
      await searchDiscover(1);
    }
  });
</script>

<svelte:head>
  <title>Skills - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="space-y-10">
    <header>
      <h1 class="text-2xl font-semibold text-foreground mb-1">Skills</h1>
      <p class="text-sm text-muted-foreground">
        View installed skills on your vibers and discover new ones from
        configured sources.
      </p>
    </header>

    <!-- Installed skills -->
    <section>
      <h2
        class="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"
      >
        <Puzzle class="size-5 text-muted-foreground" />
        Installed skills
      </h2>
      {#if installedError}
        <div
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3"
        >
          <AlertCircle class="size-5 text-destructive shrink-0" />
          <p class="text-sm text-destructive">{installedError}</p>
        </div>
      {:else if installedLoading}
        <div class="flex items-center justify-center py-12">
          <div class="animate-pulse flex flex-col items-center gap-3">
            <Puzzle class="size-10 text-muted-foreground/50" />
            <p class="text-sm text-muted-foreground">Loading skills…</p>
          </div>
        </div>
      {:else if installed.length === 0}
        <div
          class="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center"
        >
          <Puzzle class="size-12 text-muted-foreground/50 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">
            No skills on connected vibers yet. Connect a viber or import skills
            from the discover section below.
          </p>
          <a
            href="/docs/concepts/skills"
            class="inline-flex items-center gap-2 mt-3 text-sm text-primary hover:underline"
          >
            <FileText class="size-4" />
            Learn about skills
          </a>
        </div>
      {:else}
        <div class="grid gap-4">
          {#each installed as skill (skill.id)}
            {@const reqStatus = requirementStatuses[skill.id]}
            {@const isExpanded = expandedSetup === skill.id}
            <div
              class="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <h3 class="text-base font-semibold text-card-foreground mb-1">
                    {skill.name}
                  </h3>
                  {#if skill.description}
                    <p class="text-sm text-muted-foreground mb-3">
                      {skill.description}
                    </p>
                  {/if}
                  {#if skill.usedByVibers.length > 0}
                    <div class="flex flex-wrap items-center gap-2 text-sm">
                      <Server class="size-4 text-muted-foreground shrink-0" />
                      <span class="text-muted-foreground">On:</span>
                      {#each skill.usedByVibers as viber}
                        <span
                          class="inline-flex items-center rounded-md bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {viber.name}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => openPlayground(skill)}
                  >
                    <Play class="size-3.5 mr-1" />
                    Playground
                  </Button>
                  {#if reqStatus?.loading}
                    <Loader2
                      class="size-4 animate-spin text-muted-foreground"
                    />
                  {:else if reqStatus && !reqStatus.ready}
                    <button
                      type="button"
                      onclick={() => toggleSetup(skill.id)}
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-950/50 transition-colors"
                    >
                      <AlertTriangle class="size-3.5" />
                      Needs Setup
                      {#if isExpanded}
                        <ChevronUp class="size-3" />
                      {:else}
                        <ChevronDown class="size-3" />
                      {/if}
                    </button>
                  {:else if reqStatus?.ready}
                    <span
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                    >
                      <Check class="size-3.5" />
                      Ready
                    </span>
                  {:else}
                    <span
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    >
                      <Puzzle class="size-3.5" />
                      {skill.usedByVibers.length === 0
                        ? "Available"
                        : skill.usedByVibers.length === 1
                          ? "1 viber"
                          : `${skill.usedByVibers.length} vibers`}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Setup wizard panel -->
              {#if isExpanded && reqStatus && !reqStatus.ready}
                <div
                  class="mt-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3"
                >
                  <p
                    class="text-sm font-medium text-amber-800 dark:text-amber-300"
                  >
                    This skill needs the following to work:
                  </p>
                  {#each reqStatus.unmet as req, i (i)}
                    <div
                      class="flex items-start gap-3 rounded-md bg-background/60 p-3"
                    >
                      <div
                        class="mt-0.5 flex size-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40 shrink-0"
                      >
                        {#if req.type === "oauth"}
                          <Link2
                            class="size-3.5 text-amber-600 dark:text-amber-400"
                          />
                        {:else if req.type === "env"}
                          <AlertTriangle
                            class="size-3.5 text-amber-600 dark:text-amber-400"
                          />
                        {:else}
                          <Download
                            class="size-3.5 text-amber-600 dark:text-amber-400"
                          />
                        {/if}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium">{req.label}</p>
                        {#if req.hint}
                          <div class="flex items-center gap-2 mt-1">
                            <code
                              class="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5"
                              >{req.hint}</code
                            >
                            <button
                              type="button"
                              class="text-muted-foreground hover:text-foreground"
                              onclick={() =>
                                copyToClipboard(req.hint || "", `hint-${i}`)}
                            >
                              {#if copiedHint === `hint-${i}`}
                                <Check class="size-3" />
                              {:else}
                                <Copy class="size-3" />
                              {/if}
                            </button>
                          </div>
                        {/if}
                      </div>
                      {#if req.connectUrl}
                        <a
                          href={req.connectUrl}
                          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
                        >
                          <Link2 class="size-3" />
                          Connect
                        </a>
                      {/if}
                    </div>
                  {/each}
                  <button
                    type="button"
                    class="text-xs text-primary hover:underline"
                    onclick={async () => {
                      await checkRequirements(skill.id);
                    }}
                  >
                    Re-check requirements
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <p class="mt-3 text-center text-sm text-muted-foreground">
          {installed.length} skill{installed.length === 1 ? "" : "s"} installed
        </p>
      {/if}
    </section>

    <!-- Discover & import -->
    <section>
      <h2
        class="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"
      >
        <Sparkles class="size-5 text-muted-foreground" />
        Discover & import
      </h2>
      <p class="text-sm text-muted-foreground mb-4">
        Search your configured skill sources and import skills to
        <code class="rounded bg-muted px-1.5 py-0.5 text-xs"
          >~/.openviber/skills</code
        >. Configure which sources to use in
        <a href="/settings/skills" class="text-primary hover:underline"
          >Settings → Skills</a
        >.
      </p>

      <div class="rounded-xl border border-border bg-card p-4 mb-4">
        <div class="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,auto] lg:items-end">
          <div>
            <label
              class="block text-xs font-medium text-muted-foreground mb-2"
              for="skill-search"
            >
              Search
            </label>
            <div class="relative">
              <Search
                class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              />
              <input
                id="skill-search"
                type="search"
                bind:value={searchQuery}
                onkeydown={handleSearchKeydown}
                placeholder="OpenClaw, GitHub, npm, and more…"
                class="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              />
            </div>
          </div>
          <div>
            <label
              class="block text-xs font-medium text-muted-foreground mb-2"
              for="source-filter"
            >
              Source
            </label>
            <select
              id="source-filter"
              bind:value={sourceFilter}
              onchange={() => searchDiscover(1)}
              class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <option value="">All enabled</option>
              {#each sources as source (source.id)}
                <option value={source.id} disabled={!source.enabled}>
                  {source.label}{source.enabled ? "" : " (disabled)"}
                </option>
              {/each}
            </select>
          </div>
          <div>
            <label
              class="block text-xs font-medium text-muted-foreground mb-2"
              for="sort-order"
            >
              Sort
            </label>
            <select
              id="sort-order"
              bind:value={sortOrder}
              onchange={() => searchDiscover(1)}
              class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <option value="relevance">Relevance</option>
              <option value="popularity">Popularity</option>
              <option value="recent">Recent</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div class="flex items-end">
            <button
              type="button"
              onclick={() => searchDiscover(1)}
              disabled={discoverLoading ||
                sourcesLoading ||
                enabledSourcesCount === 0}
              class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if discoverLoading}
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
        <div
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2 mb-4"
        >
          <AlertCircle class="size-4" />
          {sourcesError}
        </div>
      {:else if enabledSourcesCount === 0}
        <div
          class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 mb-4"
        >
          No skill sources enabled. <a
            href="/settings/skills"
            class="font-medium underline">Enable sources in Settings → Skills</a
          > to discover and import skills.
        </div>
      {/if}

      {#if discoverError}
        <div
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 mb-4"
        >
          <AlertCircle class="size-5 text-destructive shrink-0" />
          <p class="text-sm text-destructive">{discoverError}</p>
        </div>
      {:else if discoverLoading && discoverSkills.length === 0}
        <div class="flex items-center justify-center py-12">
          <Loader2 class="size-8 text-muted-foreground/60 animate-spin" />
        </div>
      {:else if discoverSkills.length === 0}
        <div
          class="rounded-xl border border-dashed border-border p-8 text-center"
        >
          <Sparkles class="size-12 text-muted-foreground/50 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">
            {enabledSourcesCount === 0
              ? "Enable sources in Settings → Skills to search."
              : "Run a search to find skills from your enabled sources."}
          </p>
        </div>
      {:else}
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-muted-foreground">
            {total} result{total === 1 ? "" : "s"}
          </p>
          <p class="text-xs text-muted-foreground">
            Page {page} of {Math.max(totalPages, 1)}
          </p>
        </div>
        <div class="grid gap-4">
          {#each discoverSkills as skill (getSkillKey(skill))}
            {@const skillKey = getSkillKey(skill)}
            {@const importState = importStates[skillKey]}
            {@const isImporting = importState?.status === "importing"}
            {@const isImported = importState?.status === "success"}
            {@const hasError = importState?.status === "error"}
            <div class="rounded-xl border border-border bg-card p-5">
              <div class="flex flex-col gap-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <h3
                      class="text-base font-semibold text-card-foreground mb-1"
                    >
                      {skill.name}
                    </h3>
                    {#if skill.description}
                      <p class="text-sm text-muted-foreground">
                        {skill.description}
                      </p>
                    {/if}
                  </div>
                  <span
                    class="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                  >
                    {getSourceLabel(skill.source)}
                  </span>
                </div>
                <div
                  class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
                >
                  <span>{skill.author}</span>
                  <span class="text-muted-foreground/40">|</span>
                  <span>v{skill.version}</span>
                  {#if skill.updatedAt}
                    <span class="text-muted-foreground/40">|</span>
                    <span>{formatDate(skill.updatedAt)}</span>
                  {/if}
                </div>
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
                      Retry
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
                    class="text-xs {hasError
                      ? 'text-destructive'
                      : 'text-muted-foreground'}"
                  >
                    {importState.message}
                  </p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        <div class="mt-4 flex items-center justify-between">
          <button
            type="button"
            onclick={() => searchDiscover(page - 1)}
            disabled={page <= 1 || discoverLoading}
            class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft class="size-4" />
            Previous
          </button>
          <button
            type="button"
            onclick={() => searchDiscover(page + 1)}
            disabled={page >= totalPages || discoverLoading}
            class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ArrowRight class="size-4" />
          </button>
        </div>
      {/if}
    </section>
  </div>
</div>

<Dialog.Root bind:open={playgroundDialogOpen}>
  <Dialog.Content class="sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Skill Playground</Dialog.Title>
      <Dialog.Description>
        Run a quick verification on a target viber to confirm <code
          >{playgroundSkill?.id}</code
        > works end-to-end.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if activeVibers.length === 0}
        <div
          class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          No active vibers available. Bring a viber online to run playground
          checks.
        </div>
      {:else}
        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">Target viber</p>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
            >
              <span>{selectedPlaygroundViber?.name || "Select a viber"}</span>
              <ChevronDown class="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content class="w-[var(--bits-anchor-width)]">
              {#each activeVibers as viber (viber.id)}
                <DropdownMenu.Item
                  onclick={() => {
                    selectedPlaygroundViberId = viber.id;
                  }}
                >
                  <div class="flex w-full items-center justify-between gap-2">
                    <span>{viber.name}</span>
                    {#if playgroundSkill && viberSupportsSkill(viber, playgroundSkill.id)}
                      <span class="text-[10px] text-primary">has skill</span>
                    {/if}
                  </div>
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>

        <div
          class="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground"
        >
          This creates a temporary viber on the selected viber and asks it to
          run the playground verification flow for the selected skill.
        </div>

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            Scenario (optional)
          </p>
          <Textarea
            bind:value={playgroundScenario}
            class="min-h-24"
            placeholder="Optional: describe a specific user flow or edge case you want this skill to execute."
          />
          <p class="text-[11px] text-muted-foreground">
            Leave blank to run the default verification flow.
          </p>
        </div>
      {/if}

      {#if playgroundError}
        <div
          class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {playgroundError}
        </div>
      {/if}

      {#if playgroundResult}
        <div
          class="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs"
        >
          <p>
            <span class="font-medium">Status:</span>
            <span
              class={playgroundResult.ok
                ? "text-green-600"
                : "text-destructive"}
            >
              {playgroundResult.status}
            </span>
          </p>
          <p>
            <span class="font-medium">Viber:</span>
            {playgroundResult.viberId}
          </p>
          {#if playgroundResult.message}
            <p>
              <span class="font-medium">Message:</span>
              {playgroundResult.message}
            </p>
          {/if}
          {#if playgroundResult.partialText}
            <div class="space-y-1">
              <p class="font-medium">Model summary</p>
              <pre
                class="max-h-56 overflow-auto rounded-md border border-border bg-background p-2 text-[11px] whitespace-pre-wrap">{playgroundResult.partialText}</pre>
            </div>
          {/if}
          {#if playgroundResult.result}
            <details>
              <summary class="cursor-pointer font-medium"
                >Raw result payload</summary
              >
              <pre
                class="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background p-2 text-[11px]">{JSON.stringify(
                  playgroundResult.result,
                  null,
                  2,
                )}</pre>
            </details>
          {/if}
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={closePlaygroundDialog}>Close</Button>
      <Button
        onclick={runPlayground}
        disabled={playgroundRunning ||
          !playgroundSkill ||
          !selectedPlaygroundViberId}
      >
        {#if playgroundRunning}
          <Loader2 class="size-4 mr-1 animate-spin" />
          Running...
        {:else}
          <Play class="size-4 mr-1" />
          Run playground
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
