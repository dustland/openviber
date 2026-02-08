<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    ArrowRight,
    Check,
    FolderGit2,
    GitBranch,
    HardDrive,
    Plus,
    Sparkles,
  } from "@lucide/svelte";

  interface EnvironmentSummary {
    id: string;
    name: string;
    type: "github" | "local" | "manual";
    description: string | null;
    repoUrl: string | null;
    repoBranch: string | null;
    workingDir: string | null;
    threadCount: number;
  }

  interface ViberDetail {
    id: string;
    name: string;
    environmentId: string | null;
  }

  let loading = $state(true);
  let assigningEnvironmentId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let environments = $state<EnvironmentSummary[]>([]);
  let selectedViber = $state<ViberDetail | null>(null);

  const viberId = $derived($page.url.searchParams.get("viber") || "");
  const nodeId = $derived($page.url.searchParams.get("node") || "");

  function buildQuery(extra: Record<string, string>) {
    const params = new URLSearchParams();
    if (viberId) {
      params.set("viber", viberId);
    }
    if (nodeId) {
      params.set("node", nodeId);
    }
    for (const [key, value] of Object.entries(extra)) {
      if (value) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  function getEnvironmentHref(environmentId: string) {
    return `/environments/${environmentId}${buildQuery({})}`;
  }

  function getNewEnvironmentHref() {
    return `/environments/new${buildQuery({})}`;
  }

  function getNewThreadHref(environmentId: string) {
    if (!viberId) {
      return "/vibers";
    }

    const params = new URLSearchParams({ environment: environmentId });
    if (nodeId) {
      params.set("node", nodeId);
    }
    return `/vibers/${viberId}/new?${params.toString()}`;
  }

  function isSelectedForViber(environmentId: string) {
    return Boolean(
      selectedViber?.environmentId &&
        selectedViber.environmentId === environmentId,
    );
  }

  async function fetchSelectedViber() {
    if (!viberId) {
      selectedViber = null;
      return;
    }

    const response = await fetch(`/api/vibers/${viberId}`);
    if (!response.ok) {
      throw new Error("Failed to load selected viber.");
    }

    const payload = await response.json();
    selectedViber = {
      id: String(payload.id || viberId),
      name: String(payload.name || "Viber"),
      environmentId:
        typeof payload.environmentId === "string" &&
        payload.environmentId.trim()
          ? payload.environmentId
          : null,
    };
  }

  async function assignEnvironment(environmentId: string) {
    if (
      !viberId ||
      assigningEnvironmentId ||
      isSelectedForViber(environmentId)
    ) {
      return;
    }

    assigningEnvironmentId = environmentId;
    error = null;

    try {
      const response = await fetch(`/api/vibers/${viberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to assign environment.");
      }

      selectedViber = {
        id: viberId,
        name: selectedViber?.name || "Viber",
        environmentId: payload.environmentId || null,
      };
    } catch (assignError) {
      error =
        assignError instanceof Error
          ? assignError.message
          : "Failed to assign environment.";
    } finally {
      assigningEnvironmentId = null;
    }
  }

  async function loadEnvironments() {
    loading = true;
    error = null;

    try {
      const environmentUrl = viberId
        ? `/api/environments?viberId=${encodeURIComponent(viberId)}`
        : "/api/environments";

      const environmentsResponse = await fetch(environmentUrl);
      if (!environmentsResponse.ok) {
        throw new Error("Failed to load environments.");
      }

      const environmentsPayload = await environmentsResponse.json();
      environments = Array.isArray(environmentsPayload.environments)
        ? environmentsPayload.environments
        : [];

      await fetchSelectedViber();
    } catch (loadError) {
      error =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load environments.";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void loadEnvironments();
  });
</script>

<svelte:head>
  <title>Environments - OpenViber</title>
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-wide text-muted-foreground">
          Workspace Execution
        </p>
        <h1 class="text-2xl font-semibold text-foreground">Environments</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Configure reusable runtime settings. {#if selectedViber}
            Select one environment for <span class="font-medium text-foreground"
              >{selectedViber.name}</span
            >.
          {:else}
            Open a viber workspace to bind an environment.
          {/if}
        </p>
      </div>
      <a
        href={getNewEnvironmentHref()}
        class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <Plus class="size-4" />
        New Environment
      </a>
    </header>

    {#if loading}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each Array(3) as _}
          <div class="rounded-xl border border-border bg-card p-4 space-y-3">
            <div class="flex items-start justify-between">
              <div class="space-y-2 flex-1">
                <Skeleton class="h-4 w-1/2" />
                <Skeleton class="h-3 w-16" />
              </div>
              <Skeleton class="h-5 w-16 rounded-full" />
            </div>
            <Skeleton class="h-3 w-full" />
            <div class="space-y-2">
              <Skeleton class="h-3 w-3/4" />
              <Skeleton class="h-3 w-2/3" />
            </div>
            <div class="flex gap-2 pt-1">
              <Skeleton class="h-7 w-20 rounded-md" />
              <Skeleton class="h-7 w-28 rounded-md" />
            </div>
          </div>
        {/each}
      </div>
    {:else if error}
      <div
        class="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    {:else if environments.length === 0}
      <div
        class="rounded-xl border border-dashed border-border px-6 py-14 text-center"
      >
        <Sparkles class="mx-auto mb-4 size-10 text-muted-foreground/60" />
        <h2 class="text-lg font-medium text-foreground">No environments yet</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Create one environment, then assign it to a viber.
        </p>
        <a
          href={getNewEnvironmentHref()}
          class="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus class="size-4" />
          Create Environment
        </a>
      </div>
    {:else}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each environments as environment (environment.id)}
          <article class="rounded-xl border border-border bg-card p-4">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h2 class="truncate text-base font-semibold text-foreground">
                  {environment.name}
                </h2>
                <p class="mt-0.5 text-xs capitalize text-muted-foreground">
                  {environment.type}
                </p>
              </div>
              {#if isSelectedForViber(environment.id)}
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-600"
                >
                  <Check class="size-3" />
                  Selected
                </span>
              {/if}
            </div>

            {#if environment.description}
              <p class="mb-3 line-clamp-2 text-sm text-muted-foreground">
                {environment.description}
              </p>
            {/if}

            <div class="space-y-2 text-xs text-muted-foreground">
              <div class="flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1.5">
                  <FolderGit2 class="size-3.5" />
                  Threads
                </span>
                <span class="text-foreground">{environment.threadCount}</span>
              </div>

              {#if environment.repoUrl}
                <div class="flex items-center gap-1.5">
                  <GitBranch class="size-3.5" />
                  <span class="truncate">{environment.repoUrl}</span>
                </div>
              {/if}

              {#if environment.workingDir}
                <div class="flex items-center gap-1.5">
                  <HardDrive class="size-3.5" />
                  <span class="truncate font-mono text-[11px]"
                    >{environment.workingDir}</span
                  >
                </div>
              {/if}
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <a
                href={getEnvironmentHref(environment.id)}
                class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
              >
                Manage
                <ArrowRight class="size-3.5" />
              </a>

              {#if viberId}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-60"
                  onclick={() => assignEnvironment(environment.id)}
                  disabled={Boolean(assigningEnvironmentId) ||
                    isSelectedForViber(environment.id)}
                >
                  {#if assigningEnvironmentId === environment.id}
                    Assigning...
                  {:else if isSelectedForViber(environment.id)}
                    Selected
                  {:else}
                    Use for this viber
                  {/if}
                </button>
                <a
                  href={getNewThreadHref(environment.id)}
                  class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  New Thread
                </a>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>
