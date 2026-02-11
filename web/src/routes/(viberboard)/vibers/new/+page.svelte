<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { getVibersStore } from "$lib/stores/vibers";
  import { Sparkles } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import { inferIntentSkills, type Intent } from "$lib/data/intents";

  interface AccountSkill {
    id: string;
    name: string;
    description: string;
    available?: boolean;
    status?: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
    healthSummary?: string;
  }

  interface ViberNode {
    id: string;
    name: string;
    node_id: string | null;
    status: "pending" | "active" | "offline";
    skills?: Array<{
      id: string;
      name: string;
      description?: string;
      available: boolean;
      status: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
      healthSummary?: string;
    }>;
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
  let showSkillSetupDialog = $state(false);
  let setupSkill = $state<AccountSkill | null>(null);
  let settingUpSkill = $state(false);
  let setupSkillError = $state<string | null>(null);
  let setupAuthAction = $state<"copy" | "start">("copy");
  let setupAuthCommand = $state<string | null>(null);
  let pendingIntentBody = $state<string | null>(null);
  let pendingIntentRequiredSkills = $state<string[]>([]);

  // Show first 3 intents inline, rest in dialog
  const previewIntents = $derived(intents.slice(0, 3));

  // Derived: selected objects
  const selectedNode = $derived(
    nodes.find((n) => n.id === selectedNodeId) ?? null,
  );
  const selectedIntent = $derived(
    selectedIntentId
      ? (intents.find((i) => i.id === selectedIntentId) ?? null)
      : null,
  );

  const selectedNodeSkills = $derived(selectedNode?.skills ?? []);
  const composerSkills = $derived.by(() => {
    const nodeSkillMap = new Map<
      string,
      { available: boolean; status: string; healthSummary?: string }
    >();
    for (const skill of selectedNodeSkills) {
      nodeSkillMap.set(skill.id, {
        available: skill.available,
        status: skill.status,
        healthSummary: skill.healthSummary,
      });
      nodeSkillMap.set(skill.name, {
        available: skill.available,
        status: skill.status,
        healthSummary: skill.healthSummary,
      });
    }

    const hasNodeSkillInventory = selectedNodeSkills.length > 0;
    return accountSkills.map((skill) => {
      const fromNode = nodeSkillMap.get(skill.id) || nodeSkillMap.get(skill.name);
      const available = hasNodeSkillInventory
        ? Boolean(fromNode?.available)
        : skill.available;

      return {
        ...skill,
        available,
        status: (fromNode?.status as AccountSkill["status"]) ?? skill.status,
        healthSummary:
          fromNode?.healthSummary ||
          (hasNodeSkillInventory && available === false
            ? "Not ready on selected node"
            : skill.healthSummary),
      };
    });
  });

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

  $effect(() => {
    if (!pendingIntentBody) return;
    if (showSkillSetupDialog || settingUpSkill || creating) return;

    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node || node.status !== "active") return;

    const missing = getUnavailableSkills(pendingIntentRequiredSkills);
    if (missing.length > 0) {
      openSkillSetupDialog(
        missing[0],
        `${missing[0].name} is required before auto-launching this intent.`,
      );
      return;
    }

    const autoLaunchBody = pendingIntentBody;
    pendingIntentBody = null;
    pendingIntentRequiredSkills = [];
    void submitTask(autoLaunchBody);
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
        nodes = (data.nodes ?? []).map((node: any) => ({
          id: node.id,
          name: node.name,
          node_id: node.node_id ?? null,
          status: node.status ?? "offline",
          skills: Array.isArray(node.skills)
            ? node.skills.map((skill: any) => ({
              id: skill.id || skill.name,
              name: skill.name || skill.id,
              description: skill.description || "",
              available: Boolean(skill.available),
              status: skill.status || "UNKNOWN",
              healthSummary: skill.healthSummary || "",
            }))
            : [],
        }));
      }
      if (envsRes.ok) {
        const data = await envsRes.json();
        environments = data.environments ?? [];
      }
      if (skillsRes.ok) {
        const data = await skillsRes.json();
        accountSkills = (data.skills ?? []).map(
          (s: { id: string; name: string; description?: string }) => ({
            id: s.id,
            name: s.name,
            description: s.description || "",
          }),
        );
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const channels = data.channels ?? {};
        channelOptions = Object.entries(channels).map(([id, channel]) => ({
          id,
          label:
            ((channel as Record<string, unknown>).displayName as string) ?? id,
          description:
            ((channel as Record<string, unknown>).description as string) ?? "",
          enabled:
            ((channel as Record<string, unknown>).enabled as boolean) ?? false,
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

      const requestedEnvironmentId =
        $page.url.searchParams.get("environment") || null;
      const requestedNodeId = $page.url.searchParams.get("node") || null;

      if (requestedEnvironmentId) {
        const matchedEnvironment = environments.find(
          (environment) => environment.id === requestedEnvironmentId,
        );
        if (matchedEnvironment) {
          selectedEnvironmentId = matchedEnvironment.id;
        }
      } else if (environments.length === 1 && !selectedEnvironmentId) {
        // Auto-select if only one environment
        selectedEnvironmentId = environments[0].id;
      }

      if (requestedNodeId) {
        const matchedNode = activeNodes.find(
          (node) => node.id === requestedNodeId || node.node_id === requestedNodeId,
        );
        if (matchedNode) {
          selectedNodeId = matchedNode.id;
        }
      }

      // Auto-select if only one active node, or recover from stale selection.
      if (
        selectedNodeId &&
        !activeNodes.some((node) => node.id === selectedNodeId)
      ) {
        selectedNodeId = null;
      }
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

  function getUnavailableSkills(skillIds: string[]): AccountSkill[] {
    if (skillIds.length === 0) return [];
    const byId = new Map(composerSkills.map((skill) => [skill.id, skill]));
    const out: AccountSkill[] = [];
    for (const skillId of skillIds) {
      const skill = byId.get(skillId);
      if (!skill) {
        out.push({
          id: skillId,
          name: skillId,
          description: "",
          available: false,
          status: "UNKNOWN",
          healthSummary: "Required by intent but not available on this node.",
        });
        continue;
      }
      if (skill.available === false) {
        out.push(skill);
      }
    }
    return out;
  }

  function openSkillSetupDialog(skill: AccountSkill, reason?: string) {
    setupSkill = skill;
    setupSkillError = reason ?? null;
    setupAuthCommand = null;
    setupAuthAction = "copy";
    showSkillSetupDialog = true;
  }

  function selectIntent(intent: Intent) {
    selectedIntentId = intent.id;
    taskInput = intent.body;
    const inferredSkills = inferIntentSkills(intent);
    pendingIntentRequiredSkills = inferredSkills;

    if (inferredSkills.length > 0) {
      const merged = new Set(selectedSkillIds);
      for (const skillId of inferredSkills) merged.add(skillId);
      selectedSkillIds = [...merged];
    }

    // Proactively resolve required skills before auto-launching.
    if (intent.body.trim()) {
      const unavailableRequired = getUnavailableSkills(inferredSkills);
      if (unavailableRequired.length > 0) {
        pendingIntentBody = intent.body.trim();
        const firstMissing = unavailableRequired[0];
        openSkillSetupDialog(
          firstMissing,
          `${firstMissing.name} is required by "${intent.name}" and needs setup first.`,
        );
        return;
      }
      void submitTask(intent.body);
    }
  }

  function clearIntent() {
    selectedIntentId = null;
    pendingIntentBody = null;
    pendingIntentRequiredSkills = [];
  }

  function handleUnavailableSkillRequest(skill: AccountSkill) {
    openSkillSetupDialog(skill);
  }

  async function runSkillProvision(install: boolean) {
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!setupSkill || !node) {
      setupSkillError = "Select an active node before running skill setup.";
      return;
    }
    const targetSkill = setupSkill;

    settingUpSkill = true;
    setupSkillError = null;
    try {
      const response = await fetch("/api/skills/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: targetSkill.id,
          nodeId: node.node_id || node.id,
          install,
          authAction: install ? setupAuthAction : "none",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to start skill setup.");
      }

      if (payload.ready) {
        if (!selectedSkillIds.includes(targetSkill.id)) {
          selectedSkillIds = [...selectedSkillIds, targetSkill.id];
        }
        await fetchData();

        if (pendingIntentBody) {
          const remaining = getUnavailableSkills(pendingIntentRequiredSkills);
          if (remaining.length > 0) {
            const nextSkill = remaining[0];
            openSkillSetupDialog(
              nextSkill,
              `${nextSkill.name} is still required before auto-launching this intent.`,
            );
            return;
          }

          const autoLaunchBody = pendingIntentBody;
          pendingIntentBody = null;
          pendingIntentRequiredSkills = [];
          showSkillSetupDialog = false;
          setupAuthCommand = null;
          await submitTask(autoLaunchBody);
          return;
        }

        showSkillSetupDialog = false;
        setupAuthCommand = null;
        return;
      }

      await fetchData();
      const latestSkill =
        composerSkills.find((skill) => skill.id === targetSkill.id) ||
        targetSkill;
      const auth = payload?.auth as
        | { required?: boolean; ready?: boolean; command?: string; message?: string }
        | undefined;
      if (auth?.required && !auth?.ready) {
        setupAuthCommand = auth.command || null;
        setupSkillError =
          auth.message ||
          `${latestSkill.name} still needs authentication before it can run.`;
        return;
      }

      setupSkillError =
        payload?.error ||
        latestSkill.healthSummary ||
        `${latestSkill.name} is still not ready.`;
    } catch (setupError) {
      setupSkillError =
        setupError instanceof Error
          ? setupError.message
          : "Failed to start skill setup.";
    } finally {
      settingUpSkill = false;
    }
  }

  async function startSkillSetup() {
    await runSkillProvision(true);
  }

  async function recheckSkillSetup() {
    await runSkillProvision(false);
  }

  async function copySetupAuthCommand() {
    if (!setupAuthCommand) return;
    try {
      await navigator.clipboard.writeText(setupAuthCommand);
    } catch {
      setupSkillError = "Failed to copy command. Please copy it manually.";
    }
  }

  async function submitTask(overrideContent?: string) {
    const content = (overrideContent ?? taskInput).trim();
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!content) {
      error = "Add a task message or choose an intent to get started.";
      return;
    }
    if (creating) return;
    if (!node || node.status !== "active") {
      error =
        activeNodes.length > 0
          ? "Select an active node to start this viber."
          : "No active node found. Start a node first, then retry.";
      return;
    }

    const unavailableSelected = composerSkills.filter(
      (skill) =>
        selectedSkillIds.includes(skill.id) && skill.available === false,
    );
    if (unavailableSelected.length > 0) {
      const firstSkill = unavailableSelected[0];
      if (selectedIntent && !pendingIntentBody) {
        pendingIntentBody = content;
        pendingIntentRequiredSkills = inferIntentSkills(selectedIntent);
      }
      openSkillSetupDialog(firstSkill, `${firstSkill.name} is not ready on this node.`);
      return;
    }

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
          channelIds:
            selectedChannelIds.length > 0 ? selectedChannelIds : undefined,
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
          Pick an intent to launch immediately, or describe your own task below.
        </p>
      </div>

      {#if activeNodes.length === 0}
        <section class="mb-6 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p class="text-sm font-medium text-amber-900 dark:text-amber-100">
            Action needed: connect a node
          </p>
          <p class="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
            Start a viber daemon first, then come back here to launch with one click.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <a
              href="/nodes"
              class="inline-flex items-center rounded-md border border-amber-700/30 bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-background"
            >
              Open Nodes
            </a>
            <button
              type="button"
              class="inline-flex items-center rounded-md border border-amber-700/30 bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-background"
              onclick={() => void fetchData()}
            >
              Retry
            </button>
          </div>
        </section>
      {:else if activeNodes.length > 1 && !selectedNodeId}
        <section class="mb-6 w-full rounded-xl border border-border bg-card/70 p-4">
          <p class="text-sm font-medium text-foreground">
            Choose where this runs
          </p>
          <p class="mt-1 text-xs text-muted-foreground">
            Multiple nodes are active. Pick one from the Node selector in the chat bar.
          </p>
        </section>
      {/if}

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
            No intents found. <a
              href="/settings/intents"
              class="text-primary hover:underline">Create one</a
            > to get started.
          </div>
        {:else}
          <div
            class="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {#each previewIntents as intent (intent.id)}
              <button
                type="button"
                class="cursor-pointer w-[260px] shrink-0 snap-start rounded-xl border p-4 text-left transition-all sm:w-auto sm:min-w-0 {selectedIntentId ===
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
                  <p
                    class="mt-2 text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3 whitespace-pre-line"
                  >
                    {intent.body
                      .split("\n")
                      .filter(Boolean)
                      .slice(0, 3)
                      .join("\n")}
                  </p>
                {/if}
              </button>
            {/each}
          </div>
        {/if}

        {#if enabledChannels.length > 0}
          <div class="mt-5">
            <p
              class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Deliver updates to channels
            </p>
            <div class="flex flex-wrap gap-2">
              {#each enabledChannels as channel (channel.id)}
                <button
                  type="button"
                  class="rounded-full border px-2.5 py-1 text-xs transition-colors {selectedChannelIds.includes(
                  channel.id,
                )
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
                  onclick={() => toggleChannel(channel.id)}
                >
                  {channel.label}
                </button>
              {/each}
            </div>
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
        skills={composerSkills}
        bind:selectedSkillIds
        onsetupskill={handleUnavailableSkillRequest}
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
            class="cursor-pointer w-full rounded-xl border p-4 text-left transition-all {selectedIntentId ===
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

<Dialog.Root bind:open={showSkillSetupDialog}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Set up {setupSkill?.name || "skill"}?</Dialog.Title>
      <Dialog.Description>
        {setupSkill?.name || "This skill"} is not ready on the selected node.
        Should I start guided setup for you now?
      </Dialog.Description>
    </Dialog.Header>

    {#if setupSkill?.healthSummary}
      <p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {setupSkill.healthSummary}
      </p>
    {/if}

    <div class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2">
      <p class="text-xs font-medium text-foreground">If auth is needed</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs transition-colors {setupAuthAction === 'copy'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
          onclick={() => (setupAuthAction = "copy")}
        >
          Show command to copy
        </button>
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs transition-colors {setupAuthAction === 'start'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
          onclick={() => (setupAuthAction = "start")}
        >
          Try start auth now
        </button>
      </div>
    </div>

    {#if setupAuthCommand}
      <div class="space-y-2 rounded-md border border-border bg-background px-3 py-2">
        <p class="text-xs text-muted-foreground">Run this auth command:</p>
        <code class="block rounded-md bg-muted px-2 py-1 text-[11px] text-foreground">
          {setupAuthCommand}
        </code>
        <button
          type="button"
          class="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
          onclick={() => void copySetupAuthCommand()}
        >
          Copy command
        </button>
      </div>
    {/if}

    {#if setupSkillError}
      <p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {setupSkillError}
      </p>
    {/if}

    <Dialog.Footer class="mt-2">
      <button
        type="button"
        class="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        onclick={() => {
          showSkillSetupDialog = false;
          setupSkillError = null;
          setupAuthCommand = null;
          pendingIntentBody = null;
          pendingIntentRequiredSkills = [];
        }}
      >
        Not now
      </button>
      {#if setupSkillError}
        <button
          type="button"
          class="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          disabled={settingUpSkill}
          onclick={() => void recheckSkillSetup()}
        >
          Re-check
        </button>
      {/if}
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        disabled={settingUpSkill}
        onclick={() => void startSkillSetup()}
      >
        {#if settingUpSkill}
          Running setup...
        {:else}
          Yes, set it up
        {/if}
      </button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
