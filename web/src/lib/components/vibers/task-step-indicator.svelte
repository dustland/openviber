<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  interface Props {
    status: string;
    archived?: boolean;
  }

  let { status, archived = false }: Props = $props();

  const runningSteps = ["Thinking", "Planning", "Working"];
  let phaseIndex = $state(0);
  let phaseTimer: ReturnType<typeof setInterval> | null = null;

  const normalizedStatus = $derived((status || "unknown").toLowerCase());
  const stepText = $derived.by(() => {
    if (archived) return "Archived";
    if (normalizedStatus === "running" || normalizedStatus === "pending") {
      return runningSteps[phaseIndex % runningSteps.length];
    }
    if (normalizedStatus === "completed") return "Completed";
    if (normalizedStatus === "error") return "Needs attention";
    if (normalizedStatus === "stopped") return "Stopped";
    return "Queued";
  });

  const animated = $derived(
    normalizedStatus === "running" || normalizedStatus === "pending",
  );

  onMount(() => {
    phaseTimer = setInterval(() => {
      phaseIndex += 1;
    }, 1600);
  });

  onDestroy(() => {
    if (phaseTimer) clearInterval(phaseTimer);
  });
</script>

<p
  class="mt-1.5 text-xs text-muted-foreground truncate {animated
    ? 'task-step-animated'
    : ''}"
>
  {stepText}
  {#if animated}
    <span class="task-step-dots" aria-hidden="true"></span>
  {/if}
</p>

<style>
  .task-step-animated {
    color: color-mix(in oklab, var(--foreground) 72%, var(--muted-foreground));
    animation: task-step-glow 1.6s ease-in-out infinite;
  }

  .task-step-dots::after {
    content: "...";
    display: inline-block;
    width: 1.5em;
    text-align: left;
    animation: task-step-dots 1.2s steps(4, end) infinite;
  }

  @keyframes task-step-glow {
    0%,
    100% {
      opacity: 0.72;
    }

    50% {
      opacity: 1;
    }
  }

  @keyframes task-step-dots {
    0% {
      width: 0;
    }

    100% {
      width: 1.5em;
    }
  }
</style>
