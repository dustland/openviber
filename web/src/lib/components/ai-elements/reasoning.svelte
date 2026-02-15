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
  import { marked } from "marked";

  marked.setOptions({ gfm: true, breaks: true });

  function sanitizeHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "")
      .replace(/href="javascript:[^"]*"/gi, 'href="#"')
      .replace(/href='javascript:[^']*'/gi, "href='#'");
  }

  function renderMarkdown(text: string): string {
    if (!text) return "";
    return sanitizeHtml(marked.parse(text) as string);
  }

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
  const renderedContent = $derived(renderMarkdown(content));
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
      class="reasoning-content rounded-lg border border-border/40 bg-muted/30 p-3 text-sm text-muted-foreground leading-relaxed"
    >
      {@html renderedContent}
    </div>
  </CollapsibleContent>
</Collapsible>

<style>
  .reasoning-content :global(p) {
    margin: 0.4em 0;
  }
  .reasoning-content :global(p:first-child) {
    margin-top: 0;
  }
  .reasoning-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .reasoning-content :global(strong) {
    color: var(--foreground);
    font-weight: 600;
  }
  .reasoning-content :global(em) {
    font-style: italic;
  }
  .reasoning-content :global(code) {
    font-size: 0.85em;
    padding: 0.15em 0.35em;
    border-radius: 0.25rem;
    background: hsl(var(--muted) / 0.6);
  }
  .reasoning-content :global(pre) {
    margin: 0.5em 0;
    padding: 0.6em 0.8em;
    border-radius: 0.375rem;
    background: hsl(0 0% 10%);
    overflow-x: auto;
  }
  .reasoning-content :global(pre code) {
    padding: 0;
    background: none;
    font-size: 0.85em;
  }
  .reasoning-content :global(ul),
  .reasoning-content :global(ol) {
    margin: 0.4em 0;
    padding-left: 1.4em;
  }
  .reasoning-content :global(li) {
    margin: 0.15em 0;
  }
  .reasoning-content :global(blockquote) {
    margin: 0.5em 0;
    padding-left: 0.8em;
    border-left: 3px solid hsl(var(--border) / 0.5);
    color: var(--muted-foreground);
  }
  .reasoning-content :global(a) {
    color: hsl(var(--primary));
    text-decoration: underline;
  }
  .reasoning-content :global(h1),
  .reasoning-content :global(h2),
  .reasoning-content :global(h3),
  .reasoning-content :global(h4) {
    color: var(--foreground);
    font-weight: 600;
    margin: 0.6em 0 0.3em;
  }
</style>
