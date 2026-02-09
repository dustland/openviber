<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    CalendarClock,
    Clock,
    Zap,
    FileText,
    AlertCircle,
    Mail,
    Plus,
    Trash2,
    Info,
    X,
    HeartPulse,
    Users,
    FilePlus,
    Sparkles,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { JOB_TEMPLATES, type JobTemplate } from "$lib/data/job-templates";

  interface JobEntry {
    name: string;
    description?: string;
    schedule: string;
    scheduleDescription: string;
    model?: string;
    prompt?: string;
    enabled: boolean;
    filename: string;
    nodeId?: string | null;
    nodeName?: string | null;
  }

  interface NodeOption {
    id: string;
    name: string;
    status: string;
  }

  interface ViberJobsGroup {
    viberId: string;
    jobs: JobEntry[];
  }

  type ScheduleMode = "daily" | "interval";

  const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;
  // Cron day of week: 0=Sun, 1=Mon, ... 6=Sat. Our order is Mo..Su so indices 0..6 = 1..6,0
  function dayIndexToCronDOW(i: number): number {
    return i === 6 ? 0 : i + 1; // Mo=1, Tu=2, ..., Su=0
  }

  /** Build day-of-week cron field from selected days (Mo..Su). */
  function getCronDOW(): string {
    if (selectedDays.length === 7 || selectedDays.every(Boolean)) return "*";
    if (!selectedDays.some(Boolean)) return "*";
    return selectedDays
      .map((_, i) => dayIndexToCronDOW(i))
      .filter((_, i) => selectedDays[i])
      .join(",");
  }

  /** Build cron from user-friendly schedule options */
  function buildCron(): string {
    const dow = getCronDOW();
    if (scheduleMode === "daily") {
      return `${dailyMinute} ${dailyHour} * * ${dow}`;
    }
    // interval
    if (intervalHours >= 24) {
      const h = intervalHours === 24 ? intervalDailyHour : 0;
      return `0 ${h} * * ${dow}`;
    }
    if (dow === "*") return `0 */${intervalHours} * * *`;
    return `0 */${intervalHours} * * ${dow}`;
  }

  let globalJobs = $state<JobEntry[]>([]);
  let perViberJobs = $state<ViberJobsGroup[]>([]);
  let totalJobs = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let showCreateForm = $state(false);
  let createSubmitting = $state(false);
  let createError = $state<string | null>(null);
  let formName = $state("");
  let formPrompt = $state("");
  let formDescription = $state("");
  let formModel = $state("");
  let formNodeId = $state("");
  let formSkills = $state("");
  let formTools = $state("");
  let selectedTemplateId = $state<string | null>(null);

  let nodes = $state<NodeOption[]>([]);

  // Schedule: Daily = run once per day at time; Interval = every N hours, optional days
  let scheduleMode = $state<ScheduleMode>("daily");
  let dailyHour = $state(8);
  let dailyMinute = $state(0);
  let intervalHours = $state(24);
  let intervalDailyHour = $state(8);
  let selectedDays = $state<boolean[]>([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);

  let deletingName = $state<string | null>(null);
  let createDialogEl = $state<HTMLDivElement | null>(null);

  const formSchedule = $derived(buildCron());

  function applyTemplate(tpl: JobTemplate) {
    selectedTemplateId = tpl.id;
    const d = tpl.defaults;
    formName = d.name ?? "";
    formPrompt = d.prompt ?? "";
    formDescription = d.description ?? "";
    formModel = d.model ?? "";
    formSkills = d.skills?.join(", ") ?? "";
    formTools = d.tools?.join(", ") ?? "";
    if (d.scheduleMode) scheduleMode = d.scheduleMode;
    // Reset schedule inputs to defaults
    dailyHour = 8;
    dailyMinute = 0;
    intervalHours = 24;
    intervalDailyHour = 8;
    selectedDays = [true, true, true, true, true, true, true];
  }

  $effect(() => {
    if (showCreateForm && createDialogEl) {
      tick().then(() => createDialogEl?.focus());
    }
  });

  async function fetchJobs() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load jobs");
      }
      const data = await res.json();
      globalJobs = data.globalJobs ?? [];
      perViberJobs = data.perViberJobs ?? [];
      totalJobs = data.totalJobs ?? 0;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load jobs";
      globalJobs = [];
      perViberJobs = [];
      totalJobs = 0;
    } finally {
      loading = false;
    }
  }

  async function createJob() {
    if (!formName.trim() || !formPrompt.trim()) {
      createError = "Name and prompt are required.";
      return;
    }
    createError = null;
    createSubmitting = true;
    try {
      const skillsArr = formSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const toolsArr = formTools
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          schedule: formSchedule,
          prompt: formPrompt.trim(),
          description: formDescription.trim() || undefined,
          model: formModel.trim() || undefined,
          nodeId: formNodeId.trim() || undefined,
          skills: skillsArr.length > 0 ? skillsArr : undefined,
          tools: toolsArr.length > 0 ? toolsArr : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create job");
      showCreateForm = false;
      formName = "";
      formPrompt = "";
      formDescription = "";
      formModel = "";
      formNodeId = "";
      formSkills = "";
      formTools = "";
      selectedTemplateId = null;
      scheduleMode = "daily";
      dailyHour = 8;
      dailyMinute = 0;
      intervalHours = 24;
      intervalDailyHour = 8;
      selectedDays = [true, true, true, true, true, true, true];
      await fetchJobs();
    } catch (e) {
      createError = e instanceof Error ? e.message : "Failed to create job";
    } finally {
      createSubmitting = false;
    }
  }

  async function deleteJob(name: string) {
    deletingName = name;
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete job");
      await fetchJobs();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to delete job";
    } finally {
      deletingName = null;
    }
  }

  async function fetchNodes() {
    try {
      const res = await fetch("/api/nodes");
      if (!res.ok) return;
      const data = await res.json();
      nodes = (data.nodes ?? [])
        .map(
          (n: {
            id: string;
            name?: string;
            node_id?: string;
            status?: string;
          }) => ({
            id: n.node_id ?? n.id,
            name: n.name ?? n.id,
            status: n.status ?? "unknown",
          }),
        )
        .filter((n: NodeOption) => n.id);
    } catch {
      nodes = [];
    }
  }

  onMount(() => {
    fetchJobs();
  });

  $effect(() => {
    if (showCreateForm && nodes.length === 0) void fetchNodes();
  });

  const hasAnyJobs = $derived(totalJobs > 0);
