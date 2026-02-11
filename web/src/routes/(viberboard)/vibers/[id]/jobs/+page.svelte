<script lang="ts">
  import { page } from "$app/stores";
  import { Calendar, Clock, Zap, FileText, AlertCircle } from "@lucide/svelte";

  let { data } = $props();

  interface Job {
    name: string;
    description?: string;
    schedule: string;
    scheduleDescription: string;
    model?: string;
    prompt?: string;
    enabled: boolean;
    filename: string;
  }

  const jobs: Job[] = $derived(data.jobs || []);
  const viberId = $derived($page.params.id);
</script>

<svelte:head>
  <title>Jobs - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div>
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-foreground mb-2">Scheduled Jobs</h1>
      <p class="text-muted-foreground">
        Automated tasks that run on a schedule for this task.
      </p>
    </header>

    {#if data.error}
      <div
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3"
      >
        <AlertCircle class="size-5 text-destructive" />
        <p class="text-destructive">{data.error}</p>
      </div>
    {:else if jobs.length === 0}
      <div
        class="rounded-xl border border-dashed border-border p-12 text-center"
      >
        <Calendar class="size-12 text-muted-foreground/50 mx-auto mb-4" />
        <h2 class="text-lg font-medium text-foreground mb-2">
          No jobs configured
        </h2>
        <p class="text-muted-foreground text-sm max-w-md mx-auto mb-6">
          Ask the task to schedule a job for you, or create a YAML file
          manually.
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
      <div class="grid gap-4">
        {#each jobs as job}
          <div
            class="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h2
                    class="text-lg font-semibold text-card-foreground truncate"
                  >
                    {job.name}
                  </h2>
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

                <div class="flex flex-wrap items-center gap-3 text-sm">
                  <div class="flex items-center gap-1.5 text-muted-foreground">
                    <Clock class="size-4" />
                    <span>{job.scheduleDescription || job.schedule}</span>
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

      <p class="mt-6 text-center text-sm text-muted-foreground">
        {jobs.length} job{jobs.length === 1 ? "" : "s"} configured
      </p>
    {/if}
  </div>
</div>
