<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import {
    FolderGit2,
    Check,
    ChevronDown,
    Package,
    MessageSquarePlus,
    Palette,
    Sparkles,
    HeartPulse,
    Users,
    ShieldCheck,
    FileText,
    Code2,
    Bug,
    TrainFront,
  } from "@lucide/svelte";
  import ViberIcon from "$lib/components/icons/viber-icon.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import { BUILTIN_INTENTS, inferIntentSkills } from "$lib/data/intents";
  import type { Intent } from "$lib/data/intents";
  import type {
    ComposerViber,
    ComposerEnvironment,
    ComposerSkill,
  } from "$lib/components/chat-composer.svelte";
  import { getTasksStore } from "$lib/stores/tasks";

  let vibers = $state<ComposerViber[]>([]);
  let environments = $state<ComposerEnvironment[]>([]);
  let composerSkills = $state<ComposerSkill[]>([]);
  let selectedViberId = $state<string | null>(null);
  let selectedEnvironmentId = $state<string | null>(null);
  let selectedModelId = $state("");
  let selectedSkillIds = $state<string[]>([]);
  let taskInput = $state("");
  let creating = $state(false);
  let composerError = $state<string | null>(null);

  const intentIconMap: Record<Intent["icon"], typeof Palette> = {
    palette: Palette,
    sparkles: Sparkles,
    "heart-pulse": HeartPulse,
    users: Users,
    "shield-check": ShieldCheck,
    "file-text": FileText,
    "code-2": Code2,
    bug: Bug,
    "train-front": TrainFront,
  };

  function selectIntent(intent: Intent) {
    taskInput = intent.body;
    const inferred = inferIntentSkills(intent);
    if (inferred.length > 0) {
      selectedSkillIds = inferred;
    }
  }

  const activeVibers = $derived(vibers.filter((v) => v.status === "active"));
  const selectedViber = $derived(
    vibers.find((v) => v.id === selectedViberId) ?? null,
  );
  const selectedEnvironment = $derived(
    environments.find((e) => e.id === selectedEnvironmentId) ?? null,
  );

  async function fetchComposerData() {
    try {
      const [nodesRes, envsRes, settingsRes, skillsRes] = await Promise.all([
        fetch("/api/vibers"),
        fetch("/api/environments"),
        fetch("/api/settings"),
        fetch("/api/skills"),
      ]);

      if (nodesRes.ok) {
        const data = await nodesRes.json();
        vibers = (data.vibers ?? []).map((v: any) => ({
          id: v.id,
          name: v.name,
          viber_id: v.viber_id ?? null,
          status: v.status ?? "offline",
        }));

        const viberSkills: ComposerSkill[] = [];
        const seen = new Set<string>();
        for (const v of data.vibers ?? []) {
          for (const s of v.skills ?? []) {
            const id = s.id || s.name;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            viberSkills.push({
              id,
              name: s.name || id,
              description: s.description || "",
            });
          }
        }

        if (viberSkills.length > 0 && composerSkills.length === 0) {
          composerSkills = viberSkills;
        }
      }

      if (envsRes.ok) {
        const data = await envsRes.json();
        environments = data.environments ?? [];
      }

      if (skillsRes.ok) {
        const data = await skillsRes.json();
        const supabaseSkills = (data.skills ?? []).map(
          (s: { id: string; name: string; description?: string }) => ({
            id: s.id,
            name: s.name,
            description: s.description || "",
          }),
        );
        if (supabaseSkills.length > 0) {
          composerSkills = supabaseSkills;
        }
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.chatModel && !selectedModelId) {
          selectedModelId = data.chatModel;
        }
      }

      if (activeVibers.length === 1 && !selectedViberId) {
        selectedViberId = activeVibers[0].id;
      }
      if (environments.length === 1 && !selectedEnvironmentId) {
        selectedEnvironmentId = environments[0].id;
      }
    } catch {
      /* non-critical */
    }
  }

  async function submitTask() {
    const content = taskInput.trim();
    const viber = vibers.find((v) => v.id === selectedViberId);

    if (!content) {
      composerError = "Describe what you want to accomplish.";
      return;
    }
    if (creating) return;

    if (!viber || viber.status !== "active") {
      composerError =
        activeVibers.length > 0
          ? "Select an active viber to start this task."
          : "No active viber found. Start a viber first, then retry.";
      return;
    }

    creating = true;
    composerError = null;

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal:
            content
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.length > 0) || content,
          viberId: viber.viber_id ?? undefined,
          environmentId: selectedEnvironmentId ?? undefined,
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
      composerError =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create task.";
      creating = false;
    }
  }

  onMount(async () => {
    await fetchComposerData();
    // Pre-select environment from query param (e.g. from sidebar + icon)
    const envParam = $page.url.searchParams.get("environmentId");
    if (envParam && environments.some((e) => e.id === envParam)) {
      selectedEnvironmentId = envParam;
    }
  });