</script>

<svelte:head>
  <title>Jobs - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="max-w-4xl mx-auto">
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-foreground mb-2">Jobs</h1>
      <p class="text-muted-foreground">
        Task automation on a schedule. For example: “Summarize my emails and
        send me a report at 8am every day.” Jobs are stored in
        <code class="rounded bg-muted px-1.5 py-0.5 text-xs"
          >~/.openviber/jobs/</code
        >
        and run when the daemon is started.
      </p>
    </header>

    {#if error}
      <div
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3"
      >
        <AlertCircle class="size-5 text-destructive shrink-0" />
        <p class="text-destructive">{error}</p>
      </div>
    {:else if loading}
      <div class="flex items-center justify-center py-16">
        <div class="animate-pulse flex flex-col items-center gap-3">
          <CalendarClock class="size-10 text-muted-foreground/50" />
          <p class="text-sm text-muted-foreground">Loading jobs…</p>
        </div>
      </div>
    {:else}
      <!-- Create job -->
      <div class="mb-8">
        <Button onclick={() => (showCreateForm = true)}>
          <Plus class="size-4 mr-2" />
          Create job
        </Button>
      </div>

      {#if !hasAnyJobs}
        <div
          class="rounded-xl border border-dashed border-border p-12 text-center"
        >
          <Mail class="size-12 text-muted-foreground/50 mx-auto mb-4" />
          <h2 class="text-lg font-medium text-foreground mb-2">No jobs yet</h2>
          <p class="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            Create a job above, or ask a viber to create one (e.g. “Summarize
            emails and send me a report at 8am every day”). Jobs are stored in
            <code class="rounded bg-muted px-1.5 py-0.5 text-xs"
              >~/.openviber/jobs/</code
            >. Restart the daemon to load new jobs.
          </p>
          <a
            href="/docs/concepts/jobs"
            class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <FileText class="size-4" />
            Learn about Jobs
          </a>
        </div>
      {:else}
        <div class="space-y-8">
          <!-- Global jobs -->
          {#if globalJobs.length > 0}
            <section>
              <h2
                class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4"
              >
                Global jobs
              </h2>
              <div class="grid gap-4">
                {#each globalJobs as job}
                  <div
                    class="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm flex items-start justify-between gap-4"
                  >
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <h3
                          class="text-lg font-semibold text-card-foreground truncate"
                        >
                          {job.name}
                        </h3>
                        <span
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400"
                        >
                          <span class="size-1.5 rounded-full bg-current"></span>
                          Active
                        </span>
                      </div>
                      {#if job.description}
                        <p class="text-sm text-muted-foreground mb-3">
                          {job.description}
                        </p>
                      {/if}
                      <div class="flex flex-wrap items-center gap-3 text-sm">
                        <div
                          class="flex items-center gap-1.5 text-muted-foreground"
                        >
                          <Clock class="size-4" />
                          <span>{job.scheduleDescription || job.schedule}</span>
                        </div>
                        {#if job.nodeId}
                          <span class="text-muted-foreground"
                            >Node: {job.nodeId.slice(0, 12)}{job.nodeId.length >
                            12
                              ? "…"
                              : ""}</span
                          >
                        {/if}
                        {#if job.model}
                          <div
                            class="flex items-center gap-1.5 text-muted-foreground"
                          >
                            <Zap class="size-4" />
                            <span class="font-mono text-xs">{job.model}</span>
                          </div>
                        {/if}
                      </div>
                      {#if job.prompt}
                        <div
                          class="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                        >
                          <p class="text-sm text-muted-foreground line-clamp-2">
                            {job.prompt}
                          </p>
                        </div>
                      {/if}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete job"
                      disabled={deletingName === job.name}
                      onclick={() => deleteJob(job.name)}
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Per-viber jobs -->
          {#each perViberJobs as group}
            {#if group.jobs.length > 0}
              <section>
                <h2
                  class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4"
                >
                  Viber: {group.viberId}
                </h2>
                <div class="grid gap-4">
                  {#each group.jobs as job}
                    <div
                      class="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
                    >
                      <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 mb-1">
                            <h3
                              class="text-lg font-semibold text-card-foreground truncate"
                            >
                              {job.name}
                            </h3>
                            {#if !job.enabled}
                              <span
                                class="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
                              >
                                Disabled
                              </span>
                            {/if}
                          </div>
                          {#if job.description}
                            <p class="text-sm text-muted-foreground mb-3">
                              {job.description}
                            </p>
                          {/if}
                          <div
                            class="flex flex-wrap items-center gap-3 text-sm"
                          >
                            <div
                              class="flex items-center gap-1.5 text-muted-foreground"
                            >
                              <Clock class="size-4" />
                              <span
                                >{job.scheduleDescription || job.schedule}</span
                              >
                            </div>
                            {#if job.model}
                              <div
                                class="flex items-center gap-1.5 text-muted-foreground"
                              >
                                <Zap class="size-4" />
                                <span class="font-mono text-xs"
                                  >{job.model}</span
                                >
                              </div>
                            {/if}
                          </div>
                          {#if job.prompt}
                            <div
                              class="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                            >
                              <p
                                class="text-sm text-muted-foreground line-clamp-2"
                              >
                                {job.prompt}
                              </p>
                            </div>
                          {/if}
                        </div>
                        <div class="shrink-0">
                          {#if job.enabled}
                            <span
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400"
                            >
                              <span class="size-1.5 rounded-full bg-current"
                              ></span>
                              Active
                            </span>
                          {:else}
                            <span
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                            >
                              <span class="size-1.5 rounded-full bg-current"
                              ></span>
                              Paused
                            </span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </section>
            {/if}
          {/each}
        </div>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          {totalJobs} job{totalJobs === 1 ? "" : "s"}
          {#if globalJobs.length > 0 && perViberJobs.length > 0}
            (global + per-viber)
          {/if}
        </p>
      {/if}
    {/if}
  </div>
</div>

<!-- Create job dialog -->
{#if showCreateForm}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={createDialogEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="create-job-title"
    tabindex="-1"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 outline-none"
    onclick={(e) => {
      if (e.target === e.currentTarget) {
        showCreateForm = false;
        createError = null;
      }
    }}
    onkeydown={(e) => {
      if (e.key === "Escape") {
        showCreateForm = false;
        createError = null;
      }
    }}
  >
    <div
      class="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Escape") {
          showCreateForm = false;
          createError = null;
        }
      }}
    >
      <div
        class="flex items-center justify-between px-5 py-4 border-b border-border"
      >
        <h2 id="create-job-title" class="text-lg font-semibold text-foreground">
          New job
        </h2>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => {
            showCreateForm = false;
            createError = null;
          }}
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-5">
        <p class="text-sm text-muted-foreground -mt-1">
          Pick a template or start from scratch.
        </p>

        <!-- Template picker -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {#each JOB_TEMPLATES as tpl}
            <button
              type="button"
              class="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors {selectedTemplateId ===
              tpl.id
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'}"
              onclick={() => applyTemplate(tpl)}
            >
              {#if tpl.icon === "heart-pulse"}
                <HeartPulse class="size-5" />
              {:else if tpl.icon === "users"}
                <Users class="size-5" />
              {:else if tpl.icon === "sparkles"}
                <Sparkles class="size-5" />
              {:else}
                <FilePlus class="size-5" />
              {/if}
              <span class="text-xs font-medium">{tpl.label}</span>
            </button>
          {/each}
        </div>

        {#if createError}
          <p class="text-sm text-destructive">{createError}</p>
        {/if}

        <form
          class="space-y-5"
          onsubmit={(e) => {
            e.preventDefault();
            createJob();
          }}
        >
          <section class="space-y-3">
            <h3
              class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Task
            </h3>
            <div>
              <label
                for="job-name"
                class="block text-sm font-medium text-foreground mb-1.5"
                >Name</label
              >
              <input
                id="job-name"
                type="text"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Daily bug scan"
                bind:value={formName}
              />
            </div>
            <div>
              <label
                for="job-prompt"
                class="block text-sm font-medium text-foreground mb-1.5"
                >Prompt</label
              >
              <textarea
                id="job-prompt"
                rows="3"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[72px]"
                placeholder="What should the viber do each run?"
                bind:value={formPrompt}
              ></textarea>
              <p class="mt-1 text-xs text-muted-foreground">
                You can add constraints in the prompt (e.g. use only repo
                evidence, prefer minimal fixes).
              </p>
            </div>
          </section>

          <section class="space-y-3">
            <h3
              class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Run on
            </h3>
            <div>
              <label
                for="job-node"
                class="block text-sm font-medium text-foreground mb-1.5"
                >Node</label
              >
              <select
                id="job-node"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                bind:value={formNodeId}
              >
                <option value="">Any available node</option>
                {#each nodes as node}
                  <option value={node.id}>
                    {node.name}
                    {node.status === "active" ? " (connected)" : ""}
                  </option>
                {/each}
              </select>
              <p class="mt-1 text-xs text-muted-foreground">
                The job is pushed to this node so it runs on that machine. Leave
                “Any available node” to only store the job (e.g. for manual
                sync).
              </p>
            </div>
          </section>

          <section class="space-y-3">
            <h3
              class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Schedule
            </h3>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {scheduleMode ===
                'daily'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (scheduleMode = "daily")}
              >
                Daily
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {scheduleMode ===
                'interval'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                onclick={() => (scheduleMode = "interval")}
              >
                Interval
              </button>
            </div>
            {#if scheduleMode === "daily"}
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-muted-foreground">At</span>
                <input
                  type="number"
                  min="0"
                  max="23"
                  class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  bind:value={dailyHour}
                />
                <span class="text-muted-foreground">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  bind:value={dailyMinute}
                />
                <span class="text-xs text-muted-foreground">(24h)</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-sm text-muted-foreground">On</span>
                {#each DAY_LABELS as label, i}
                  <button
                    type="button"
                    class="w-9 h-9 rounded-md text-xs font-medium transition-colors {selectedDays[
                      i
                    ]
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                    title={label}
                    onclick={() => {
                      const next = [...selectedDays];
                      next[i] = !next[i];
                      selectedDays = next;
                    }}
                  >
                    {label}
                  </button>
                {/each}
              </div>
            {:else}
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm text-muted-foreground">Every</span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  class="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  bind:value={intervalHours}
                />
                <span class="text-sm text-muted-foreground">hours</span>
                {#if intervalHours >= 24}
                  <span class="text-sm text-muted-foreground">at</span>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    class="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    bind:value={intervalDailyHour}
                  />
                  <span class="text-sm text-muted-foreground">:00</span>
                {/if}
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-sm text-muted-foreground">On</span>
                {#each DAY_LABELS as label, i}
                  <button
                    type="button"
                    class="w-9 h-9 rounded-md text-xs font-medium transition-colors {selectedDays[
                      i
                    ]
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
                    title={label}
                    onclick={() => {
                      const next = [...selectedDays];
                      next[i] = !next[i];
                      selectedDays = next;
                    }}
                  >
                    {label}
                  </button>
                {/each}
              </div>
            {/if}
          </section>

          <section class="space-y-3">
            <h3
              class="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Optional
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  for="job-description"
                  class="block text-sm font-medium text-foreground mb-1.5"
                  >Description</label
                >
                <input
                  id="job-description"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Short note"
                  bind:value={formDescription}
                />
              </div>
              <div>
                <label
                  for="job-model"
                  class="block text-sm font-medium text-foreground mb-1.5"
                  >Model</label
                >
                <input
                  id="job-model"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder="e.g. deepseek/deepseek-chat"
                  bind:value={formModel}
                />
              </div>
              <div>
                <label
                  for="job-skills"
                  class="block text-sm font-medium text-foreground mb-1.5"
                  >Skills</label
                >
                <input
                  id="job-skills"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. antigravity, github"
                  bind:value={formSkills}
                />
                <p class="mt-1 text-xs text-muted-foreground">
                  Comma-separated skill names
                </p>
              </div>
              <div>
                <label
                  for="job-tools"
                  class="block text-sm font-medium text-foreground mb-1.5"
                  >Tools</label
                >
                <input
                  id="job-tools"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. browser, desktop"
                  bind:value={formTools}
                />
                <p class="mt-1 text-xs text-muted-foreground">
                  Comma-separated tool names
                </p>
              </div>
            </div>
          </section>

          <div class="flex gap-2 pt-2 border-t border-border">
            <Button type="submit" disabled={createSubmitting}>
              {createSubmitting ? "Creating…" : "Create"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onclick={() => {
                showCreateForm = false;
                createError = null;
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
