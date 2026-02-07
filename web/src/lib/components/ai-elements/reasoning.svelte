<script lang="ts">
  /**
   * Reasoning — auto-open/close thinking panel with streaming support.
   * Port of vercel/ai-elements reasoning.tsx → Svelte 5
   */
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import { Brain, ChevronDown } from "@lucide/svelte";
  import Shimmer from "./shimmer.svelte";

  interface Props {
    content: string;
    isStreaming?: boolean;
    duration?: number;
    class?: string;
  }

  let {
    content,
    isStreaming = false,
    duration,
    class: className = "",
  }: Props = $props();

  let isOpen = $state(false);
  let hasAutoClosed = $state(false);
  let hasEverStreamed = $state(false);
  let startTime: number | null = $state(null);
  let computedDuration = $state<number | undefined>(undefined);

  // Auto-open when streaming starts, auto-close when streaming ends
  $effect(() => {
    if (isStreaming) {
      hasEverStreamed = true;
      if (startTime === null) {
        startTime = Date.now();
      }
      if (!isOpen) {
        isOpen = true;
      }
    } else {
      // Compute duration when streaming ends
      if (startTime !== null) {
        computedDuration = Math.ceil((Date.now() - startTime) / 1000);
        startTime = null;
      }
      // Auto-close after streaming ends (once only)
      if (hasEverStreamed && isOpen && !hasAutoClosed) {
        const timer = setTimeout(() => {
          isOpen = false;
          hasAutoClosed = true;
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  });

  const displayDuration = $derived(duration ?? computedDuration);
</script>

<Collapsible bind:open={isOpen} class="not-prose mb-3 {className}">
  <CollapsibleTrigger
    class="flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <Brain class="size-4 shrink-0" />
    <span class="flex-1 text-left">
      {#if isStreaming || displayDuration === 0}
        <Shimmer>Thinking...</Shimmer>
      {:else if displayDuration !== undefined}
        Thought for {displayDuration} seconds
      {:else}
        Thought for a few seconds
      {/if}
    </span>
    <ChevronDown
      class="size-4 shrink-0 transition-transform duration-200 {isOpen
        ? 'rotate-180'
        : ''}"
    />
  </CollapsibleTrigger>

  <CollapsibleContent class="mt-3">
    <div
      class="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
    >
      {content}
    </div>
  </CollapsibleContent>
</Collapsible>
