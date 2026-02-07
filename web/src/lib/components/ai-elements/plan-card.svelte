<script lang="ts">
  /**
   * PlanCard — streaming plan display card with collapsible details.
   * Port of vercel/ai-elements plan.tsx → Svelte 5
   */
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import { ChevronsUpDown } from "@lucide/svelte";
  import Shimmer from "./shimmer.svelte";

  interface Props {
    title: string;
    description?: string;
    isStreaming?: boolean;
    defaultOpen?: boolean;
    class?: string;
  }

  let {
    title,
    description,
    isStreaming = false,
    defaultOpen = true,
    class: className = "",
  }: Props = $props();

  let isOpen = $state(defaultOpen);
</script>

<Collapsible bind:open={isOpen}>
  <div
    class="not-prose rounded-lg border border-border/60 bg-card shadow-none {className}"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 p-4">
      <div class="space-y-1 min-w-0">
        <h3 class="font-semibold text-sm leading-tight">
          {#if isStreaming}
            <Shimmer>{title}</Shimmer>
          {:else}
            {title}
          {/if}
        </h3>
        {#if description}
          <p class="text-sm text-muted-foreground text-balance">
            {#if isStreaming}
              <Shimmer>{description}</Shimmer>
            {:else}
              {description}
            {/if}
          </p>
        {/if}
      </div>
      <CollapsibleTrigger
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronsUpDown class="size-4" />
        <span class="sr-only">Toggle plan</span>
      </CollapsibleTrigger>
    </div>

    <!-- Collapsible content -->
    <CollapsibleContent>
      <div class="border-t border-border/40 p-4">
        <slot />
      </div>
    </CollapsibleContent>
  </div>
</Collapsible>
