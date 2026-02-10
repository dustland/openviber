<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { getVibersStore } from "$lib/stores/vibers";
  import {
    Bug,
    Code2,
    FileText,
    HeartPulse,
    MoreHorizontal,
    Palette,
    ShieldCheck,
    Sparkles,
    TrainFront,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import type { Intent } from "$lib/data/intents";

  interface ViberNode {
    id: string;
    name: string;
    node_id: string | null;
    status: "pending" | "active" | "offline";
  }

  interface SidebarEnvironment {
    id: string;
    name: string;
  }

  interface ChannelOption {
    id: string;
    label: string;
    description?: string;
    enabled: boolean;
  }

  const INTENT_ICONS: Record<string, typeof Sparkles> = {
    palette: Palette,
    sparkles: Sparkles,
    "heart-pulse": HeartPulse,
    "shield-check": ShieldCheck,
    "file-text": FileText,
    "code-2": Code2,
    bug: Bug,
    "train-front": TrainFront,
  };

  let nodes = $state<ViberNode[]>([]);
  let environments = $state<SidebarEnvironment[]>([]);
  let channelOptions = $state<ChannelOption[]>([]);
  let selectedChannelIds = $state<string[]>([]);
  let selectedEnvironmentId = $state<string | null>(null);
  let selectedNodeId = $state<string | null>(null);
  let selectedModelId = $state("");
  let taskInput = $state("");
  let creating = $state(false);
  let error = $state<string | null>(null);

  // Intents
  let intents = $state<Intent[]>([]);
  let intentsLoading = $state(true);
  let selectedIntentId = $state<string | null>(null);
  let intentPresetApplied = $state(false);

  let showIntentDialog = $state(false);

  // Show first 3 intents inline, rest in dialog
  const previewIntents = $derived(intents.slice(0, 3));
  const hasMoreIntents = $derived(intents.length > 3);

  // Derived: selected objects
  const selectedEnvironment = $derived(
    environments.find((e) => e.id === selectedEnvironmentId) ?? null,
  );
  const selectedNode = $derived(
    nodes.find((n) => n.id === selectedNodeId) ?? null,
  );
  const selectedIntent = $derived(
    selectedIntentId
      ? intents.find((i) => i.id === selectedIntentId) ?? null
      : null,
  );
  const selectedModel = $derived(
    MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0],
  );

  // Only active nodes (with a daemon connected) can receive tasks
  const activeNodes = $derived(nodes.filter((n) => n.status === "active"));
  const enabledChannels = $derived(
    channelOptions.filter((channel) => channel.enabled),
  );

  // Can we send?
  const canSend = $derived(
    !!selectedNode &&
      selectedNode.status === "active" &&
      !!taskInput.trim() &&
      !creating,
  );

  // Apply intent from query param (e.g. /vibers/new?intent=beautify-homepage)
  $effect(() => {
    if (intentPresetApplied || intentsLoading) return;
    const intentId = $page.url.searchParams.get("intent");
    if (!intentId) return;
    const match = intents.find((i) => i.id === intentId);
    if (!match) return;
    selectIntent(match);
    intentPresetApplied = true;
  });

  async function fetchData() {
    try {
      const [nodesRes, envsRes, settingsRes] = await Promise.all([
        fetch("/api/nodes"),
        fetch("/api/environments"),
        fetch("/api/settings"),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        nodes = data.nodes ?? [];
      }
      if (envsRes.ok) {
        const data = await envsRes.json();
        environments = data.environments ?? [];
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const channels = data.channels ?? {};
        channelOptions = Object.entries(channels).map(([id, channel]) => ({
          id,
          label: (channel as Record<string, unknown>).displayName as string ?? id,
          description: (channel as Record<string, unknown>).description as string ?? "",
          enabled: ((channel as Record<string, unknown>).enabled as boolean) ?? false,
        }));
        if (selectedChannelIds.length === 0) {
          selectedChannelIds = channelOptions
            .filter((channel) => channel.enabled)
            .map((channel) => channel.id);
        }
        // Pre-select the user's default chat model
        if (data.chatModel && !selectedModelId) {
          selectedModelId = data.chatModel;
        }
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

  async function fetchIntents() {
    intentsLoading = true;
    try {
      const res = await fetch("/api/intents");
      if (res.ok) {
        const data = await res.json();
        intents = data.intents ?? [];
      }
    } catch (err) {
      console.error("Failed to fetch intents:", err);
    } finally {
      intentsLoading = false;
    }
  }

  function selectEnvironment(envId: string | null) {
    selectedEnvironmentId = envId;
  }

  function selectNode(nodeId: string) {
    selectedNodeId = nodeId;
  }

  function toggleChannel(channelId: string) {
    if (selectedChannelIds.includes(channelId)) {
      selectedChannelIds = selectedChannelIds.filter((id) => id !== channelId);
    } else {
      selectedChannelIds = [...selectedChannelIds, channelId];
    }
  }

  function selectIntent(intent: Intent) {
    selectedIntentId = intent.id;
    taskInput = intent.body;
  }

  function clearIntent() {
    selectedIntentId = null;
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
          channelIds: selectedChannelIds.length > 0 ? selectedChannelIds : undefined,
          model: selectedModelId || undefined,
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

  onMount(() => {
    fetchData();
    fetchIntents();
  });
</script>

<svelte:head>
  <title>New Viber - OpenViber</title>
</svelte:head>

<div class="new-task-page flex h-full min-h-0 flex-col overflow-hidden">
  <!-- Main content area: intents grid -->
  <div class="flex-1 overflow-y-auto">
    <div
      class="mx-auto flex h-full w-full max-w-3xl flex-col items-center px-4 py-12"
    >
      <!-- Hero -->
      <div class="mb-10 text-center">
        <div
          class="mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary"
        >
          <Sparkles class="size-7" />
        </div>
        <h1 class="text-3xl font-semibold tracking-tight text-foreground">
          What would you like to build?
        </h1>
        <p class="mt-2 text-base text-muted-foreground">
          Pick an intent to get started, or describe your own task below.
        </p>
      </div>

      <!-- Start with Intents -->
      <div class="w-full">
        <div class="flex items-center justify-between mb-4">
          <h2
            class="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Start with Intents
          </h2>
          <div class="flex items-center gap-3">
            {#if selectedIntent}
              <button
                type="button"
                class="text-[11px] text-muted-foreground hover:text-foreground"
                onclick={clearIntent}
              >
                Clear
              </button>
            {/if}
            <a
              href="/settings/intents"
              class="text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              Manage
            </a>
          </div>
        </div>

        {#if intentsLoading}
          <div class="text-center py-8 text-sm text-muted-foreground">
            Loading intents...
          </div>
        {:else if intents.length === 0}
          <div
            class="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground"
          >
            No intents found. <a href="/settings/intents" class="text-primary hover:underline">Create one</a> to get started.
          </div>
        {:else}
          <div class="flex gap-3">
            {#each previewIntents as intent (intent.id)}
              {@const IconComponent = INTENT_ICONS[intent.icon] ?? Sparkles}
              <button
                type="button"
                class="flex-1 min-w-0 rounded-xl border p-4 text-left transition-all {selectedIntentId ===
                intent.id
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'}"
                onclick={() => selectIntent(intent)}
              >
                <div class="flex items-start gap-3">
                  <div
                    class="size-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0"
                  >
                    <IconComponent class="size-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {intent.name}
                    </p>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {intent.description}
                    </p>
                  </div>
                </div>
                {#if intent.body}
                  <p class="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3 whitespace-pre-line">
                    {intent.body.split('\n').filter(Boolean).slice(0, 3).join('\n')}
                  </p>
                {/if}
              </button>
            {/each}

            {#if hasMoreIntents}
              <button
                type="button"
                class="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:border-primary/30 hover:bg-accent/40 hover:text-foreground"
                onclick={() => (showIntentDialog = true)}
                title="Show all {intents.length} intents"
              >
                <MoreHorizontal class="size-5" />
                <span class="mt-1 text-[10px]">More</span>
              </button>
            {/if}
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
          onkeydown={handleKeydown}
          rows="1"
          placeholder={selectedNode?.status === "active"
            ? "Describe what you want to build, or pick an intent above..."
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

      <!-- Selectors row -->
      <div class="flex items-center gap-1 px-1">
        <!-- Node selector -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground cursor-pointer"
          >
            {#if selectedNode}
              <span
                class="size-1.5 shrink-0 rounded-full"
                class:bg-emerald-500={selectedNode.status === "active"}
                class:bg-amber-500={selectedNode.status === "pending"}
                class:bg-zinc-400={selectedNode.status === "offline"}
              ></span>
              <span>{selectedNode.name}</span>
            {:else}
              <Server class="size-3 opacity-40" />
              <span>Node</span>
            {/if}
            <ChevronDown class="size-2.5 opacity-40" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64">
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
                      <span class="text-xs text-muted-foreground">({node.status})</span>
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

        <span class="text-muted-foreground/30">·</span>
        <!-- Environment selector -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground cursor-pointer"
          >
            {#if selectedEnvironment}
              <FolderGit2 class="size-3 opacity-50" />
              <span>{selectedEnvironment.name}</span>
            {:else}
              <FolderGit2 class="size-3 opacity-40" />
              <span>Environment</span>
            {/if}
            <ChevronDown class="size-2.5 opacity-40" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-56">
            <DropdownMenu.Label>Select environment</DropdownMenu.Label>
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

        <span class="text-muted-foreground/30">·</span>
        <!-- Model selector -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground cursor-pointer"
          >
            <Cpu class="size-3 opacity-40" />
            <span>{selectedModel.label}</span>
            <ChevronDown class="size-2.5 opacity-40" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64">
            <DropdownMenu.Label>Select model</DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#each MODEL_OPTIONS as opt (opt.id)}
              <DropdownMenu.Item
                onclick={() => (selectedModelId = opt.id)}
                class="flex items-center justify-between"
              >
                <span class="flex items-center gap-2">
                  {opt.label}
                  {#if opt.badge}
                    <span class="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {opt.badge}
                    </span>
                  {/if}
                </span>
                {#if selectedModelId === opt.id}
                  <Check class="size-3.5 text-primary" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        {#if !selectedNode}
          <span class="text-[11px] italic text-muted-foreground/50">— pick a node</span>
        {:else if selectedNode.status !== "active"}
          <span class="text-[11px] italic text-amber-500/70">{selectedNode.status}</span>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- All Intents dialog -->
<Dialog.Root bind:open={showIntentDialog}>
  <Dialog.Content class="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
    <Dialog.Header class="px-5 pt-5 pb-3">
      <Dialog.Title>All Intents</Dialog.Title>
      <Dialog.Description>
        {intents.length} intent{intents.length !== 1 ? "s" : ""} available
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 overflow-y-auto px-5 pb-2">
      <div class="space-y-2">
        {#each intents as intent (intent.id)}
          {@const IconComponent = INTENT_ICONS[intent.icon] ?? Sparkles}
          <button
            type="button"
            class="w-full rounded-xl border p-4 text-left transition-all {selectedIntentId ===
            intent.id
              ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
              : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'}"
            onclick={() => {
              selectIntent(intent);
              showIntentDialog = false;
            }}
          >
            <div class="flex items-start gap-3">
              <div
                class="size-9 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0"
              >
                <IconComponent class="size-4" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium text-foreground">
                    {intent.name}
                  </p>
                  {#if intent.builtin}
                    <span
                      class="inline-block rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      built-in
                    </span>
                  {/if}
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {intent.description}
                </p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>

    <Dialog.Footer class="border-t border-border px-5 py-3">
      <a
        href="/settings/intents"
        class="text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        Manage intents in Settings
      </a>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

