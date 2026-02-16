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
    Circle,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Button } from "$lib/components/ui/button";
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

  interface ViberOption {
    id: string;
    name: string;
    viber_id: string | null;
    status: "pending" | "active" | "offline";
    skills?: { id?: string; name: string }[];
    config?: Record<string, unknown>;
  }

  interface SkillHealthCheck {
    id: string;
    label: string;
    ok: boolean;
    required?: boolean;
    message?: string;
    hint?: string;
    actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual";
  }

  interface SkillHealthResult {
    id: string;
    name: string;
    status: string;
    available: boolean;
    checks: SkillHealthCheck[];
    summary: string;
  }

  interface ImportState {
    status: "idle" | "importing" | "success" | "error";
    message?: string;
  }

  let { data } = $props();
  const viberId = $derived(data.viberId);

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
  let currentViber = $state<ViberOption | null>(null);

  // Per-viber skill config
  let enabledSkillIds = $state<Set<string>>(new Set());
  let viberConfig = $state<Record<string, unknown>>({});
  let skillHealthMap = $state<Map<string, SkillHealthResult>>(new Map());
  let togglingSkills = $state<Set<string>>(new Set());

  // Hub dialog
  let hubDialogOpen = $state(false);
  let hubInitialized = false;

  const enabledSources = $derived(sources.filter((s) => s.enabled));
  const enabledSourcesCount = $derived(enabledSources.length);
  const sourceLabelMap = $derived.by(() => {
    const map = new Map<string, string>();
    for (const source of sources) map.set(source.id, source.label);
    return map;
  });

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

  async function fetchViber() {
    try {
      const res = await fetch("/api/vibers");
      if (!res.ok) return;
      const data = await res.json();
      const vibers: ViberOption[] = data.vibers ?? [];
      currentViber =
        vibers.find((v) => v.viber_id === viberId || v.id === viberId) ?? null;
    } catch {
      currentViber = null;
    }
  }

  async function fetchViberConfig() {
    try {
      const res = await fetch(
        `/api/vibers/${encodeURIComponent(viberId)}/config`,
      );
      if (!res.ok) return;
      const data = await res.json();
      viberConfig = data.config ?? {};
      const skills = (viberConfig.skills as string[]) ?? [];
      enabledSkillIds = new Set(skills);
    } catch {
      // Non-fatal
    }
  }

  async function fetchViberStatus() {
    try {
      const res = await fetch(
        `/api/vibers/${encodeURIComponent(viberId)}/status`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const health = data.status?.viber?.skillHealth;
      if (health?.skills) {
        const map = new Map<string, SkillHealthResult>();
        for (const s of health.skills) {
          map.set(s.id, s);
        }
        skillHealthMap = map;
      }
    } catch {
      // Non-fatal
    }
  }

  async function toggleSkill(skillId: string, enabled: boolean) {
    togglingSkills = new Set([...togglingSkills, skillId]);
    try {
      const currentSkills = [...enabledSkillIds];
      const newSkills = enabled
        ? [...currentSkills, skillId]
        : currentSkills.filter((id) => id !== skillId);
      const newConfig = { ...viberConfig, skills: newSkills };
      const res = await fetch(
        `/api/vibers/${encodeURIComponent(viberId)}/config`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: newConfig }),
        },
      );
      if (res.ok) {
        viberConfig = newConfig;
        enabledSkillIds = new Set(newSkills);
      }
    } catch {
      // Non-fatal — UI stays at previous state
    } finally {
      const next = new Set(togglingSkills);
      next.delete(skillId);
      togglingSkills = next;
    }
  }

  function backfillInstalledFromVibers() {
    if (installed.length > 0 || !currentViber) return;
    const derived: InstalledSkill[] = [];

    // Try viber.skills first
    for (const s of (currentViber as any).skills ?? []) {
      const id = s.id || s.name;
      if (!id) continue;
      derived.push({
        id,
        name: s.name || id,
        description: s.description || "",
        usedByVibers: [{ id: currentViber.id, name: currentViber.name }],
      });
    }

    // Fallback: derive from skillHealthMap (viber status heartbeat)
    if (derived.length === 0 && skillHealthMap.size > 0) {
      for (const [id, health] of skillHealthMap) {
        derived.push({
          id,
          name: health.name || id,
          description: "",
          usedByVibers: [{ id: currentViber.id, name: currentViber.name }],
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

  onMount(async () => {
    await Promise.all([
      fetchInstalled(),
      fetchSources(),
      fetchViber(),
      fetchViberConfig(),
      fetchViberStatus(),
    ]);
    backfillInstalledFromVibers();
    await checkAllRequirements();
  });
</script>

<svelte:head>
  <title>Skills — OpenViber</title>
</svelte:head>

<div class="skills-page">
  <header class="skills-header">
    <div>
      <h1>Skills</h1>
      <p class="subtitle">Manage capabilities for this viber.</p>
    </div>
    <div class="header-actions">
      <span class="skill-count"
        >{installed.length} skill{installed.length === 1 ? "" : "s"}</span
      >
      <Button variant="outline" size="sm" onclick={openHub}>
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
      <p>Install skills to get started.</p>
      <button type="button" class="empty-action" onclick={openHub}>
        <Sparkles class="size-4" />
        Install Skills
      </button>
    </div>
  {:else}
    <div class="skills-grid">
      {#each installed as skill (skill.id)}
        {@const reqStatus = requirementStatuses[skill.id]}
        {@const isExpanded = expandedSetup === skill.id}
        {@const isEnabled = enabledSkillIds.has(skill.id)}
        {@const isToggling = togglingSkills.has(skill.id)}
        {@const health = skillHealthMap.get(skill.id)}
        <div
          class="skill-card"
          class:expanded={isExpanded}
          class:disabled-skill={!isEnabled}
        >
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
            <label
              class="skill-toggle"
              title={isEnabled
                ? "Disable skill for this viber"
                : "Enable skill for this viber"}
            >
              {#if isToggling}
                <Loader2 class="size-3.5 animate-spin toggle-spinner" />
              {:else}
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onchange={() => toggleSkill(skill.id, !isEnabled)}
                  class="sr-only"
                />
                <span class="toggle-track" class:active={isEnabled}>
                  <span class="toggle-thumb"></span>
                </span>
              {/if}
            </label>
          </div>

          <div class="card-meta">
            <div class="card-status">
              {#if health}
                {#if health.status === "ok" || health.available}
                  <span class="status-badge ok">
                    <Circle class="size-2.5" style="fill: currentColor" />
                    Healthy
                  </span>
                {:else if health.status === "degraded"}
                  <button
                    type="button"
                    onclick={() => toggleSetup(skill.id)}
                    class="status-badge warning"
                  >
                    <AlertTriangle class="size-3" />
                    Degraded
                    {#if isExpanded}<ChevronUp
                        class="size-3"
                      />{:else}<ChevronDown class="size-3" />{/if}
                  </button>
                {:else}
                  <button
                    type="button"
                    onclick={() => toggleSetup(skill.id)}
                    class="status-badge error"
                  >
                    <AlertCircle class="size-3" />
                    Unavailable
                    {#if isExpanded}<ChevronUp
                        class="size-3"
                      />{:else}<ChevronDown class="size-3" />{/if}
                  </button>
                {/if}
              {:else if reqStatus?.loading}
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
              {:else if isEnabled}
                <span class="status-badge ok">
                  <Circle class="size-2.5" style="fill: currentColor" />
                  Enabled
                </span>
              {:else}
                <span class="status-badge muted">
                  <Circle class="size-2.5" />
                  Disabled
                </span>
              {/if}
            </div>
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
    flex: 1;
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
    border: 1px solid hsl(var(--border));
    box-shadow: 0 1px 3px 0 hsl(var(--foreground) / 0.06);
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .skill-card:hover {
    transform: translateY(-1px);
    box-shadow:
      0 4px 12px -4px hsl(var(--primary) / 0.15),
      0 1px 3px 0 hsl(var(--foreground) / 0.06);
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

  .status-badge.error {
    background: hsl(0 72% 51% / 0.1);
    color: hsl(0 72% 40%);
    border: none;
    cursor: pointer;
  }

  .status-badge.error:hover {
    background: hsl(0 72% 51% / 0.18);
  }

  :global(.dark) .status-badge.error {
    background: hsl(0 50% 30% / 0.2);
    color: hsl(0 60% 65%);
  }

  .status-badge.muted {
    background: hsl(var(--muted) / 0.5);
    color: var(--muted-foreground);
  }

  /* ── Toggle switch ────────────────── */

  .skill-toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
    padding: 0.125rem;
  }

  .toggle-spinner {
    color: var(--muted-foreground);
  }

  .toggle-track {
    position: relative;
    width: 2rem;
    height: 1.125rem;
    border-radius: 9999px;
    background: hsl(var(--muted));
    transition: background 0.2s ease;
  }

  .toggle-track.active {
    background: hsl(142 71% 45%);
  }

  :global(.dark) .toggle-track.active {
    background: hsl(142 60% 50%);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.8125rem;
    height: 0.8125rem;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .toggle-track.active .toggle-thumb {
    transform: translateX(0.875rem);
  }

  .disabled-skill {
    opacity: 0.6;
  }

  .disabled-skill .card-icon {
    opacity: 0.5;
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
</style>
