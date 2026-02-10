<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { getVibersStore } from "$lib/stores/vibers";
  import {
    ArrowUp,
    Bug,
    ChevronDown,
    Check,
    Code2,
    Server,
    FolderGit2,
    Package,
    Search,
    Sparkles,
    Palette,
  } from "@lucide/svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { TASK_TEMPLATES, type TaskTemplate } from "$lib/data/task-templates";
  import TemplateParams from "$lib/components/template-params.svelte";
  import {
    applyTemplate as applyTemplateString,
    applySmartDefaults,
    buildDefaultParams,
    buildEnvironmentSmartFields,
    type TemplateParam,
    type TemplateSmartFields,
  } from "$lib/data/template-utils";
  import { Textarea } from "$lib/components/ui/textarea";

  interface ViberNode {
    id: string;
    name: string;
    node_id: string | null;
    status: "pending" | "active" | "offline";
  }

  interface SidebarEnvironment {
    id: string;
    name: string;
    repoUrl?: string | null;
    repoOrg?: string | null;
    repoName?: string | null;
    repoBranch?: string | null;
    workingDir?: string | null;
  }

  let nodes = $state<ViberNode[]>([]);
  let environments = $state<SidebarEnvironment[]>([]);
  let selectedEnvironmentId = $state<string | null>(null);
  let selectedNodeId = $state<string | null>(null);
  let taskInput = $state("");
  let creating = $state(false);
  let error = $state<string | null>(null);
  let selectedTemplateId = $state<string | null>(null);
  let templateParams = $state<Record<string, string>>({});
  let templateParamDefs = $state<TemplateParam[]>([]);
  let autoPrompt = $state(false);
  let storyPresetApplied = $state(false);

  // Derived: selected objects
  const selectedEnvironment = $derived(
    environments.find((e) => e.id === selectedEnvironmentId) ?? null,
  );
  const selectedNode = $derived(
    nodes.find((n) => n.id === selectedNodeId) ?? null,
  );

  // Only active nodes (with a daemon connected) can receive tasks
  const activeNodes = $derived(nodes.filter((n) => n.status === "active"));

  // Can we send?
  const canSend = $derived(
    !!selectedNode &&
      selectedNode.status === "active" &&
      !!taskInput.trim() &&
      !creating,
  );

  const TEMPLATE_ICONS = {
    palette: Palette,
    sparkles: Sparkles,
  } as const;

  const selectedTemplate = $derived(
    selectedTemplateId
      ? TASK_TEMPLATES.find((tpl) => tpl.id === selectedTemplateId) ?? null
      : null,
  );

  const environmentSmartFields = $derived.by((): TemplateSmartFields => {
    if (!selectedEnvironment) return {};
    return buildEnvironmentSmartFields(selectedEnvironment);
  });

  const templatePromptPreview = $derived.by(() => {
    if (!selectedTemplate) return "";
    return applyTemplateString(
      selectedTemplate.promptTemplate,
      templateParams,
      environmentSmartFields,
    ).trim();
  });

  $effect(() => {
    if (storyPresetApplied) return;
    const storyId = $page.url.searchParams.get("story");
    if (!storyId) return;
    const match = TASK_TEMPLATES.find((tpl) => tpl.id === storyId);
    if (!match) return;
    const baseParams = buildDefaultParams(match.params);
    const paramValues = applySmartDefaults(baseParams, environmentSmartFields);
    selectTemplate(match, paramValues);
    taskInput = applyTemplateString(
      match.promptTemplate,
      paramValues,
      environmentSmartFields,
    ).trim();
    autoPrompt = true;
    storyPresetApplied = true;
  });

  $effect(() => {
    if (!selectedTemplate) return;
    const next = applySmartDefaults(templateParams, environmentSmartFields);
    if (next === templateParams) return;
    const keys = Object.keys(next);
    const changed =
      keys.length !== Object.keys(templateParams).length ||
      keys.some((key) => next[key] !== templateParams[key]);
    if (changed) {
      templateParams = next;
    }
  });

  $effect(() => {
    if (!autoPrompt || !selectedTemplate) return;
    if (!templatePromptPreview) return;
    if (taskInput === templatePromptPreview) return;
    taskInput = templatePromptPreview;
  });

  async function fetchData() {
    try {
      const [nodesRes, envsRes] = await Promise.all([
        fetch("/api/nodes"),
        fetch("/api/environments"),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        nodes = data.nodes ?? [];
      }
      if (envsRes.ok) {
        const data = await envsRes.json();
        environments = (data.environments ?? []).map(
          (env: {
            id: string;
            name?: string;
            repoUrl?: string | null;
            repoOrg?: string | null;
            repoName?: string | null;
            repoBranch?: string | null;
            workingDir?: string | null;
          }) => ({
            id: env.id,
            name: env.name ?? "Unnamed",
            repoUrl: env.repoUrl ?? null,
            repoOrg: env.repoOrg ?? null,
            repoName: env.repoName ?? null,
            repoBranch: env.repoBranch ?? null,
            workingDir: env.workingDir ?? null,
          }),
        );
      }

      // Auto-select if only one environment
      if (environments.length === 1 && !selectedEnvironmentId) {
        selectedEnvironmentId = environments[0].id;
      }

      // Auto-select if only one active node
      if (activeNodes.length === 1 && !selectedNodeId) {
        selectedNodeId = activeNodes[0].id;
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  }

  function selectEnvironment(envId: string | null) {
    selectedEnvironmentId = envId;
  }

  function selectNode(nodeId: string) {
    selectedNodeId = nodeId;
  }

  async function submitTask(overrideContent?: string) {
    const content = (overrideContent ?? taskInput).trim();
    if (
      !content ||
      !selectedNode ||
      selectedNode.status !== "active" ||
      creating
    )
      return;

    creating = true;
    error = null;

    try {
      // The node's node_id is the daemon's ID on the hub
      const nodeId = selectedNode.node_id;

      // Create a new viber via POST /api/vibers
      const response = await fetch("/api/vibers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: content,
          nodeId: nodeId ?? undefined,
          environmentId: selectedEnvironmentId ?? undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create viber.");
      }

      const viberId = payload.viberId;

      // Update cached viber list so sidebar/list show the new viber
      void getVibersStore().invalidate();

      // Store the goal in sessionStorage for the viber chat page to pick up
      window.sessionStorage.setItem(
        `openviber:new-viber-task:${viberId}`,
        content,
      );

      // Navigate to the new viber's chat page
      await goto(`/vibers/${viberId}`);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create viber.";
      creating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) void submitTask();
    }
  }

  function useSuggestion(text: string) {
    if (!selectedNode || selectedNode.status !== "active") {
      taskInput = text;
      autoPrompt = false;
      return;
    }
    void submitTask(text);
  }

  function selectTemplate(
    tpl: TaskTemplate,
    presetValues?: Record<string, string>,
  ) {
    selectedTemplateId = tpl.id;
    templateParamDefs = tpl.params ?? [];
    const baseParams = presetValues ?? buildDefaultParams(tpl.params);
    templateParams = applySmartDefaults(baseParams, environmentSmartFields);
  }

  function updateTemplateParam(id: string, value: string) {
    templateParams = { ...templateParams, [id]: value };
  }

  function useTemplatePrompt() {
    if (!templatePromptPreview) return;
    taskInput = templatePromptPreview;
    autoPrompt = true;
  }

  onMount(() => {
    fetchData();
  });
</script>

<svelte:head>
  <title>New Viber - OpenViber</title>
</svelte:head>

<div class="new-task-page flex h-full min-h-0 flex-col overflow-hidden">
  <!-- Main content area: hero + cards -->
  <div class="flex-1 overflow-y-auto">
    <div
      class="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-8"
    >
      <!-- Hero -->
      <div class="mb-10 text-center">
        <div
          class="mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary"
        >
          <Sparkles class="size-7" />
        </div>
        <h1 class="text-3xl font-semibold tracking-tight text-foreground">
          Let's build
        </h1>

        <!-- Environment selector (Codex-style inline dropdown) -->
        <div class="mt-3 inline-flex items-center justify-center">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex items-center gap-1.5 text-lg text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              {#if selectedEnvironment}
                <FolderGit2 class="size-4 opacity-60" />
                <span>{selectedEnvironment.name}</span>
              {:else}
                <span class="italic opacity-70">select environment</span>
              {/if}
              <ChevronDown class="size-3.5 opacity-50" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="center" class="w-56">
              <DropdownMenu.Label>Select your environment</DropdownMenu.Label>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onclick={() => selectEnvironment(null)}
                class="flex items-center justify-between"
              >
                <span class="flex items-center gap-2">
                  <Package class="size-4 opacity-60" />
                  All environments
                </span>
                {#if selectedEnvironmentId === null}
                  <Check class="size-3.5 text-primary" />
                {/if}
              </DropdownMenu.Item>
              {#each environments as env (env.id)}
                <DropdownMenu.Item
                  onclick={() => selectEnvironment(env.id)}
                  class="flex items-center justify-between"
                >
                  <span class="flex items-center gap-2">
                    <FolderGit2 class="size-4 opacity-60" />
                    {env.name}
                  </span>
                  {#if selectedEnvironmentId === env.id}
                    <Check class="size-3.5 text-primary" />
                  {/if}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>

      <!-- Node selector (pick which node to run the new viber on) -->
      <div class="mb-8">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:bg-accent/50 cursor-pointer"
          >
            {#if selectedNode}
              <span
                class="size-2 shrink-0 rounded-full"
                class:bg-emerald-500={selectedNode.status === "active"}
                class:bg-amber-500={selectedNode.status === "pending"}
                class:bg-zinc-400={selectedNode.status === "offline"}
              ></span>
              <Server class="size-3.5 opacity-60" />
              <span class="font-medium text-foreground"
                >{selectedNode.name}</span
              >
              {#if selectedNode.status !== "active"}
                <span class="text-xs text-muted-foreground"
                  >({selectedNode.status})</span
                >
              {/if}
            {:else}
              <Server class="size-3.5 opacity-40" />
              <span class="text-muted-foreground">Choose node</span>
            {/if}
            <ChevronDown class="size-3.5 opacity-50" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="center" class="w-64">
            <DropdownMenu.Label>Select node</DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#if nodes.length === 0}
              <div class="px-2 py-3 text-center text-xs text-muted-foreground">
                No nodes registered. Go to
                <a href="/nodes" class="underline">Nodes</a> to add one.
              </div>
            {:else}
              {#each nodes as node (node.id)}
                <DropdownMenu.Item
                  onclick={() => selectNode(node.id)}
                  class="flex items-center justify-between"
                  disabled={node.status !== "active"}
                >
                  <span class="flex items-center gap-2">
                    <span
                      class="size-2 shrink-0 rounded-full"
                      class:bg-emerald-500={node.status === "active"}
                      class:bg-amber-500={node.status === "pending"}
                      class:bg-zinc-400={node.status === "offline"}
                    ></span>
                    {node.name}
                    {#if node.status !== "active"}
                      <span class="text-xs text-muted-foreground"
                        >({node.status})</span
                      >
                    {/if}
                  </span>
                  {#if selectedNodeId === node.id}
                    <Check class="size-3.5 text-primary" />
                  {/if}
                </DropdownMenu.Item>
              {/each}
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <!-- Suggestion cards -->
      <div class="grid w-full max-w-2xl grid-cols-3 gap-3">
        <button
          type="button"
          class="suggestion-card group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-accent/40"
          onclick={() => useSuggestion("Build a new feature for this project.")}
        >
          <div
            class="flex size-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500"
          >
            <Code2 class="size-4" />
          </div>
          <p class="text-sm font-medium text-foreground">Build a feature</p>
          <p class="text-xs leading-relaxed text-muted-foreground">
            Add functionality to the codebase
          </p>
        </button>

        <button
          type="button"
          class="suggestion-card group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-accent/40"
          onclick={() =>
            useSuggestion("Find and fix bugs in the current codebase.")}
        >
          <div
            class="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500"
          >
            <Bug class="size-4" />
          </div>
          <p class="text-sm font-medium text-foreground">Fix a bug</p>
          <p class="text-xs leading-relaxed text-muted-foreground">
            Track down and resolve issues
          </p>
        </button>

        <button
          type="button"
          class="suggestion-card group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:bg-accent/40"
          onclick={() =>
            useSuggestion(
              "Review the codebase and explain the project structure.",
            )}
        >
          <div
            class="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500"
          >
            <Search class="size-4" />
          </div>
          <p class="text-sm font-medium text-foreground">Review codebase</p>
          <p class="text-xs leading-relaxed text-muted-foreground">
            Understand the project structure
          </p>
        </button>
      </div>

      <!-- Viber stories -->
      <div class="mt-10 w-full max-w-2xl">
        <div class="flex items-center justify-between mb-3">
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Viber stories
          </h2>
          {#if selectedTemplate}
            <span class="text-[11px] text-muted-foreground">
              Selected story: {selectedTemplate.label}
            </span>
          {/if}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {#each TASK_TEMPLATES as tpl}
            <button
              type="button"
              class={`rounded-xl border p-4 text-left transition-all ${
                selectedTemplateId === tpl.id
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:border-primary/30 hover:bg-accent/40"
              }`}
              onclick={() => selectTemplate(tpl)}
            >
              <div class="flex items-start gap-3">
                <div
                  class="size-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground"
                >
                  <svelte:component
                    this={TEMPLATE_ICONS[tpl.icon]}
                    class="size-4"
                  />
                </div>
                <div>
                  <p class="text-sm font-medium text-foreground">
                    {tpl.label}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    {tpl.description}
                  </p>
                </div>
              </div>
            </button>
          {/each}
        </div>

        {#if selectedTemplate}
          <div class="mt-4 rounded-xl border border-border bg-muted/20 p-4">
            <TemplateParams
              params={templateParamDefs}
              values={templateParams}
              onChange={updateTemplateParam}
              title="Story inputs"
            />

            <div class="mt-4 space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Story prompt
                </p>
                <button
                  type="button"
                  class="text-[11px] font-medium text-primary hover:underline"
                  onclick={useTemplatePrompt}
                >
                  Insert prompt
                </button>
              </div>
              <Textarea
                value={templatePromptPreview}
                rows={6}
                class="resize-y min-h-[120px] font-mono text-xs"
                readonly
              />
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Bottom input bar -->
  <div class="shrink-0 p-3 sm:p-4">
    <div class="mx-auto w-full max-w-3xl space-y-2">
      {#if error}
        <div
          class="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </div>
      {/if}

      <!-- Input bar -->
      <div
        class="flex items-end gap-2 rounded-2xl border border-border bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur transition-colors"
        class:opacity-60={!canSend && !taskInput.trim()}
      >
        <textarea
          bind:value={taskInput}
          on:input={() => {
            if (autoPrompt) autoPrompt = false;
          }}
          onkeydown={handleKeydown}
          rows="1"
          placeholder={selectedNode?.status === "active"
            ? "Describe what you want to build..."
            : "Select an active node first..."}
          class="min-h-[40px] max-h-36 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          disabled={!selectedNode ||
            selectedNode.status !== "active" ||
            creating}
        ></textarea>

        <button
          type="button"
          class="inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
          onclick={() => void submitTask()}
          disabled={!canSend}
          title="Create viber and send task"
        >
          <ArrowUp class="size-4" />
        </button>
      </div>

      <!-- Status row -->
      <div
        class="flex items-center gap-2 px-1 text-[11px] text-muted-foreground"
      >
        {#if selectedEnvironment}
          <span
            class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5"
          >
            <FolderGit2 class="size-3" />
            {selectedEnvironment.name}
          </span>
        {/if}
        {#if selectedNode}
          <span
            class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5"
          >
            <span
              class="size-1.5 rounded-full"
              class:bg-emerald-500={selectedNode.status === "active"}
              class:bg-amber-500={selectedNode.status === "pending"}
              class:bg-zinc-400={selectedNode.status === "offline"}
            ></span>
            {selectedNode.name}
          </span>
        {/if}
        {#if !selectedNode}
          <span class="italic">Choose a node to run the viber on</span>
        {:else if selectedNode.status !== "active"}
          <span class="italic text-amber-500"
            >Node is {selectedNode.status} — start the daemon to continue</span
          >
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .suggestion-card {
    min-height: 120px;
  }

  @media (max-width: 640px) {
    .suggestion-card {
      min-height: 100px;
    }
  }
</style>