</script>

<svelte:head>
  <title>New Task — OpenViber</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-hidden p-6">
  <!-- Centered prompt + intents -->
  <div class="flex-1 flex flex-col items-center justify-center overflow-y-auto">
    <MessageSquarePlus class="size-10 mb-3 text-muted-foreground/40" />
    <p class="text-lg font-medium text-foreground mb-1">New Task</p>
    <p class="text-sm text-muted-foreground mb-6">
      Describe what you'd like to accomplish, or pick a template:
    </p>

    <!-- Viber & Environment selectors -->
    <div class="mb-5 flex flex-wrap items-center justify-center gap-2">
      {#if vibers.length > 0}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
          >
            {#if selectedViber}
              <span
                class="inline-block size-2 shrink-0 rounded-full"
                class:bg-emerald-500={selectedViber.status === "active"}
                class:bg-amber-500={selectedViber.status === "pending"}
                class:bg-zinc-400={selectedViber.status === "offline"}
              ></span>
              <span class="truncate max-w-[140px]">{selectedViber.name}</span>
            {:else}
              <ViberIcon class="size-3.5" />
              <span>Viber</span>
            {/if}
            <ChevronDown class="size-3 opacity-50" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64">
            <DropdownMenu.Label>Select viber</DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#each vibers as viber (viber.id)}
              <DropdownMenu.Item
                onclick={() => (selectedViberId = viber.id)}
                class="flex items-center gap-2"
                disabled={viber.status !== "active"}
              >
                <span class="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    class="inline-block size-2 shrink-0 rounded-full"
                    class:bg-emerald-500={viber.status === "active"}
                    class:bg-amber-500={viber.status === "pending"}
                    class:bg-zinc-400={viber.status === "offline"}
                  ></span>
                  {viber.name}
                  {#if viber.status !== "active"}
                    <span class="text-xs text-muted-foreground ml-1"
                      >({viber.status})</span
                    >
                  {/if}
                </span>
                {#if selectedViberId === viber.id}
                  <Check class="size-3.5 text-primary" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}

      {#if environments.length > 0}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
          >
            <FolderGit2 class="size-3.5" />
            {#if selectedEnvironment}
              <span class="truncate max-w-[140px]"
                >{selectedEnvironment.name}</span
              >
            {:else}
              <span>Env</span>
            {/if}
            <ChevronDown class="size-3 opacity-50" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-56">
            <DropdownMenu.Label>Select environment</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              onclick={() => (selectedEnvironmentId = null)}
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
                onclick={() => (selectedEnvironmentId = env.id)}
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
      {/if}
    </div>

    {#if !taskInput.trim()}
      <div
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 w-full max-w-5xl"
      >
        {#each BUILTIN_INTENTS as intent (intent.id)}
          {@const IconComponent = intentIconMap[intent.icon] ?? Sparkles}
          <button
            type="button"
            class="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-sm hover:bg-muted/30"
            onclick={() => selectIntent(intent)}
          >
            <IconComponent
              class="size-5 mb-2 text-muted-foreground group-hover:text-primary transition-colors"
            />
            <p class="text-sm font-medium text-foreground truncate">
              {intent.name}
            </p>
            <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {intent.description}
            </p>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Bottom-pinned composer -->
  <div class="shrink-0 pb-3 sm:pb-4">
    <div class="mx-auto w-full max-w-5xl">
      <ChatComposer
        bind:value={taskInput}
        bind:error={composerError}
        bind:selectedModelId
        bind:selectedSkillIds
        placeholder="What would you like to work on?"
        disabled={creating}
        sending={creating}
        skills={composerSkills}
        onsubmit={() => void submitTask()}
      />
    </div>
  </div>
</div>
