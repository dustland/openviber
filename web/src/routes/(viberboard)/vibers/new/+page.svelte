<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { getVibersStore } from "$lib/stores/vibers";
  import {
    Sparkles,
  } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import type { Intent } from "$lib/data/intents";

  interface AccountSkill {
    id: string;
    name: string;
    description: string;
  }

  interface ViberNode {
    id: string;
    name: string;
    node_id: string | null;
    status: "pending" | "active" | "offline";
  }

  interface SidebarEnvironment {
    id: string;
    name: string;
    description?: string | null;
    type?: string | null;
    repoOrg?: string | null;
    repoName?: string | null;
    repoBranch?: string | null;
  }

  interface ChannelOption {
    id: string;
    label: string;
    description?: string;
    enabled: boolean;
  }

  let nodes = $state<ViberNode[]>([]);
  let environments = $state<SidebarEnvironment[]>([]);
  let accountSkills = $state<AccountSkill[]>([]);
  let channelOptions = $state<ChannelOption[]>([]);
  let selectedChannelIds = $state<string[]>([]);
  let selectedEnvironmentId = $state<string | null>(null);
  let selectedNodeId = $state<string | null>(null);
  let selectedModelId = $state("");
  let selectedSkillIds = $state<string[]>([]);
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

  // Derived: selected objects
  const selectedNode = $derived(
    nodes.find((n) => n.id === selectedNodeId) ?? null,
  );
  const selectedIntent = $derived(
    selectedIntentId
      ? intents.find((i) => i.id === selectedIntentId) ?? null
      : null,
  );

  // Only active nodes (with a daemon connected) can receive tasks
  const activeNodes = $derived(nodes.filter((n) => n.status === "active"));
  const enabledChannels = $derived(
    channelOptions.filter((channel) => channel.enabled),
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
      const [nodesRes, envsRes, settingsRes, skillsRes] = await Promise.all([
        fetch("/api/nodes"),
        fetch("/api/environments"),
        fetch("/api/settings"),
        fetch("/api/skills"),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        nodes = data.nodes ?? [];
      }
      if (envsRes.ok) {
        const data = await envsRes.json();
        environments = data.environments ?? [];
      }
      if (skillsRes.ok) {
        const data = await skillsRes.json();
        accountSkills = (data.skills ?? []).map((s: { id: string; name: string; description?: string }) => ({
          id: s.id,
          name: s.name,
          description: s.description || "",
        }));
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
    // Auto-enable skills required by this intent
    if (intent.skills && intent.skills.length > 0) {
      const merged = new Set(selectedSkillIds);
      for (const s of intent.skills) merged.add(s);
      selectedSkillIds = [...merged];
    }
    // Auto-submit the task when an intent is selected
    // submitTask will handle validation (node selection, active status, etc.)
    if (intent.body.trim()) {
      void submitTask(intent.body);
    }
  }

  function clearIntent() {
    selectedIntentId = null;
  }

  async function submitTask(overrideContent?: string) {
    const content = (overrideContent ?? taskInput).trim();
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!content || !node || node.status !== "active" || creating) return;

    creating = true;
    error = null;

    try {
      // The node's node_id is the daemon's ID on the hub
      const nodeId = node.node_id;

      // Create a new viber via POST /api/vibers
      // Use the intent name as the viber display title (not the full body)
      const title = selectedIntent?.name ?? undefined;

      const response = await fetch("/api/vibers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: content,
          title,
          nodeId: nodeId ?? undefined,
          environmentId: selectedEnvironmentId ?? undefined,
          channelIds: selectedChannelIds.length > 0 ? selectedChannelIds : undefined,
          model: selectedModelId || undefined,
          skills: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
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
          class="mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 text-primary"
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
            {#if intents.length > 0}
              <button
                type="button"
                class="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                onclick={() => (showIntentDialog = true)}
              >
                All intents
              </button>
            {/if}
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
          <div
            class="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {#each previewIntents as intent (intent.id)}
              <button
                type="button"
                class="w-[260px] shrink-0 snap-start rounded-xl border p-4 text-left transition-all sm:w-auto sm:min-w-0 {selectedIntentId ===
                intent.id
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'}"
                onclick={() => selectIntent(intent)}
              >
                <p class="truncate text-sm font-medium text-foreground">
                  {intent.name}
                </p>
                <p class="truncate text-xs text-muted-foreground mt-0.5">
                  {intent.description}
                </p>
                {#if intent.body}
                  <p class="mt-2 text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3 whitespace-pre-line">
                    {intent.body.split('\n').filter(Boolean).slice(0, 3).join('\n')}
                  </p>
                {/if}
              </button>
            {/each}

          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Bottom input bar -->
  <div class="shrink-0 p-3 sm:p-4">
    <div class="mx-auto w-full max-w-3xl">
      <ChatComposer
        bind:value={taskInput}
        bind:error
        bind:selectedNodeId
        bind:selectedEnvironmentId
        bind:selectedModelId
        placeholder="Describe what you want to build, or pick an intent above..."
        disabled={creating}
        sending={creating}
        {nodes}
        {environments}
        skills={accountSkills}
        bind:selectedSkillIds
        onsubmit={() => void submitTask()}
      />
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
            <div class="flex items-center gap-2 min-w-0">
              <p class="truncate text-sm font-medium text-foreground">
                {intent.name}
              </p>
              {#if intent.builtin}
                <span
                  class="shrink-0 inline-block rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  built-in
                </span>
              {/if}
            </div>
            <p class="truncate text-xs text-muted-foreground mt-0.5">
              {intent.description}
            </p>
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

