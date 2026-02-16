<script lang="ts">
  import { onMount } from "svelte";
  import {
    CalendarClock,
    Clock,
    Zap,
    AlertCircle,
    Mail,
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
    viberId?: string | null;
    viberName?: string | null;
  }

  let { data } = $props();
  const viberId = $derived(data.viberId);

  let jobs = $state<JobEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
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

      // Filter jobs related to this viber
      const globalJobs: JobEntry[] = (data.globalJobs ?? []).filter(
        (j: JobEntry) => j.viberId === viberId,
      );
      const nodeJobGroups: { viberId: string; jobs: JobEntry[] }[] =
        data.nodeJobs ?? [];
      const nodeJobs = nodeJobGroups
        .filter((g) => g.viberId === viberId)
        .flatMap((g) => g.jobs);

      jobs = [...globalJobs, ...nodeJobs];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load jobs";
      jobs = [];
    } finally {
      loading = false;
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
</script>

<div class="h-full overflow-y-auto p-6 flex flex-col">
  {#if error}
    <div
      class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 mb-6"
    >
      <AlertCircle class="size-5 text-destructive shrink-0" />
      <p class="text-destructive">{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-16 flex-1">
      <div class="animate-pulse flex flex-col items-center gap-3">
        <CalendarClock class="size-10 text-muted-foreground/50" />
        <p class="text-sm text-muted-foreground">Loading jobs…</p>
      </div>
    </div>
  {:else if jobs.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center flex-1"
    >
      <Mail class="size-12 text-muted-foreground/50 mx-auto mb-4" />
      <h2 class="text-lg font-medium text-foreground mb-2">
        No jobs for this viber
      </h2>
      <p class="text-muted-foreground text-sm max-w-md mx-auto">
        Jobs are created automatically when tasks include scheduled actions like
        "check email every day at 8am".
      </p>
    </div>
  {:else}
    <div class="grid gap-4">
      {#each jobs as job}
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

    <p class="mt-6 text-center text-sm text-muted-foreground">
      {jobs.length} job{jobs.length === 1 ? "" : "s"}
    </p>
  {/if}
</div>
