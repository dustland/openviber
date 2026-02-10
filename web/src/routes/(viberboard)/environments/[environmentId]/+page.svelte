<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import {
    ArrowLeft,
    Save,
    Sparkles,
    Trash2,
    Search,
    Github,
    ExternalLink,
  } from "@lucide/svelte";

  interface EnvironmentVariable {
    key: string;
    value: string;
    isSecret: boolean;
  }

  interface EnvironmentDetail {
    id: string;
    name: string;
    description: string | null;
    type: "github" | "local" | "manual";
    repoUrl: string | null;
    repoBranch: string | null;
    containerImage: string | null;
    workingDir: string | null;
    setupScript: string | null;
    networkAccess: boolean;
    persistVolume: boolean;
    threadCount: number;
    variables: EnvironmentVariable[];
  }

  interface ViberDetail {
    id: string;
    name: string;
    environmentId: string | null;
  }

  const SECRET_PLACEHOLDER = "••••••••";

  let loading = $state(true);
  let saving = $state(false);
  let deleting = $state(false);
  let assigning = $state(false);
  let error = $state<string | null>(null);

  let environment = $state<EnvironmentDetail | null>(null);
  let selectedViber = $state<ViberDetail | null>(null);

  let name = $state("");
  let description = $state("");
  let type = $state<"github" | "local" | "manual">("github");
  let repoUrl = $state("");
  let repoBranch = $state("");
  let containerImage = $state("universal");
  let workingDir = $state("");
  let setupScript = $state("");
  let networkAccess = $state(true);
  let persistVolume = $state(true);

  let variablesText = $state("");
  let secretsText = $state("");
  let variablesTouched = $state(false);
  let secretsTouched = $state(false);

  // GitHub repo picker state
  let githubConnected = $state<boolean | null>(null);
  let repoSearchQuery = $state("");
  let repoSearchResults = $state<
    Array<{
      fullName: string;
      name: string;
      owner: string;
      url: string;
      cloneUrl: string;
      defaultBranch: string;
      private: boolean;
      description: string | null;
    }>
  >([]);
  let repoSearching = $state(false);
  let repoDropdownOpen = $state(false);
  let manualUrlMode = $state(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const viberId = $derived($page.url.searchParams.get("viber") || "");
  const nodeId = $derived($page.url.searchParams.get("node") || "");
  const environmentRouteId = $derived($page.params.environmentId || "new");
  const isCreateMode = $derived(environmentRouteId === "new");

  function getListHref() {
    const params = new URLSearchParams();
    if (viberId) {
      params.set("viber", viberId);
    }
    if (nodeId) {
      params.set("node", nodeId);
    }
    const query = params.toString();
    return `/environments${query ? `?${query}` : ""}`;
  }

  function toLines(variables: EnvironmentVariable[], secret: boolean) {
    return variables
      .filter((item) => item.isSecret === secret)
      .map((item) => `${item.key}=${item.value}`)
      .join("\n");
  }

  function parseVariableLines(raw: string, isSecret: boolean) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const separator = line.indexOf("=");
        if (separator <= 0) return [];

        const key = line.slice(0, separator).trim();
        if (!key) return [];

        return [
          {
            key,
            value: line.slice(separator + 1).trim(),
            isSecret,
          },
        ];
      });
  }

  function fillForm(payload: EnvironmentDetail) {
    environment = payload;

    name = payload.name;
    description = payload.description || "";
    type = payload.type;
    repoUrl = payload.repoUrl || "";
    repoBranch = payload.repoBranch || "";
    containerImage = payload.containerImage || "universal";
    workingDir = payload.workingDir || "";
    setupScript = payload.setupScript || "";
    networkAccess = payload.networkAccess;
    persistVolume = payload.persistVolume;

    // Populate repo search query from saved URL (extract owner/repo)
    if (repoUrl) {
      const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
      repoSearchQuery = match ? match[1] : repoUrl;
    } else {
      repoSearchQuery = "";
    }

    variablesText = toLines(payload.variables, false);
    secretsText = toLines(payload.variables, true);
    variablesTouched = false;
    secretsTouched = false;
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

  async function fetchEnvironment() {
    if (isCreateMode) {
      environment = null;
      return;
    }

    const response = await fetch(`/api/environments/${environmentRouteId}`);
    const payload = await response.json();
    if (!response.ok || !payload.environment) {
      throw new Error(payload.error || "Failed to load environment.");
    }

    fillForm(payload.environment);
  }

  async function assignEnvironmentToViber(environmentId: string) {
    if (!viberId) return;

    assigning = true;
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
    } finally {
      assigning = false;
    }
  }

  async function loadPage() {
    loading = true;
    error = null;

    try {
      await Promise.all([fetchEnvironment(), fetchSelectedViber()]);
    } catch (loadError) {
      error =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load environment.";
    } finally {
      loading = false;
    }
  }

  async function saveEnvironment(next: "list" | "viber") {
    if (!name.trim() || saving) {
      if (!name.trim()) {
        error = "Environment name is required.";
      }
      return;
    }

    saving = true;
    error = null;

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        repoUrl: repoUrl.trim() || null,
        repoBranch: repoBranch.trim() || null,
        containerImage: containerImage.trim() || null,
        workingDir: workingDir.trim() || null,
        setupScript: setupScript.trim() || null,
        networkAccess,
        persistVolume,
      };

      if (isCreateMode || variablesTouched || secretsTouched) {
        body.variables = [
          ...parseVariableLines(variablesText, false),
          ...parseVariableLines(secretsText, true),
        ];
        body.replaceVariables = true;
      }

      const response = await fetch(
        isCreateMode
          ? "/api/environments"
          : `/api/environments/${environmentRouteId}`,
        {
          method: isCreateMode ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const payload = await response.json();
      if (!response.ok || !payload.environment) {
        throw new Error(payload.error || "Failed to save environment.");
      }

      const savedEnvironmentId = String(payload.environment.id);

      if (next === "viber") {
        const params = new URLSearchParams({ environment: savedEnvironmentId });
        if (viberId) {
          await assignEnvironmentToViber(savedEnvironmentId);
        }
        if (nodeId) {
          params.set("node", nodeId);
        }
        if (viberId) {
          await goto(`/vibers/${viberId}/vibers/new?${params.toString()}`);
        } else {
          await goto(`/vibers/new?${params.toString()}`);
        }
      } else {
        await goto(getListHref());
      }
    } catch (saveError) {
      error =
        saveError instanceof Error
          ? saveError.message
          : "Failed to save environment.";
      saving = false;
      return;
    }

    saving = false;
  }

  async function deleteEnvironment() {
    if (isCreateMode || deleting) return;

    const confirmed = window.confirm(
      "Delete this environment? This removes all related threads and messages.",
    );
    if (!confirmed) return;

    deleting = true;
    error = null;

    try {
      const response = await fetch(`/api/environments/${environmentRouteId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to delete environment.");
      }

      await goto(getListHref());
    } catch (deleteError) {
      error =
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete environment.";
      deleting = false;
      return;
    }

    deleting = false;
  }

  async function checkGitHubConnection() {
    try {
      const response = await fetch("/api/github/repos?per_page=1");
      const data = await response.json();
      githubConnected = data.connected !== false;
    } catch {
      githubConnected = false;
    }
  }

  async function searchRepos(query: string) {
    repoSearching = true;
    try {
      const params = new URLSearchParams({ per_page: "20" });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/github/repos?${params}`);
      const data = await response.json();
      repoSearchResults = data.repos || [];
      repoDropdownOpen = true;
    } catch {
      repoSearchResults = [];
    } finally {
      repoSearching = false;
    }
  }

  function handleRepoSearchInput(value: string) {
    repoSearchQuery = value;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => searchRepos(value), 300);
  }

  function selectRepo(repo: (typeof repoSearchResults)[0]) {
    repoUrl = repo.cloneUrl || repo.url;
    repoBranch = repo.defaultBranch || "main";
    repoSearchQuery = repo.fullName;
    repoDropdownOpen = false;
    // Auto-fill name if empty
    if (!name.trim()) {
      name = repo.name;
    }
  }

  onMount(() => {
    void loadPage();
    void checkGitHubConnection();
  });
