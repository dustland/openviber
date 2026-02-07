<script lang="ts">
  /**
   * TaskQueue — task list with completion indicators and collapsible sections.
   * Port of vercel/ai-elements queue.tsx → Svelte 5
   */
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import { ChevronDown } from "@lucide/svelte";

  export interface TaskItem {
    id: string;
    title: string;
    description?: string;
    status?: "pending" | "completed" | "in_progress";
  }

  interface Props {
    items: TaskItem[];
    title?: string;
    defaultOpen?: boolean;
    class?: string;
  }

  let {
    items,
    title,
    defaultOpen = true,
    class: className = "",
  }: Props = $props();

  const completedItems = $derived(
    items.filter((i) => i.status === "completed"),
  );
  const pendingItems = $derived(items.filter((i) => i.status !== "completed"));

  let isOpen = $state(defaultOpen);
</script>

<div
  class="not-prose flex flex-col gap-2 rounded-xl border border-border bg-background px-3 pt-2 pb-2 shadow-sm {className}"
>
  {#if title || items.length > 0}
    <Collapsible bind:open={isOpen}>
      <CollapsibleTrigger
        class="group flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <span class="flex items-center gap-2">
          <ChevronDown
            class="size-4 transition-transform duration-200 {isOpen
              ? ''
              : '-rotate-90'}"
          />
          <span>
            {title ?? `${completedItems.length}/${items.length} tasks`}
          </span>
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent class="mt-2 -mb-1">
        <div class="max-h-40 overflow-y-auto pr-2">
          <ul>
            {#each pendingItems as item (item.id)}
              <li
                class="group flex flex-col gap-1 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <div class="flex items-center gap-2.5">
                  <span
                    class="mt-0.5 inline-block size-2.5 shrink-0 rounded-full border border-muted-foreground/50 {item.status ===
                    'in_progress'
                      ? 'animate-pulse border-amber-500 bg-amber-500/20'
                      : ''}"
                  ></span>
                  <span
                    class="line-clamp-1 grow break-words text-muted-foreground"
                  >
                    {item.title}
                  </span>
                </div>
                {#if item.description}
                  <div class="ml-5 text-xs text-muted-foreground">
                    {item.description}
                  </div>
                {/if}
              </li>
            {/each}
            {#each completedItems as item (item.id)}
              <li
                class="group flex flex-col gap-1 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <div class="flex items-center gap-2.5">
                  <span
                    class="mt-0.5 inline-block size-2.5 shrink-0 rounded-full border border-muted-foreground/20 bg-muted-foreground/10"
                  ></span>
                  <span
                    class="line-clamp-1 grow break-words text-muted-foreground/50 line-through"
                  >
                    {item.title}
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  {/if}
</div>
