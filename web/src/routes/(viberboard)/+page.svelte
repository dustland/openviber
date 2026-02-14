<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { Sparkles } from "@lucide/svelte";
  import { getTasksStore } from "$lib/stores/tasks";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { inferIntentSkills, type Intent } from "$lib/data/intents";

  interface SessionUser {
    name: string;
  }

  interface DashboardTask {
    id: string;
    goal: string;
    status: string;
    viberConnected: boolean | null;
  }

  interface AccountSkill {
    id: string;
    name: string;
    description: string;
    available?: boolean;
    status?: "AVAILABLE" | "NOT_AVAILABLE" | "UNKNOWN";
    healthSummary?: string;
  }

  interface Viber {
    id: string;
    name: string;
    viber_id: string | null;
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
  }

  interface ChannelOption {
    id: string;
    label: string;
    enabled: boolean;
  }

  const user = $derived(($page.data?.user as SessionUser | undefined) || null);

  let recentTasks = $state<DashboardTask[]>([]);
  let loadingRecentTasks = $state(true);

  let vibers = $state<Viber[]>([]);
  let environments = $state<SidebarEnvironment[]>([]);
  let accountSkills = $state<AccountSkill[]>([]);
  let channelOptions = $state<ChannelOption[]>([]);
  let selectedChannelIds = $state<string[]>([]);
  let selectedEnvironmentId = $state<string | null>(null);
  let selectedViberId = $state<string | null>(null);
  let selectedModelId = $state("");
  let selectedSkillIds = $state<string[]>([]);
  let taskInput = $state("");
  let creating = $state(false);
  let error = $state<string | null>(null);

  let intents = $state<Intent[]>([]);
  let intentsLoading = $state(true);
  let selectedIntentId = $state<string | null>(null);

  let showIntentDialog = $state(false);
  let showSkillSetupDialog = $state(false);
  let setupSkill = $state<AccountSkill | null>(null);
  let settingUpSkill = $state(false);
  let setupSkillError = $state<string | null>(null);
  let setupAuthAction = $state<"copy" | "start">("copy");
  let setupAuthCommand = $state<string | null>(null);
  let pendingIntentBody = $state<string | null>(null);
  let pendingIntentRequiredSkills = $state<string[]>([]);

  const previewIntents = $derived(intents.slice(0, 3));
  const selectedViber = $derived(
    vibers.find((v) => v.id === selectedViberId) ?? null,
  );
  const selectedIntent = $derived(
    selectedIntentId
      ? (intents.find((i) => i.id === selectedIntentId) ?? null)
      : null,
  );

  const selectedViberSkills = $derived(selectedViber?.skills ?? []);
  const composerSkills = $derived.by(() => {
    const viberSkillMap = new Map<
      string,
      { available: boolean; status: string; healthSummary?: string }
    >();

    for (const skill of selectedViberSkills) {
      viberSkillMap.set(skill.id, {
        available: skill.available,
        status: skill.status,
        healthSummary: skill.healthSummary,
      });
      viberSkillMap.set(skill.name, {
        available: skill.available,
        status: skill.status,
        healthSummary: skill.healthSummary,
      });
    }

    const hasViberSkillInventory = selectedViberSkills.length > 0;

    // When accountSkills (from Supabase) is populated, use it as the base
    // with viber availability overlaid.
    if (accountSkills.length > 0) {
      return accountSkills.map((skill) => {
        const fromViber =
          viberSkillMap.get(skill.id) || viberSkillMap.get(skill.name);
        const available = hasViberSkillInventory
          ? Boolean(fromViber?.available)
          : skill.available;

        return {
          ...skill,
          available,
          status: (fromViber?.status as AccountSkill["status"]) ?? skill.status,
          healthSummary:
            fromViber?.healthSummary ||
            (hasViberSkillInventory && available === false
              ? "Not ready on selected viber"
              : skill.healthSummary),
        };
      });
    }

    // Fallback: derive skills directly from connected vibers' runtime inventory.
    // This covers dev mode and first-load before Supabase sync completes.
    const allViberSkills = vibers.flatMap((v) => v.skills ?? []);
    const seen = new Set<string>();
    return allViberSkills
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        available: s.available ?? true,
        status: s.status || "UNKNOWN",
        healthSummary: s.healthSummary || "",
      }));
  });

  const activeVibers = $derived(vibers.filter((v) => v.status === "active"));
  const enabledChannels = $derived(
    channelOptions.filter((channel) => channel.enabled),
  );

  async function fetchData() {
    try {
      const [nodesRes, envsRes, settingsRes, skillsRes, tasksRes] =
        await Promise.all([
          fetch("/api/vibers"),
          fetch("/api/environments"),
          fetch("/api/settings"),
          fetch("/api/skills"),
          fetch("/api/tasks"),
        ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        vibers = (data.vibers ?? []).map((v: any) => ({
          id: v.id,
          name: v.name,
          viber_id: v.viber_id ?? null,
          status: v.status ?? "offline",
          skills: Array.isArray(v.skills)
            ? v.skills.map((skill: any) => ({
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
          enabled:
            ((channel as Record<string, unknown>).enabled as boolean) ?? false,
        }));

        if (selectedChannelIds.length === 0) {
          selectedChannelIds = channelOptions
            .filter((channel) => channel.enabled)
            .map((channel) => channel.id);
        }

        if (data.chatModel && !selectedModelId) {
          selectedModelId = data.chatModel;
        }
      }

      if (tasksRes.ok) {
        const payload = await tasksRes.json();
        if (Array.isArray(payload)) {
          recentTasks = payload
            .map((task) => ({
              id: String(task.id || ""),
              goal: String(task.goal || task.id || "Untitled task"),
              status: String(task.status || "unknown"),
              viberConnected:
                typeof task.viberConnected === "boolean"
                  ? task.viberConnected
                  : null,
            }))
            .filter((task) => task.id)
            .slice(0, 4);
        }
      }

      if (
        selectedViberId &&
        !activeVibers.some((v) => v.id === selectedViberId)
      ) {
        selectedViberId = null;
      }
      if (activeVibers.length === 1 && !selectedViberId) {
        selectedViberId = activeVibers[0].id;
      }

      if (environments.length === 1 && !selectedEnvironmentId) {
        selectedEnvironmentId = environments[0].id;
      }
    } finally {
      loadingRecentTasks = false;
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
    } finally {
      intentsLoading = false;
    }
  }

  function toggleChannel(channelId: string) {
    if (selectedChannelIds.includes(channelId)) {
      selectedChannelIds = selectedChannelIds.filter((id) => id !== channelId);
      return;
    }
    selectedChannelIds = [...selectedChannelIds, channelId];
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
          healthSummary: "Required by intent but not available on this viber.",
        });
        continue;
      }
      if (skill.available === false) out.push(skill);
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

    if (!intent.body.trim()) return;

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

  function clearIntent() {
    selectedIntentId = null;
    pendingIntentBody = null;
    pendingIntentRequiredSkills = [];
  }

  function handleUnavailableSkillRequest(skill: AccountSkill) {
    openSkillSetupDialog(skill);
  }

  async function runSkillProvision(install: boolean) {
    const viber = vibers.find((v) => v.id === selectedViberId);
    if (!setupSkill || !viber) {
      setupSkillError = "Select an active viber before running skill setup.";
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
          viberId: viber.viber_id || viber.id,
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
        | {
            required?: boolean;
            ready?: boolean;
            command?: string;
            message?: string;
          }
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
    const viber = vibers.find((v) => v.id === selectedViberId);

    if (!content) {
      error = "Add a task message or choose an intent to get started.";
      return;
    }

    if (creating) return;

    if (!viber || viber.status !== "active") {
      error =
        activeVibers.length > 0
          ? "Select an active viber to start this task."
          : "No active viber found. Start a viber first, then retry.";
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
      openSkillSetupDialog(
        firstSkill,
        `${firstSkill.name} is not ready on this viber.`,
      );
      return;
    }

    creating = true;
    error = null;

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: content,
          title: selectedIntent?.name ?? undefined,
          viberId: viber.viber_id ?? undefined,
          environmentId: selectedEnvironmentId ?? undefined,
          channelIds:
            selectedChannelIds.length > 0 ? selectedChannelIds : undefined,
          model: selectedModelId || undefined,
          skills: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create task.");
      }

      const taskId = payload.viberId ?? payload.taskId;
      void getTasksStore().invalidate();

      window.sessionStorage.setItem(
        `openviber:new-viber-task:${taskId}`,
        content,
      );

      await goto(`/tasks/${taskId}`);
    } catch (submitError) {
      error =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create task.";
      creating = false;
    }
  }

  onMount(() => {
    void fetchData();
    void fetchIntents();
  });
</script>

<svelte:head>
  <title>Welcome — OpenViber</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-hidden">
  <div class="flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-5xl px-6 py-8 md:px-8 md:py-10">
      <section class="mb-8">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">
          {#if user}
            Welcome back, {user.name?.split(" ")[0] || "there"}
          {:else}
            Welcome to OpenViber
          {/if}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Launch a task from chat, pick a quick-start intent, or continue a
          recent conversation.
        </p>
      </section>

      {#if activeVibers.length === 0}
        <section
          class="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
        >
          <p class="text-sm font-medium text-amber-900 dark:text-amber-100">
            Action needed: connect a viber
          </p>
          <p class="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
            Start a viber daemon first, then launch tasks directly from this
            page.
          </p>
          <a
            href="/vibers"
            class="mt-3 inline-flex items-center rounded-md border border-amber-700/30 bg-background/70 px-3 py-1.5 text-xs text-foreground hover:bg-background"
          >
            Open Vibers
          </a>
        </section>
      {/if}

      <section class="mb-8">
        <div class="mb-3 flex items-center justify-between">
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
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
          <div
            class="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground"
          >
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
            class="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0"
          >
            {#each previewIntents as intent (intent.id)}
              <button
                type="button"
                class="cursor-pointer w-[280px] shrink-0 snap-start rounded-xl border p-4 text-left transition-all lg:w-auto lg:min-w-0 {selectedIntentId ===
                intent.id
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border bg-card hover:border-primary/30 hover:bg-accent/40'}"
                onclick={() => selectIntent(intent)}
              >
                <p class="truncate text-sm font-medium text-foreground">
                  {intent.name}
                </p>
                <p class="mt-0.5 truncate text-xs text-muted-foreground">
                  {intent.description}
                </p>
              </button>
            {/each}
          </div>
        {/if}

        {#if enabledChannels.length > 0}
          <div class="mt-4">
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
      </section>

      <section>
        <div class="mb-3 flex items-center gap-2">
          <Sparkles class="size-4 text-primary" />
          <h2
            class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Recent tasks
          </h2>
        </div>

        {#if loadingRecentTasks}
          <p class="text-sm text-muted-foreground">Loading recent tasks...</p>
        {:else if recentTasks.length === 0}
          <p class="text-sm text-muted-foreground">
            No tasks yet — start one below.
          </p>
        {:else}
          <div class="grid gap-2 sm:grid-cols-2">
            {#each recentTasks as task (task.id)}
              <a
                href={`/tasks/${task.id}`}
                class="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-accent"
              >
                <p class="truncate font-medium">{task.goal}</p>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {task.status}
                </p>
              </a>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </div>

  <div class="shrink-0 p-3 sm:p-4">
    <div class="mx-auto w-full max-w-5xl">
      <ChatComposer
        bind:value={taskInput}
        bind:error
        bind:selectedViberId
        bind:selectedEnvironmentId
        bind:selectedModelId
        placeholder="Describe what you want to build, or pick an intent above..."
        disabled={creating}
        sending={creating}
        {vibers}
        {environments}
        skills={composerSkills}
        bind:selectedSkillIds
        onsetupskill={handleUnavailableSkillRequest}
        onsubmit={() => void submitTask()}
      />
    </div>
  </div>
</div>

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
            <p class="truncate text-sm font-medium text-foreground">
              {intent.name}
            </p>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">
              {intent.description}
            </p>
          </button>
        {/each}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={showSkillSetupDialog}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Set up {setupSkill?.name || "skill"}?</Dialog.Title>
      <Dialog.Description>
        {setupSkill?.name || "This skill"} is not ready on the selected viber. Should
        I start guided setup for you now?
      </Dialog.Description>
    </Dialog.Header>

    {#if setupSkill?.healthSummary}
      <p
        class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        {setupSkill.healthSummary}
      </p>
    {/if}

    <div
      class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2"
    >
      <p class="text-xs font-medium text-foreground">If auth is needed</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs transition-colors {setupAuthAction ===
          'copy'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
          onclick={() => (setupAuthAction = "copy")}
        >
          Show command to copy
        </button>
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs transition-colors {setupAuthAction ===
          'start'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
          onclick={() => (setupAuthAction = "start")}
        >
          Try start auth now
        </button>
      </div>
    </div>

    {#if setupAuthCommand}
      <div
        class="space-y-2 rounded-md border border-border bg-background px-3 py-2"
      >
        <p class="text-xs text-muted-foreground">Run this auth command:</p>
        <code
          class="block rounded-md bg-muted px-2 py-1 text-[11px] text-foreground"
        >
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
      <p
        class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
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
      <button
        type="button"
        class="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
        disabled={settingUpSkill}
        onclick={() => void runSkillProvision(false)}
      >
        Re-check
      </button>
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        disabled={settingUpSkill}
        onclick={() => void runSkillProvision(true)}
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