</script>

<svelte:head>
  <title
    >{isCreateMode ? "New Environment" : "Edit Environment"} - OpenViber</title
  >
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="w-full px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-wide text-muted-foreground">
          Environment Setup
        </p>
        <h1 class="text-2xl font-semibold text-foreground">
          {isCreateMode ? "Create Environment" : "Edit Environment"}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Define runtime configuration, repository details, and secrets.
          {#if selectedViber}
            This environment can be assigned to
            <span class="font-medium text-foreground">{selectedViber.name}</span
            >.
          {/if}
        </p>
      </div>
      <a
        href={getListHref()}
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
      >
        <ArrowLeft class="size-4" />
        Back
      </a>
    </header>

    {#if loading}
      <div
        class="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        Loading environment...
      </div>
    {:else if error}
      <div
        class="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error}
      </div>
    {/if}

    {#if !loading}
      <div class="space-y-5">
        <section class="rounded-xl border border-border bg-card p-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label
                for="env-name"
                class="mb-1.5 block text-xs text-muted-foreground">Name</label
              >
              <input
                id="env-name"
                type="text"
                bind:value={name}
                placeholder="Frontend workspace"
                class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>

            <div class="sm:col-span-2">
              <label
                for="env-description"
                class="mb-1.5 block text-xs text-muted-foreground"
              >
                Description
              </label>
              <input
                id="env-description"
                type="text"
                bind:value={description}
                placeholder="What this environment is for"
                class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>

            <div>
              <label
                for="env-type"
                class="mb-1.5 block text-xs text-muted-foreground">Type</label
              >
              <select
                id="env-type"
                bind:value={type}
                class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="github">GitHub repository</option>
                <option value="local">Local path</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            <div>
              <label
                for="env-branch"
                class="mb-1.5 block text-xs text-muted-foreground">Branch</label
              >
              <input
                id="env-branch"
                type="text"
                bind:value={repoBranch}
                placeholder="main"
                class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>

            <div class="sm:col-span-2">
              <label
                for="env-repo"
                class="mb-1.5 block text-xs text-muted-foreground"
                >Repository</label
              >
              {#if type === "github" && !manualUrlMode}
                {#if githubConnected === false}
                  <div
                    class="flex items-center gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <Github class="size-5 text-muted-foreground shrink-0" />
                    <div class="flex-1 text-sm text-muted-foreground">
                      GitHub not connected.
                      <a
                        href="/auth/github?redirect={encodeURIComponent(
                          $page.url.pathname + $page.url.search,
                        )}"
                        class="text-primary underline">Sign in with GitHub</a
                      > to browse repos.
                    </div>
                  </div>
                  <button
                    type="button"
                    class="mt-1.5 text-xs text-muted-foreground underline hover:text-foreground"
                    onclick={() => (manualUrlMode = true)}
                  >
                    Enter URL manually
                  </button>
                {:else}
                  <div class="relative">
                    <div class="relative">
                      <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                      />
                      <input
                        id="env-repo"
                        type="text"
                        value={repoSearchQuery}
                        oninput={(e) =>
                          handleRepoSearchInput(
                            (e.target as HTMLInputElement).value,
                          )}
                        onfocus={() => {
                          if (repoSearchResults.length > 0)
                            repoDropdownOpen = true;
                          else searchRepos(repoSearchQuery);
                        }}
                        onblur={() =>
                          setTimeout(() => (repoDropdownOpen = false), 200)}
                        placeholder="Search your repositories…"
                        autocomplete="off"
                        class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm"
                      />
                      {#if repoSearching}
                        <div
                          class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                        >
                          Searching…
                        </div>
                      {/if}
                    </div>
                    {#if repoDropdownOpen && repoSearchResults.length > 0}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
                        onmousedown={(e) => e.preventDefault()}
                      >
                        {#each repoSearchResults as repo}
                          <button
                            type="button"
                            class="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
                            onclick={() => selectRepo(repo)}
                          >
                            <Github
                              class="size-4 mt-0.5 shrink-0 text-muted-foreground"
                            />
                            <div class="min-w-0 flex-1">
                              <div class="font-medium truncate">
                                {repo.fullName}
                              </div>
                              {#if repo.description}
                                <div
                                  class="text-xs text-muted-foreground truncate"
                                >
                                  {repo.description}
                                </div>
                              {/if}
                            </div>
                            {#if repo.private}
                              <span
                                class="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                                >Private</span
                              >
                            {/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  {#if repoUrl}
                    <div
                      class="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span class="truncate font-mono">{repoUrl}</span>
                      <a
                        href={repoUrl.replace(/\.git$/, "")}
                        target="_blank"
                        rel="noopener"
                        class="shrink-0 text-primary"
                      >
                        <ExternalLink class="size-3" />
                      </a>
                    </div>
                  {/if}
                  <button
                    type="button"
                    class="mt-1.5 text-xs text-muted-foreground underline hover:text-foreground"
                    onclick={() => (manualUrlMode = true)}
                  >
                    Enter URL manually
                  </button>
                {/if}
              {:else}
                <input
                  id="env-repo"
                  type="text"
                  bind:value={repoUrl}
                  placeholder="https://github.com/owner/repo"
                  class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
                {#if type === "github" && manualUrlMode}
                  <button
                    type="button"
                    class="mt-1.5 text-xs text-muted-foreground underline hover:text-foreground"
                    onclick={() => (manualUrlMode = false)}
                  >
                    Search repos instead
                  </button>
                {/if}
              {/if}
            </div>

            <div>
              <label
                for="env-image"
                class="mb-1.5 block text-xs text-muted-foreground"
                >Container image</label
              >
              <input
                id="env-image"
                type="text"
                bind:value={containerImage}
                placeholder="universal"
                class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>

            <div>
              <label
                for="env-workdir"
                class="mb-1.5 block text-xs text-muted-foreground"
              >
                Working directory
              </label>
              <input
                id="env-workdir"
                type="text"
                bind:value={workingDir}
                placeholder="/workspace"
                class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              />
            </div>

            <div class="sm:col-span-2">
              <label
                for="env-setup"
                class="mb-1.5 block text-xs text-muted-foreground"
                >Setup script</label
              >
              <textarea
                id="env-setup"
                rows="4"
                bind:value={setupScript}
                placeholder="pnpm install && pnpm test"
                class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              ></textarea>
            </div>

            <div>
              <label
                for="env-vars"
                class="mb-1.5 block text-xs text-muted-foreground"
              >
                Environment variables
              </label>
              <textarea
                id="env-vars"
                rows="6"
                bind:value={variablesText}
                oninput={() => (variablesTouched = true)}
                placeholder="API_BASE_URL=https://api.example.com"
                class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              ></textarea>
            </div>

            <div>
              <label
                for="env-secrets"
                class="mb-1.5 block text-xs text-muted-foreground"
              >
                Secrets
              </label>
              <textarea
                id="env-secrets"
                rows="6"
                bind:value={secretsText}
                oninput={() => (secretsTouched = true)}
                placeholder="OPENROUTER_API_KEY=..."
                class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              ></textarea>
              {#if !isCreateMode}
                <p class="mt-1 text-[11px] text-muted-foreground">
                  Existing secret values stay masked as `{SECRET_PLACEHOLDER}`
                  unless you replace them.
                </p>
              {/if}
            </div>

            <div
              class="sm:col-span-2 flex flex-wrap gap-4 text-sm text-muted-foreground"
            >
              <label class="inline-flex items-center gap-2">
                <input type="checkbox" bind:checked={networkAccess} />
                Agent internet access
              </label>
              <label class="inline-flex items-center gap-2">
                <input type="checkbox" bind:checked={persistVolume} />
                Persist workspace volume
              </label>
            </div>
          </div>
        </section>

        <section class="rounded-xl border border-border bg-card p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-sm text-muted-foreground">
              {#if isCreateMode}
                Save this environment, then assign it to a viber.
              {:else}
                This environment currently has {environment?.threadCount || 0} thread(s).
              {/if}
            </div>
            <div class="flex flex-wrap gap-2">
              {#if viberId}
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                  onclick={() => saveEnvironment("viber")}
                  disabled={saving || deleting || assigning}
                >
                  <Sparkles class="size-4" />
                  {saving || assigning ? "Saving..." : "Save & Use in Viber"}
                </button>
              {/if}

              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                onclick={() => saveEnvironment("list")}
                disabled={saving || deleting || assigning}
              >
                <Save class="size-4" />
                {saving ? "Saving..." : "Save Environment"}
              </button>

              {#if !isCreateMode}
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  onclick={deleteEnvironment}
                  disabled={saving || deleting || assigning}
                >
                  <Trash2 class="size-4" />
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              {/if}
            </div>
          </div>
        </section>
      </div>
    {/if}
  </div>
</div>
