<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
  } from "$lib/components/ui/dropdown-menu";
  import { ChevronDown, Check, Circle } from "@lucide/svelte";
  import { getVibersStore } from "$lib/stores/vibers";

  interface Viber {
    id: string;
    name: string;
    /** Connection status of the node hosting this viber; null if no node */
    nodeConnected: boolean | null;
  }

  interface Props {
    currentViber?: Viber | null;
    collapsed?: boolean;
  }

  let { currentViber = null, collapsed = false }: Props = $props();

  const vibersStore = getVibersStore();
  const vibersState = $derived($vibersStore);
  const vibers = $derived(
    vibersState.vibers.map((v) => ({
      id: v.id,
      name: v.goal,
      nodeConnected: v.nodeConnected,
    })),
  );
  const loading = $derived(vibersState.loading);

  const currentViberId = $derived($page.params.id);

  onMount(() => {
    void vibersStore.getVibers();
  });

  function navigateToViber(viberId: string) {
    window.location.href = `/vibers/${viberId}`;
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger
    class="h-8 rounded-md px-2 text-sm text-sidebar-foreground inline-flex items-center gap-1.5 hover:bg-sidebar-accent transition-colors flex-1 min-w-0 {collapsed
      ? 'justify-center'
      : ''}"
  >
    {#if !collapsed}
      <span class="truncate font-semibold text-sm flex-1 text-left">
        {currentViber?.name || "All Vibers"}
      </span>
      {#if currentViber?.nodeConnected === true}
        <span class="size-1.5 rounded-full bg-green-500 shrink-0"></span>
      {:else if currentViber}
        <span class="size-1.5 rounded-full bg-muted-foreground shrink-0"></span>
      {/if}
      <ChevronDown class="size-3.5 opacity-50 shrink-0" />
    {:else}
      <ChevronDown class="size-3.5 opacity-50" />
    {/if}
  </DropdownMenuTrigger>
  <DropdownMenuContent
    side="bottom"
    align="start"
    sideOffset={4}
    class="min-w-56 rounded-md border border-border bg-popover p-1 shadow-md"
  >
    <!-- All Vibers link -->
    <DropdownMenuItem
      class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
      onSelect={() => (window.location.href = "/vibers")}
    >
      <img src="/favicon.png" alt="OpenViber" class="size-4" />
      <span class="flex-1">All Vibers</span>
      {#if !currentViberId}
        <Check class="size-4 text-primary" />
      {/if}
    </DropdownMenuItem>

    {#if vibers.length > 0}
      <DropdownMenuSeparator class="my-1 h-px bg-border" />

      {#each vibers as viber}
        <DropdownMenuItem
          class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
          onSelect={() => navigateToViber(viber.id)}
        >
          <Circle
            class="size-2 {viber.nodeConnected === true
              ? 'fill-green-500 text-green-500'
              : 'fill-muted-foreground text-muted-foreground'}"
          />
          <span class="flex-1 truncate">{viber.name}</span>
          {#if currentViberId === viber.id}
            <Check class="size-4 text-primary" />
          {/if}
        </DropdownMenuItem>
      {/each}
    {:else if !loading}
      <DropdownMenuSeparator class="my-1 h-px bg-border" />
      <div class="px-2.5 py-2 text-sm text-muted-foreground">
        No vibers connected
      </div>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
