<script lang="ts">
  import { onMount } from "svelte";
  import {
    CalendarClock,
    Clock,
    Zap,
    FileText,
    AlertCircle,
    ChevronRight,
    Mail,
    Plus,
    Trash2,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";

  interface JobEntry {
    name: string;
    description?: string;
    schedule: string;
    scheduleDescription: string;
    model?: string;
    prompt?: string;
    enabled: boolean;
    filename: string;
  }

  interface ViberJobsGroup {
    viberId: string;
    jobs: JobEntry[];
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
  let formSchedule = $state("0 8 * * *");
  let formPrompt = $state("");
  let formDescription = $state("");
  let formModel = $state("");

  let deletingName = $state<string | null>(null);

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
    if (!formName.trim() || !formSchedule.trim() || !formPrompt.trim()) {
      createError = "Name, schedule (cron), and prompt are required.";
      return;
    }
    createError = null;
    createSubmitting = true;
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          schedule: formSchedule.trim(),
          prompt: formPrompt.trim(),
          description: formDescription.trim() || undefined,
          model: formModel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create job");
      showCreateForm = false;
      formName = "";
      formSchedule = "0 8 * * *";
      formPrompt = "";
      formDescription = "";
      formModel = "";
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

  onMount(() => {
    fetchJobs();
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
        <code class="rounded bg-muted px-1.5 py-0.5 text-xs">~/.openviber/jobs/</code>
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
        {#if showCreateForm}
          <div class="rounded-xl border border-border bg-card p-6 mb-4">
            <h2 class="text-lg font-semibold text-foreground mb-4">New job</h2>
            {#if createError}
              <p class="text-sm text-destructive mb-3">{createError}</p>
            {/if}
            <form
              class="space-y-4"
              onsubmit={(e) => {
                e.preventDefault();
                createJob();
              }}
            >
              <div>
                <label for="job-name" class="block text-sm font-medium text-foreground mb-1">Name</label>
                <input
                  id="job-name"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. daily-email-report"
                  bind:value={formName}
                />
              </div>
              <div>
                <label for="job-schedule" class="block text-sm font-medium text-foreground mb-1">Schedule (cron)</label>
                <input
                  id="job-schedule"
                  type="text"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder="0 8 * * *"
                  bind:value={formSchedule}
                />
                <p class="mt-1 text-xs text-muted-foreground">
                  Example: <code>0 8 * * *</code> = 8:00 daily. <a href="/docs/concepts/jobs" class="text-primary hover:underline">Cron help</a>
                </p>
              </div>
              <div>
                <label for="job-prompt" class="block text-sm font-medium text-foreground mb-1">Prompt / task</label>
                <textarea
                  id="job-prompt"
                  rows="3"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Summarize my emails and send me a report."
                  bind:value={formPrompt}
                ></textarea>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label for="job-description" class="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
                  <input
                    id="job-description"
                    type="text"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    bind:value={formDescription}
                  />
                </div>
                <div>
                  <label for="job-model" class="block text-sm font-medium text-foreground mb-1">Model (optional)</label>
                  <input
                    id="job-model"
                    type="text"
                    class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    placeholder="e.g. deepseek/deepseek-chat"
                    bind:value={formModel}
                  />
                </div>
              </div>
              <div class="flex gap-2">
                <Button type="submit" disabled={createSubmitting}>
                  {createSubmitting ? "Creating…" : "Create job"}
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
        {:else}
          <Button onclick={() => (showCreateForm = true)}>
            <Plus class="size-4 mr-2" />
            Create job
          </Button>
        {/if}
      </div>

      {#if !hasAnyJobs}
        <div class="rounded-xl border border-dashed border-border p-12 text-center">
          <Mail class="size-12 text-muted-foreground/50 mx-auto mb-4" />
          <h2 class="text-lg font-medium text-foreground mb-2">
            No jobs yet
          </h2>
          <p class="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            Create a job above, or ask a viber to create one (e.g. “Summarize emails and send me a report at 8am every day”). Jobs are stored in
            <code class="rounded bg-muted px-1.5 py-0.5 text-xs">~/.openviber/jobs/</code>.
            Restart the daemon to load new jobs.
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
              <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Global jobs
              </h2>
              <div class="grid gap-4">
                {#each globalJobs as job}
                  <div
                    class="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm flex items-start justify-between gap-4"
                  >
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <h3 class="text-lg font-semibold text-card-foreground truncate">
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
                        <div class="flex items-center gap-1.5 text-muted-foreground">
                          <Clock class="size-4" />
                          <span>{job.scheduleDescription || job.schedule}</span>
                        </div>
                        {#if job.model}
                          <div class="flex items-center gap-1.5 text-muted-foreground">
                            <Zap class="size-4" />
                            <span class="font-mono text-xs">{job.model}</span>
                          </div>
                        {/if}
                      </div>
                      {#if job.prompt}
                        <div class="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50">
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
                <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
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
                            <h3 class="text-lg font-semibold text-card-foreground truncate">
                              {job.name}
                            </h3>
                            {#if !job.enabled}
                              <span class="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                                Disabled
                              </span>
                            {/if}
                          </div>
                          {#if job.description}
                            <p class="text-sm text-muted-foreground mb-3">
                              {job.description}
                            </p>
                          {/if}
                          <div class="flex flex-wrap items-center gap-3 text-sm">
                            <div class="flex items-center gap-1.5 text-muted-foreground">
                              <Clock class="size-4" />
                              <span>{job.scheduleDescription || job.schedule}</span>
                            </div>
                            {#if job.model}
                              <div class="flex items-center gap-1.5 text-muted-foreground">
                                <Zap class="size-4" />
                                <span class="font-mono text-xs">{job.model}</span>
                              </div>
                            {/if}
                          </div>
                          {#if job.prompt}
                            <div class="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50">
                              <p class="text-sm text-muted-foreground line-clamp-2">
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
                              <span class="size-1.5 rounded-full bg-current"></span>
                              Active
                            </span>
                          {:else}
                            <span
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                            >
                              <span class="size-1.5 rounded-full bg-current"></span>
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
