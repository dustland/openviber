<script lang="ts">
  /**
   * ChainOfThought — vertical step timeline with status icons.
   * Port of vercel/ai-elements chain-of-thought.tsx → Svelte 5
   */
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import { Brain, ChevronDown, Dot } from "@lucide/svelte";
  import type { Component } from "svelte";

  export interface ThoughtStep {
    label: string;
    description?: string;
    status?: "complete" | "active" | "pending";
    icon?: Component;
  }

  interface Props {
    steps: ThoughtStep[];
    title?: string;
    defaultOpen?: boolean;
    class?: string;
  }

  let {
    steps,
    title = "Chain of Thought",
    defaultOpen = false,
    class: className = "",
  }: Props = $props();

  let isOpen = $state(false);

  $effect(() => {
    isOpen = defaultOpen;
  });

  const stepStyles: Record<string, string> = {
    complete: "text-muted-foreground",
    active: "text-foreground",
    pending: "text-muted-foreground/50",
  };
</script>

<div class="not-prose w-full space-y-3 {className}">
  <Collapsible bind:open={isOpen}>
    <CollapsibleTrigger
      class="flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <Brain class="size-4 shrink-0" />
      <span class="flex-1 text-left">{title}</span>
      <ChevronDown
        class="size-4 shrink-0 transition-transform duration-200 {isOpen
          ? 'rotate-180'
          : ''}"
      />
    </CollapsibleTrigger>

    <CollapsibleContent class="mt-3 space-y-1">
      {#each steps as step, i (i)}
        {@const status = step.status ?? "complete"}
        {@const IconComponent = step.icon}
        <div
          class="flex gap-2 text-sm animate-in fade-in-0 slide-in-from-top-1 {stepStyles[
            status
          ]}"
        >
          <div class="relative mt-0.5 shrink-0">
            {#if IconComponent}
              <IconComponent class="size-4" />
            {:else}
              <Dot class="size-4" />
            {/if}
            {#if i < steps.length - 1}
              <div
                class="absolute top-6 bottom-0 left-1/2 -ml-px w-px bg-border"
              ></div>
            {/if}
          </div>
          <div class="flex-1 space-y-1 overflow-hidden pb-3">
            <div class="leading-tight">{step.label}</div>
            {#if step.description}
              <div class="text-xs text-muted-foreground">
                {step.description}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </CollapsibleContent>
  </Collapsible>
</div>
