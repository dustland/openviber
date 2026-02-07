<script lang="ts">
  /**
   * SessionIndicator — live activity indicator for long-running AI sessions.
   * Shows elapsed time, activity pulse, and a step-by-step trail of tool calls.
   * Designed for AI coding sessions that can run for 1+ hours.
   */
  import { onMount } from "svelte";
  import {
    Sparkles,
    Timer,
    CheckCircle2,
    Loader2,
    ChevronDown,
  } from "@lucide/svelte";

  export interface ActivityStep {
    /** Tool/step name */
    name: string;
    /** Status of this step */
    status: "running" | "complete" | "error";
    /** Optional short summary (e.g. "reading package.json") */
    summary?: string;
  }

  interface Props {
    /** When the session started (Date or timestamp) */
    startedAt: Date | number;
    /** Ordered list of tool call steps */
    steps?: ActivityStep[];
    class?: string;
  }

  let { startedAt, steps = [], class: className = "" }: Props = $props();

  let elapsed = $state("0s");
  let expanded = $state(false);

  function formatElapsed(startMs: number): string {
    const diff = Math.floor((Date.now() - startMs) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) {
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      return `${m}m ${s}s`;
    }
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  }

  onMount(() => {
    const startMs =
      typeof startedAt === "number" ? startedAt : startedAt.getTime();
    elapsed = formatElapsed(startMs);
    const interval = setInterval(() => {
      elapsed = formatElapsed(startMs);
    }, 1000);
    return () => clearInterval(interval);
  });

  const completedCount = $derived(
    steps.filter((s) => s.status === "complete").length,
  );
  const currentStep = $derived(steps.find((s) => s.status === "running"));
</script>

<div class="rounded-lg bg-muted/40 border border-border/40 text-xs {className}">
  <!-- Header bar — always visible -->
  <button
    type="button"
    class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
    onclick={() => (expanded = !expanded)}
  >
    <!-- Activity pulse -->
    <div class="relative flex items-center justify-center shrink-0">
      <span class="absolute size-3 rounded-full bg-green-500/30 animate-ping"
      ></span>
      <span class="relative size-2 rounded-full bg-green-500"></span>
    </div>

    <!-- Current status -->
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <Sparkles class="size-3.5 shrink-0 text-amber-500 animate-pulse" />
      <span class="text-muted-foreground truncate">
        {#if currentStep}
          <span class="font-medium text-foreground">{currentStep.name}</span>
          {#if currentStep.summary}
            <span class="ml-1 opacity-70">— {currentStep.summary}</span>
          {/if}
        {:else if steps.length > 0}
          Completed {completedCount} step{completedCount !== 1 ? "s" : ""}
        {:else}
          Working...
        {/if}
      </span>
    </div>

    <!-- Step counter -->
    {#if steps.length > 0}
      <span
        class="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
      >
        {completedCount}/{steps.length}
      </span>
    {/if}

    <!-- Elapsed time -->
    <div
      class="flex items-center gap-1 shrink-0 text-muted-foreground tabular-nums"
    >
      <Timer class="size-3" />
      <span>{elapsed}</span>
    </div>

    <!-- Expand/collapse -->
    {#if steps.length > 0}
      <ChevronDown
        class="size-3 shrink-0 text-muted-foreground transition-transform duration-200 {expanded
          ? 'rotate-180'
          : ''}"
      />
    {/if}
  </button>

  <!-- Step trail — expanded view -->
  {#if expanded && steps.length > 0}
    <div class="border-t border-border/40 px-3 py-2 space-y-1">
      {#each steps as step, i}
        <div class="flex items-start gap-2 py-0.5">
          <!-- Status icon -->
          {#if step.status === "complete"}
            <CheckCircle2 class="size-3.5 shrink-0 text-green-500 mt-0.5" />
          {:else if step.status === "running"}
            <Loader2
              class="size-3.5 shrink-0 text-amber-500 animate-spin mt-0.5"
            />
          {:else}
            <span
              class="size-3.5 shrink-0 rounded-full border border-red-400 mt-0.5"
            ></span>
          {/if}

          <!-- Step info -->
          <div class="min-w-0 flex-1">
            <span
              class="font-medium {step.status === 'complete'
                ? 'text-muted-foreground line-through'
                : step.status === 'running'
                  ? 'text-foreground'
                  : 'text-red-400'}"
            >
              {step.name}
            </span>
            {#if step.summary}
              <span class="ml-1 text-muted-foreground/70">
                {step.summary}
              </span>
            {/if}
          </div>

          <!-- Step number -->
          <span
            class="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums"
          >
            #{i + 1}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
