<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/stores";
  import {
    CalendarClock,
    Clock,
    Zap,
    FileText,
    AlertCircle,
    Mail,
    Plus,
    Server,
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
  import TemplateParams from "$lib/components/template-params.svelte";
  import {
    applyTemplate as applyTemplateString,
    buildDefaultParams,
    type TemplateParam,
  } from "$lib/data/template-utils";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Select } from "$lib/components/ui/select";

  interface JobEntry {
    name: string;
    description?: string;
    schedule: string;
    scheduleDescription: string;
    model?: string;
    prompt?: string;
    enabled: boolean;
    filename: string;
    viberId?: string | null;
    viberName?: string | null;
  }

  interface ViberOption {
    id: string;
    name: string;
    status: string;
  }

  interface ViberDaemonJobsGroup {
    viberId: string;
    viberName: string;
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
  let daemonJobs = $state<ViberDaemonJobsGroup[]>([]);
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
  let formViberId = $state("");
  let formSkills = $state("");
  let formTools = $state("");
  let selectedTemplateId = $state<string | null>(null);
  let templateParams = $state<Record<string, string>>({});
  let templateParamDefs = $state<TemplateParam[]>([]);
  let presetApplied = $state(false);

  let vibers = $state<ViberOption[]>([]);

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

  const TEMPLATE_ICONS = {
    "file-plus": FilePlus,
    "heart-pulse": HeartPulse,
    users: Users,
    sparkles: Sparkles,
  } as const;

  const formSchedule = $derived(buildCron());

  function getTemplatePrompt(
    tpl: JobTemplate,
    params: Record<string, string>,
  ): string {
    const raw = tpl.promptTemplate ?? tpl.defaults.prompt ?? "";
    return applyTemplateString(raw, params).trim();
  }

  function getTemplateList(
    items: string[] | undefined,
    params: Record<string, string>,
  ): string[] {
    if (!items || items.length === 0) return [];
    return items
      .map((item) => applyTemplateString(item, params).trim())
      .filter(Boolean);
  }

  function applyTemplateDefaults(
    tpl: JobTemplate,
    params: Record<string, string>,
  ) {
    const d = tpl.defaults;
    formName = d.name ?? "";
    formDescription = d.description ?? "";
    formPrompt = getTemplatePrompt(tpl, params);
    formModel = d.model ?? "";
    formSkills = getTemplateList(d.skills, params).join(", ");
    formTools = getTemplateList(d.tools, params).join(", ");
    scheduleMode = d.scheduleMode ?? "daily";
    dailyHour = d.dailyHour ?? 8;
    dailyMinute = d.dailyMinute ?? 0;
    intervalHours = d.intervalHours ?? 24;
    intervalDailyHour = d.intervalDailyHour ?? 8;
    selectedDays = d.selectedDays ?? [true, true, true, true, true, true, true];
  }

  function applyTemplate(tpl: JobTemplate) {
    selectedTemplateId = tpl.id;
    templateParamDefs = tpl.params ?? [];
    templateParams = buildDefaultParams(tpl.params);
    applyTemplateDefaults(tpl, templateParams);
  }

  function updateTemplateParam(id: string, value: string) {
    templateParams = { ...templateParams, [id]: value };
  }

  $effect(() => {
    if (showCreateForm && createDialogEl) {
      tick().then(() => createDialogEl?.focus());
    }
  });

  const selectedTemplate = $derived(
    selectedTemplateId
      ? (JOB_TEMPLATES.find((tpl) => tpl.id === selectedTemplateId) ?? null)
      : null,
  );

  $effect(() => {
    if (!selectedTemplate || !selectedTemplate.params?.length) return;
    formPrompt = getTemplatePrompt(selectedTemplate, templateParams);
    formSkills = getTemplateList(
      selectedTemplate.defaults.skills,
      templateParams,
    ).join(", ");
  });

  $effect(() => {
    if (presetApplied) return;
    const presetId =
      $page.url.searchParams.get("preset") ??
      $page.url.searchParams.get("story");
    if (!presetId) return;
    const match = JOB_TEMPLATES.find((tpl) => tpl.id === presetId);
    if (!match) return;
    showCreateForm = true;
    applyTemplate(match);
    presetApplied = true;
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
      daemonJobs = data.nodeJobs ?? [];
      totalJobs = data.totalJobs ?? 0;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load jobs";
      globalJobs = [];
      daemonJobs = [];
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
          viberId: formViberId.trim() || undefined,
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
      formViberId = "";
      formSkills = "";
      formTools = "";
      selectedTemplateId = null;
      templateParams = {};
      templateParamDefs = [];
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

  async function fetchVibers() {
    try {
      const res = await fetch("/api/vibers");
      if (!res.ok) return;
      const data = await res.json();
      vibers = (data.vibers ?? [])
        .map(
          (v: {
            id: string;
            name?: string;
            viber_id?: string;
            status?: string;
          }) => ({
            id: v.viber_id ?? v.id,
            name: v.name ?? v.id,
            status: v.status ?? "unknown",
          }),
        )
        .filter((v: ViberOption) => v.id);
    } catch {
      vibers = [];
    }
  }

  onMount(() => {
    fetchJobs();
  });

  $effect(() => {
    if (showCreateForm && vibers.length === 0) void fetchVibers();
  });

  const hasAnyJobs = $derived(totalJobs > 0);
</script>

<svelte:head>
  <title>Jobs - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto flex flex-col">
  <div class="flex flex-col flex-1 min-h-0">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-8 gap-4">
      <header class="min-w-0">
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
      {#if !loading && !error}
        <div class="shrink-0">
          <Button onclick={() => (showCreateForm = true)}>
            <Plus class="size-4 sm:mr-1" />
            <span class="hidden sm:inline">Create job</span>
          </Button>
        </div>
      {/if}
    </div>

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
      {#if !hasAnyJobs}
        <div
          class="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center"
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
                        {#if job.viberId}
                          <span class="text-muted-foreground"
                            >Viber: {job.viberId.slice(0, 12)}{job.viberId
                              .length > 12
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

          <!-- Daemon-reported jobs (created from chat or locally on daemons) -->
          {#each daemonJobs as group}
            {#if group.jobs.length > 0}
              <section>
                <h2
                  class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2"
                >
                  <Server class="size-3.5" />
                  Viber: {group.viberName || group.viberId}
                </h2>
                <div class="grid gap-4">
                  {#each group.jobs as job}
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
                            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          >
                            <span class="size-1.5 rounded-full bg-current"
                            ></span>
                            On viber
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
                            <span
                              >{job.scheduleDescription || job.schedule}</span
                            >
                          </div>
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
                            <p
                              class="text-sm text-muted-foreground line-clamp-2"
                            >
                              {job.prompt}
                            </p>
                          </div>
                        {/if}
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 outline-none animate-in fade-in duration-200"
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
      class="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Escape") {
          showCreateForm = false;
          createError = null;
        }
      }}
    >
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20"
      >
        <div class="flex items-center gap-2">
          <div class="p-2 bg-primary/10 rounded-md">
            <CalendarClock class="size-5 text-primary" />
          </div>
          <div>
            <h2
              id="create-job-title"
              class="text-lg font-semibold text-foreground"
            >
              New Job
            </h2>
            <p class="text-xs text-muted-foreground">
              Schedule an automated task
            </p>
          </div>
        </div>
        <button
          type="button"
          class="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => {
            showCreateForm = false;
            createError = null;
          }}
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="px-6 py-6">
        {#if createError}
          <div
            class="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex items-center gap-3 text-sm text-destructive"
          >
            <AlertCircle class="size-4 shrink-0" />
            <p>{createError}</p>
          </div>
        {/if}

        <form
          class="space-y-6"
          onsubmit={(e) => {
            e.preventDefault();
            createJob();
          }}
        >
          <!-- Job presets -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3
                class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Job presets
              </h3>
              {#if selectedTemplate}
                <span class="text-[11px] text-muted-foreground">
                  Selected: {selectedTemplate.label}
                </span>
              {/if}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              {#each JOB_TEMPLATES as tpl}
                {@const TemplateIcon = TEMPLATE_ICONS[tpl.icon]}
                <button
                  type="button"
                  class={`rounded-lg border p-3 text-left transition-colors ${
                    selectedTemplateId === tpl.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                  onclick={() => applyTemplate(tpl)}
                >
                  <div class="flex items-start gap-3">
                    <div
                      class="size-8 rounded-md bg-muted/60 flex items-center justify-center text-muted-foreground"
                    >
                      <TemplateIcon class="size-4" />
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
          </div>

          {#if selectedTemplate && templateParamDefs.length > 0}
            <div
              class="rounded-lg border border-border bg-muted/20 p-4 space-y-3"
            >
              <TemplateParams
                params={templateParamDefs}
                values={templateParams}
                onChange={updateTemplateParam}
                title="Preset inputs"
              />
            </div>
          {/if}

          <!-- Core Details -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="job-name">Name</Label>
              <Input
                id="job-name"
                placeholder="e.g. Daily Bug Report"
                bind:value={formName}
                autofocus
              />
            </div>
            <div class="space-y-2">
              <Label for="job-description"
                >Description <span class="text-muted-foreground font-normal"
                  >(Optional)</span
                ></Label
              >
              <Input
                id="job-description"
                placeholder="Brief description of the task"
                bind:value={formDescription}
              />
            </div>
          </div>

          <!-- Prompt -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label for="job-prompt">Prompt</Label>
              <span class="text-xs text-muted-foreground"
                >Instructions for the viber</span
              >
            </div>
            <Textarea
              id="job-prompt"
              rows={4}
              class="resize-y min-h-[100px] font-mono text-sm"
              placeholder="Describe what the agent should do..."
              bind:value={formPrompt}
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Execution Config -->
            <div class="space-y-4">
              <h3
                class="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1"
              >
                Execution
              </h3>
              <div class="space-y-3">
                <div class="space-y-2">
                  <Label for="job-node">Target Viber</Label>
                  <Select id="job-node" bind:value={formViberId}>
                    <option value="">Any available viber</option>
                    {#each vibers as viber}
                      <option value={viber.id}>
                        {viber.name}
                        {viber.status === "active" ? " (connected)" : ""}
                      </option>
                    {/each}
                  </Select>
                  <p class="text-[10px] text-muted-foreground">
                    Select a specific viber or let any available one pick it up.
                  </p>
                </div>
                <div class="space-y-2">
                  <Label for="job-model">Model Override</Label>
                  <Input
                    id="job-model"
                    class="font-mono text-xs"
                    placeholder="e.g. deepseek/deepseek-chat"
                    bind:value={formModel}
                  />
                </div>
              </div>
            </div>

            <!-- Schedule Config -->
            <div class="space-y-4">
              <div class="flex items-center justify-between border-b pb-1">
                <h3
                  class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Schedule
                </h3>
                <div class="flex bg-muted rounded-md p-0.5">
                  <button
                    type="button"
                    class="px-2 py-0.5 text-xs font-medium rounded-sm transition-all {scheduleMode ===
                    'daily'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'}"
                    onclick={() => (scheduleMode = "daily")}>Daily</button
                  >
                  <button
                    type="button"
                    class="px-2 py-0.5 text-xs font-medium rounded-sm transition-all {scheduleMode ===
                    'interval'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'}"
                    onclick={() => (scheduleMode = "interval")}>Interval</button
                  >
                </div>
              </div>

              <div
                class="bg-muted/30 rounded-lg p-4 space-y-4 border border-border/50"
              >
                {#if scheduleMode === "daily"}
                  <div class="flex items-center gap-3">
                    <Label class="shrink-0 w-12">Time</Label>
                    <div class="flex items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="23"
                        class="w-14 text-center"
                        bind:value={dailyHour}
                      />
                      <span class="text-muted-foreground font-bold">:</span>
                      <Input
                        type="number"
                        min="0"
                        max="59"
                        class="w-14 text-center"
                        bind:value={dailyMinute}
                      />
                    </div>
                  </div>
                {:else}
                  <div class="space-y-3">
                    <div class="flex items-center gap-3">
                      <Label class="shrink-0 w-12">Every</Label>
                      <div class="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="24"
                          class="w-16 text-center"
                          bind:value={intervalHours}
                        />
                        <span class="text-sm text-muted-foreground">hours</span>
                      </div>
                    </div>
                    {#if intervalHours >= 24}
                      <div
                        class="flex items-center gap-3 animate-in fade-in slide-in-from-top-1"
                      >
                        <Label class="shrink-0 w-12">At</Label>
                        <div class="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            class="w-14 text-center"
                            bind:value={intervalDailyHour}
                          />
                          <span class="text-sm text-muted-foreground">: 00</span
                          >
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}

                <div class="space-y-2 pt-2 border-t border-border/50">
                  <Label>Active Days</Label>
                  <div class="flex justify-between gap-1">
                    {#each DAY_LABELS as label, i}
                      <button
                        type="button"
                        class="size-7 rounded-full text-[10px] font-bold transition-all flex items-center justify-center border {selectedDays[
                          i
                        ]
                          ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50'}"
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
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t border-border">
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
            <Button
              type="submit"
              disabled={createSubmitting}
              class="min-w-[100px]"
            >
              {createSubmitting ? "Creating…" : "Create Job"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
