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
    Circle,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Skeleton } from "$lib/components/ui/skeleton";

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

  // Hub dialog
  let hubDialogOpen = $state(false);
  let hubInitialized = false;

  // Playground dialog
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
    for (const source of sources) map.set(source.id, source.label);
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

  function backfillInstalledFromVibers() {
    if (installed.length > 0) return;
    const seen = new Set<string>();
    const derived: InstalledSkill[] = [];
    for (const v of vibers) {
      for (const s of (v as any).skills ?? []) {
        const id = s.id || s.name;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        derived.push({
          id,
          name: s.name || id,
          description: s.description || "",
          usedByVibers: [{ id: v.id, name: v.name }],
        });
      }
    }
    if (derived.length > 0) {
      installed = derived;
      installedError = null;
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
      sources = Object.entries(raw).map(([id, meta]) => ({
        id,
        label: meta?.displayName || id,
        enabled: Boolean(meta?.enabled),
        docsUrl: meta?.docsUrl || undefined,
      }));
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
    const skillsToCheck = ["gmail"];
    for (const id of skillsToCheck) await checkRequirements(id);
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

  function openHub() {
    hubDialogOpen = true;
    if (!hubInitialized && enabledSourcesCount > 0) {
      hubInitialized = true;
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
      skill.usedByVibers.some((u) => u.id === v.id || u.id === v.viber_id),
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
      if (!res.ok) throw new Error(data.error || "Failed to run playground");
      playgroundResult = data;
      if (!data.ok)
        playgroundError =
          data.message ||
          data.error ||
          "Playground run did not complete successfully.";
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
    backfillInstalledFromVibers();
    await checkAllRequirements();
  });
</script>

<svelte:head>
  <title>Skills - OpenViber</title>
</svelte:head>

<div class="skills-page">
  <header class="skills-header">
    <div>
      <h1>Skills</h1>
      <p class="subtitle">Manage capabilities available to your vibers.</p>
    </div>
    <div class="header-actions">
      <span class="skill-count"
        >{installed.length} skill{installed.length === 1 ? "" : "s"}</span
      >
      <Button variant="outline" size="sm" onclick={openHub}>
        <Sparkles class="size-3.5" />
        Browse Hub
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
      {#each Array(3) as _}
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
          <div class="card-actions">
            <Skeleton class="h-8 w-16 rounded-md" />
          </div>
        </div>
      {/each}
    </div>
  {:else if installed.length === 0}
    <div class="empty-state">
      <Puzzle class="size-14 empty-icon" />
      <h2>No skills installed</h2>
      <p>Connect a viber or browse the Skill Hub to get started.</p>
      <button type="button" class="empty-action" onclick={openHub}>
        <Sparkles class="size-4" />
        Browse Skill Hub
      </button>
    </div>
  {:else}
    <div class="skills-grid">
      {#each installed as skill (skill.id)}
        {@const reqStatus = requirementStatuses[skill.id]}
        {@const isExpanded = expandedSetup === skill.id}
        <div class="skill-card" class:expanded={isExpanded}>
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
            {#if skill.usedByVibers.length > 0}
              <div class="viber-badges">
                <Server class="size-3.5" />
                {#each skill.usedByVibers as viber}
                  <span class="viber-badge">{viber.name}</span>
                {/each}
              </div>
            {/if}

            <div class="card-status">
              {#if reqStatus?.loading}
                <Loader2 class="size-3.5 animate-spin" />
              {:else if reqStatus && !reqStatus.ready}
                <button
                  type="button"
                  onclick={() => toggleSetup(skill.id)}
                  class="status-badge warning"
                >
                  <AlertTriangle class="size-3" />
                  Setup
                  {#if isExpanded}<ChevronUp
                      class="size-3"
                    />{:else}<ChevronDown class="size-3" />{/if}
                </button>
              {:else}
                <span class="status-badge ok">
                  <Circle class="size-2.5" style="fill: currentColor" />
                  Active
                </span>
              {/if}
            </div>
          </div>

          <div class="card-actions">
            <Button
              variant="outline"
              size="sm"
              onclick={() => openPlayground(skill)}
            >
              <Play class="size-3.5" />
              Test
            </Button>
          </div>

          {#if isExpanded && reqStatus && !reqStatus.ready}
            <div class="setup-panel">
              <p class="setup-title">This skill needs:</p>
              {#each reqStatus.unmet as req, i (i)}
                <div class="setup-item">
                  <div class="setup-icon">
                    {#if req.type === "oauth"}<Link2 class="size-3.5" />
                    {:else if req.type === "env"}<AlertTriangle
                        class="size-3.5"
                      />
                    {:else}<Download class="size-3.5" />{/if}
                  </div>
                  <div class="setup-content">
                    <p class="setup-label">{req.label}</p>
                    {#if req.hint}
                      <div class="setup-hint">
                        <code>{req.hint}</code>
                        <button
                          type="button"
                          onclick={() =>
                            copyToClipboard(req.hint || "", `hint-${i}`)}
                        >
                          {#if copiedHint === `hint-${i}`}<Check
                              class="size-3"
                            />{:else}<Copy class="size-3" />{/if}
                        </button>
                      </div>
                    {/if}
                  </div>
                  {#if req.connectUrl}
                    <a href={req.connectUrl} class="connect-btn"
                      ><Link2 class="size-3" />Connect</a
                    >
                  {/if}
                </div>
              {/each}
              <button
                type="button"
                class="recheck-btn"
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
  {/if}
</div>

<!-- Skill Hub Dialog -->
<Dialog.Root bind:open={hubDialogOpen}>
  <Dialog.Content class="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
    <Dialog.Header class="px-6 pt-5 pb-4 border-b border-border">
      <Dialog.Title class="flex items-center gap-2">
        <Sparkles class="size-5" />
        Skill Hub
      </Dialog.Title>
      <Dialog.Description>
        Search and import skills from your <a
          href="/settings/skills"
          class="text-primary hover:underline">configured sources</a
        >.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {#if sourcesError}
        <div class="error-banner">
          <AlertCircle class="size-4" />
          <span>{sourcesError}</span>
        </div>
      {:else if sourcesLoading}
        <div class="loading-state compact">
          <Loader2 class="size-5 animate-spin" />
        </div>
      {:else if enabledSourcesCount === 0}
        <div class="warning-banner">
          No skill sources enabled. <a href="/settings/skills"
            >Enable in Settings → Skills</a
          >.
        </div>
      {:else}
        <div class="search-bar">
          <div class="search-input-wrap">
            <Search class="size-4 search-icon" />
            <input
              type="search"
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
                  <span class="source-badge"
                    >{getSourceLabel(skill.source)}</span
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

<!-- Playground Dialog -->
<Dialog.Root bind:open={playgroundDialogOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Play class="size-5" />
        Test: {playgroundSkill?.name || playgroundSkill?.id}
      </Dialog.Title>
      <Dialog.Description>
        Run the <code>{playgroundSkill?.id}</code> skill on a viber and see the output.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      {#if activeVibers.length === 0}
        <div
          class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          No active vibers available. Bring a viber online first.
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

        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">
            Scenario <span class="text-muted-foreground/50">(optional)</span>
          </p>
          <Textarea
            bind:value={playgroundScenario}
            class="min-h-20"
            placeholder="Describe what you want the skill to do, or leave blank for a default demo."
          />
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
        <div class="playground-output">
          <div class="output-header">
            <span
              class="output-status"
              class:ok={playgroundResult.ok}
              class:fail={!playgroundResult.ok}
            >
              {#if playgroundResult.ok}<CheckCircle
                  class="size-3.5"
                />{:else}<AlertCircle class="size-3.5" />{/if}
              {playgroundResult.status}
            </span>
          </div>
          {#if playgroundResult.partialText}
            <div class="output-content">
              <pre>{playgroundResult.partialText}</pre>
            </div>
          {/if}
          {#if playgroundResult.message && !playgroundResult.partialText}
            <p class="output-message">{playgroundResult.message}</p>
          {/if}
          {#if playgroundResult.result}
            <details class="output-raw">
              <summary>Raw JSON</summary>
              <pre>{JSON.stringify(playgroundResult.result, null, 2)}</pre>
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
          <Loader2 class="size-4 animate-spin" />Running…
        {:else}
          <Play class="size-4" />Run
        {/if}
      </Button>
    </Dialog.Footer>
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
  }

  .skills-header h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--foreground);
    line-height: 1.2;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    margin-top: 0.25rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .skill-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--muted);
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-weight: 500;
  }

  /* ── Common ────────────────────────── */

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

  .warning-banner {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid hsl(38 92% 50% / 0.3);
    background: hsl(38 92% 50% / 0.08);
    font-size: 0.875rem;
    color: hsl(38 40% 40%);
  }

  :global(.dark) .warning-banner {
    color: hsl(38 80% 75%);
  }
  .warning-banner a {
    font-weight: 500;
    text-decoration: underline;
  }

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

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4rem 2rem;
    background: hsl(var(--card));
    border-radius: 0.75rem;
    box-shadow:
      0 10px 28px -22px hsl(var(--foreground) / 0.4),
      0 2px 8px -4px hsl(var(--foreground) / 0.12);
  }

  .empty-state.hub-empty {
    padding: 3rem 2rem;
  }

  .empty-state h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--foreground);
    margin-top: 0.75rem;
  }

  .empty-state p {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    margin-top: 0.25rem;
  }

  :global(.empty-icon) {
    color: var(--muted-foreground);
    opacity: 0.4;
  }

  .empty-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
  }

  .empty-action:hover {
    opacity: 0.9;
  }

  /* ── Skills Grid ────────────────────── */

  .skills-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 0.75rem;
  }

  .skill-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    background: linear-gradient(
      180deg,
      hsl(var(--card)) 0%,
      hsl(var(--card) / 0.94) 100%
    );
    box-shadow:
      0 18px 34px -28px hsl(var(--foreground) / 0.5),
      0 3px 10px -8px hsl(var(--foreground) / 0.18);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .skill-card:hover {
    transform: translateY(-1px);
    box-shadow:
      0 20px 36px -26px hsl(var(--primary) / 0.35),
      0 6px 14px -8px hsl(var(--foreground) / 0.2);
  }

  .card-top {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background: hsl(var(--primary) / 0.08);
    color: var(--primary);
    flex-shrink: 0;
  }

  .card-info {
    min-width: 0;
    flex: 1;
  }

  .card-info h3 {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--card-foreground);
    line-height: 1.3;
  }

  .card-desc {
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    margin-top: 0.125rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }

  .card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .viber-badges {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }

  .viber-badge {
    background: var(--muted);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--muted-foreground);
  }

  .card-status {
    margin-left: auto;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.1875rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .status-badge.ok {
    background: hsl(142 71% 45% / 0.1);
    color: hsl(142 71% 35%);
  }

  :global(.dark) .status-badge.ok {
    background: hsl(142 50% 30% / 0.2);
    color: hsl(142 60% 65%);
  }

  .status-badge.warning {
    background: hsl(38 92% 50% / 0.1);
    color: hsl(38 80% 35%);
    border: none;
    cursor: pointer;
  }

  .status-badge.warning:hover {
    background: hsl(38 92% 50% / 0.18);
  }

  :global(.dark) .status-badge.warning {
    background: hsl(38 60% 30% / 0.2);
    color: hsl(38 80% 65%);
  }

  .card-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* ── Setup panel ────────────────────── */

  .setup-panel {
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: hsl(38 80% 50% / 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: inset 0 0 0 1px hsl(38 80% 50% / 0.16);
  }

  .setup-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: hsl(38 60% 35%);
  }

  :global(.dark) .setup-title {
    color: hsl(38 60% 70%);
  }

  .setup-item {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    background: hsl(var(--card));
    border-radius: 0.375rem;
    box-shadow: 0 1px 3px -2px hsl(var(--foreground) / 0.5);
  }

  .setup-icon {
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    background: hsl(38 80% 50% / 0.1);
    color: hsl(38 70% 45%);
    flex-shrink: 0;
  }

  :global(.dark) .setup-icon {
    color: hsl(38 70% 70%);
  }

  .setup-content {
    flex: 1;
    min-width: 0;
  }
  .setup-label {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .setup-hint {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .setup-hint code {
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
    background: var(--muted);
    border-radius: 0.25rem;
    color: var(--muted-foreground);
  }

  .setup-hint button {
    color: var(--muted-foreground);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
  }

  .setup-hint button:hover {
    color: var(--foreground);
  }

  .connect-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 0.75rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .connect-btn:hover {
    opacity: 0.9;
  }

  .recheck-btn {
    font-size: 0.75rem;
    color: var(--primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    align-self: flex-start;
  }

  .recheck-btn:hover {
    text-decoration: underline;
  }

  /* ── Hub Dialog internals ──────────── */

  .search-bar {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .search-input-wrap {
    position: relative;
    flex: 1;
  }

  :global(.search-icon) {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted-foreground);
  }

  .search-input-wrap input {
    width: 100%;
    height: 2.25rem;
    border: 1px solid hsl(var(--input) / 0.65);
    border-radius: 0.375rem;
    background: var(--background);
    padding-left: 2.25rem;
    padding-right: 0.75rem;
    font-size: 0.8125rem;
    color: var(--foreground);
  }

  .search-input-wrap input:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring);
  }

  .search-bar select {
    height: 2.25rem;
    border: 1px solid hsl(var(--input) / 0.65);
    border-radius: 0.375rem;
    background: var(--background);
    padding: 0 0.5rem;
    font-size: 0.8125rem;
    min-width: 7rem;
    color: var(--foreground);
  }

  .search-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2.25rem;
    padding: 0 0.75rem;
    border-radius: 0.375rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border: none;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .search-btn:hover {
    opacity: 0.9;
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
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
  }

  .discover-card {
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    background: linear-gradient(
      180deg,
      hsl(var(--card)) 0%,
      hsl(var(--card) / 0.94) 100%
    );
    box-shadow:
      0 16px 30px -28px hsl(var(--foreground) / 0.5),
      0 2px 8px -5px hsl(var(--foreground) / 0.16);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .discover-card:hover {
    transform: translateY(-1px);
    box-shadow:
      0 20px 34px -28px hsl(var(--primary) / 0.36),
      0 4px 12px -8px hsl(var(--foreground) / 0.2);
  }

  .discover-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .discover-card-top h4 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--card-foreground);
  }

  .source-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 9999px;
    background: hsl(var(--primary) / 0.08);
    color: var(--primary);
    font-weight: 500;
  }

  .discover-desc-text {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
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
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    border-radius: 0.375rem;
    background: hsl(var(--primary) / 0.1);
    color: var(--primary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
  }

  .import-btn:hover:not(:disabled) {
    background: hsl(var(--primary) / 0.1);
  }
  .import-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .source-link {
    color: var(--muted-foreground);
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
    justify-content: space-between;
    padding-top: 0.5rem;
  }

  .pagination button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    background: none;
    border: none;
    cursor: pointer;
  }

  .pagination button:hover:not(:disabled) {
    color: var(--foreground);
  }
  .pagination button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .page-info {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  /* ── Playground output ────────────────── */

  .playground-output {
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow:
      0 12px 24px -20px hsl(var(--foreground) / 0.55),
      0 2px 8px -6px hsl(var(--foreground) / 0.2);
  }

  .output-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid hsl(var(--border) / 0.45);
  }

  .output-status {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .output-status.ok {
    color: hsl(142 71% 35%);
  }
  :global(.dark) .output-status.ok {
    color: hsl(142 60% 60%);
  }
  .output-status.fail {
    color: var(--destructive);
  }

  .output-content {
    padding: 0.75rem;
    max-height: 20rem;
    overflow: auto;
  }

  .output-content pre {
    font-size: 0.8125rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
      monospace;
  }

  .output-message {
    padding: 0.75rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
  }

  .output-raw {
    border-top: 1px solid var(--border);
  }

  .output-raw summary {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    color: var(--muted-foreground);
  }

  .output-raw summary:hover {
    color: var(--foreground);
  }

  .output-raw pre {
    padding: 0.75rem;
    font-size: 0.6875rem;
    max-height: 16rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
      monospace;
  }
</style>
