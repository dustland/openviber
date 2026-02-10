<script lang="ts">
  import {
    CalendarClock,
    FilePlus,
    HeartPulse,
    Palette,
    Sparkles,
    Users,
  } from "@lucide/svelte";
  import { JOB_TEMPLATES } from "$lib/data/job-templates";
  import { TASK_TEMPLATES } from "$lib/data/task-templates";
  import {
    applyTemplate as applyTemplateString,
    buildDefaultParams,
    type TemplateParam,
  } from "$lib/data/template-utils";

  type StoryWithPreview = {
    id: string;
    label: string;
    description: string;
    icon: string;
    prompt: string;
    params?: TemplateParam[];
    paramValues: Record<string, string>;
  };

  type JobStoryPreview = StoryWithPreview & {
    scheduleLabel: string;
    skills: string[];
  };

  const TASK_ICONS = {
    palette: Palette,
    sparkles: Sparkles,
  } as const;

  const JOB_ICONS = {
    "file-plus": FilePlus,
    "heart-pulse": HeartPulse,
    users: Users,
    sparkles: Sparkles,
  } as const;

  function formatTime(hour: number, minute: number): string {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function describeSchedule(defaults: {
    schedule?: string;
    scheduleMode?: "daily" | "interval";
    dailyHour?: number;
    dailyMinute?: number;
    intervalHours?: number;
    intervalDailyHour?: number;
  }): string {
    if (defaults.schedule) return defaults.schedule;
    if (defaults.scheduleMode === "interval") {
      const hours = defaults.intervalHours ?? 24;
      if (hours >= 24) {
        const hour = defaults.intervalDailyHour ?? 8;
        return `Daily at ${formatTime(hour, 0)}`;
      }
      return `Every ${hours} hours`;
    }
    if (defaults.scheduleMode === "daily") {
      const hour = defaults.dailyHour ?? 8;
      const minute = defaults.dailyMinute ?? 0;
      return `Daily at ${formatTime(hour, minute)}`;
    }
    return "Custom schedule";
  }

  function buildTaskStories(): StoryWithPreview[] {
    return TASK_TEMPLATES.map((tpl) => {
      const paramValues = buildDefaultParams(tpl.params);
      const prompt = applyTemplateString(
        tpl.promptTemplate,
        paramValues,
      ).trim();
      return {
        id: tpl.id,
        label: tpl.label,
        description: tpl.description,
        icon: tpl.icon,
        prompt,
        params: tpl.params,
        paramValues,
      };
    });
  }

  function buildJobStories(): JobStoryPreview[] {
    return JOB_TEMPLATES.map((tpl) => {
      const paramValues = buildDefaultParams(tpl.params);
      const promptTemplate = tpl.promptTemplate ?? tpl.defaults.prompt ?? "";
      const prompt = applyTemplateString(promptTemplate, paramValues).trim();
      const skills = (tpl.defaults.skills ?? [])
        .map((skill) => applyTemplateString(skill, paramValues).trim())
        .filter(Boolean);
      return {
        id: tpl.id,
        label: tpl.label,
        description: tpl.description,
        icon: tpl.icon,
        prompt,
        params: tpl.params,
        paramValues,
        scheduleLabel: describeSchedule(tpl.defaults),
        skills,
      };
    });
  }

  const taskStories = buildTaskStories();
  const jobStories = buildJobStories();
</script>

<svelte:head>
  <title>Viber Stories — OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="max-w-5xl mx-auto space-y-10">
    <header class="space-y-2">
      <div
        class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
      >
        <Sparkles class="size-3.5" />
        Viber Stories
      </div>
      <h1 class="text-3xl font-bold text-foreground">Viber Stories</h1>
      <p class="text-sm text-muted-foreground max-w-2xl">
        Ready-made workflows you can launch instantly. Pick a story, configure
        the inputs, and run it as a one-time task or a recurring job.
      </p>
    </header>

    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-foreground">One-time stories</h2>
          <p class="text-xs text-muted-foreground">
            Best for focused, single-run workflows.
          </p>
        </div>
        <a
          href="/vibers/new"
          class="text-xs font-medium text-primary hover:underline"
        >
          Start a new viber →
        </a>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each taskStories as story (story.id)}
          <div class="rounded-xl border border-border bg-card p-5 space-y-4">
            <div class="flex items-start gap-3">
              <div
                class="size-9 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground"
              >
                <svelte:component
                  this={TASK_ICONS[story.icon as keyof typeof TASK_ICONS]}
                  class="size-4"
                />
              </div>
              <div>
                <h3 class="text-base font-semibold text-foreground">
                  {story.label}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {story.description}
                </p>
              </div>
            </div>

            {#if story.params && story.params.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each story.params as param}
                  {@const value = story.paramValues[param.id]}
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {param.label}
                    {#if param.required}
                      <span class="text-destructive">*</span>
                    {/if}
                    {#if value}
                      <span class="text-foreground/70">· {value}</span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}

            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                Prompt preview
              </p>
              <p class="text-sm text-muted-foreground line-clamp-3">
                {story.prompt || "No prompt provided yet."}
              </p>
            </div>

            <div class="flex items-center justify-between pt-2">
              <span class="text-[11px] text-muted-foreground">
                Run once · Launch in Vibers
              </span>
              <a
                href={`/vibers/new?story=${story.id}`}
                class="text-xs font-medium text-primary hover:underline"
              >
                Use story
              </a>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-foreground">
            Scheduled stories
          </h2>
          <p class="text-xs text-muted-foreground">
            Recurring workflows that run on a cadence.
          </p>
        </div>
        <a
          href="/jobs"
          class="text-xs font-medium text-primary hover:underline"
        >
          Create a job →
        </a>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each jobStories as story (story.id)}
          <div class="rounded-xl border border-border bg-card p-5 space-y-4">
            <div class="flex items-start gap-3">
              <div
                class="size-9 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground"
              >
                <svelte:component
                  this={JOB_ICONS[story.icon as keyof typeof JOB_ICONS]}
                  class="size-4"
                />
              </div>
              <div>
                <h3 class="text-base font-semibold text-foreground">
                  {story.label}
                </h3>
                <p class="text-xs text-muted-foreground">
                  {story.description}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span class="inline-flex items-center gap-1">
                <CalendarClock class="size-3.5" />
                {story.scheduleLabel}
              </span>
              {#if story.skills.length > 0}
                <span class="inline-flex items-center gap-1">
                  <span class="text-foreground/60">Skills:</span>
                  {story.skills.join(", ")}
                </span>
              {/if}
            </div>

            {#if story.params && story.params.length > 0}
              <div class="flex flex-wrap gap-2">
                {#each story.params as param}
                  {@const value = story.paramValues[param.id]}
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {param.label}
                    {#if param.required}
                      <span class="text-destructive">*</span>
                    {/if}
                    {#if value}
                      <span class="text-foreground/70">· {value}</span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}

            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                Prompt preview
              </p>
              <p class="text-sm text-muted-foreground line-clamp-3">
                {story.prompt || "No prompt provided yet."}
              </p>
            </div>

            <div class="flex items-center justify-between pt-2">
              <span class="text-[11px] text-muted-foreground">
                Runs on schedule · Configure in Jobs
              </span>
              <a
                href={`/jobs?story=${story.id}`}
                class="text-xs font-medium text-primary hover:underline"
              >
                Use story
              </a>
            </div>
          </div>
        {/each}
      </div>
    </section>
  </div>
</div>
