<script lang="ts">
  import { onMount } from "svelte";
  import { ExternalLink, Copy, Plus, Trash2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";

  interface ForwardTarget {
    id: string;
    name: string;
    protocol: "http" | "https";
    host: string;
    port: string;
  }

  const STORAGE_KEY = "viber-board-port-forward-targets";

  const DEFAULT_TARGETS: ForwardTarget[] = [
    {
      id: "dev-server",
      name: "Dev Server",
      protocol: "http",
      host: "localhost",
      port: "6006",
    },
  ];

  let targets = $state<ForwardTarget[]>(DEFAULT_TARGETS);

  function toUrl(target: ForwardTarget): string {
    return `${target.protocol}://${target.host}:${target.port}`;
  }

  function openTarget(target: ForwardTarget) {
    window.open(toUrl(target), "_blank", "noopener,noreferrer");
  }

  async function copyTarget(target: ForwardTarget) {
    try {
      await navigator.clipboard.writeText(toUrl(target));
    } catch {
      // Ignore copy failures if clipboard permission is blocked
    }
  }

  function addTarget() {
    targets = [
      ...targets,
      {
        id: `target-${Date.now()}`,
        name: `Port ${targets.length + 1}`,
        protocol: "http",
        host: "localhost",
        port: "",
      },
    ];
  }

  function removeTarget(id: string) {
    targets = targets.filter((target) => target.id !== id);
  }

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          targets = parsed;
        }
      } catch {
        targets = DEFAULT_TARGETS;
      }
    }
  });

  $effect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
    }
  });
</script>

<div class="flex flex-col h-full min-h-0">
  <div class="flex items-center justify-between px-2 py-1.5 border-b border-border bg-muted/30 shrink-0">
    <p class="text-xs text-muted-foreground">
      Manage direct port links (no embedded iframe).
    </p>
    <Button variant="outline" size="sm" onclick={addTarget}>
      <Plus class="size-4 mr-1" />
      Add port
    </Button>
  </div>

  <div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
    {#each targets as target (target.id)}
      <div class="rounded-md border border-border bg-background p-2">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
          <label class="md:col-span-3 text-xs">
            <span class="text-muted-foreground">Name</span>
            <input
              type="text"
              bind:value={target.name}
              class="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="My app"
            />
          </label>

          <label class="md:col-span-2 text-xs">
            <span class="text-muted-foreground">Protocol</span>
            <select
              bind:value={target.protocol}
              class="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </label>

          <label class="md:col-span-3 text-xs">
            <span class="text-muted-foreground">Host</span>
            <input
              type="text"
              bind:value={target.host}
              class="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="localhost"
            />
          </label>

          <label class="md:col-span-2 text-xs">
            <span class="text-muted-foreground">Port</span>
            <input
              type="text"
              bind:value={target.port}
              class="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="6006"
            />
          </label>

          <div class="md:col-span-2 flex gap-1 justify-end">
            <Button
              variant="outline"
              size="sm"
              onclick={() => copyTarget(target)}
              title="Copy URL"
            >
              <Copy class="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => openTarget(target)}
              title="Open"
              disabled={!target.host || !target.port}
            >
              <ExternalLink class="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => removeTarget(target.id)}
              title="Remove"
              disabled={targets.length === 1}
            >
              <Trash2 class="size-4" />
            </Button>
          </div>
        </div>

        <p class="mt-2 text-xs text-muted-foreground font-mono">
          {toUrl(target)}
        </p>
      </div>
    {/each}
  </div>
</div>
