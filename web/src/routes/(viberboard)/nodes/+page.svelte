<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    Clock,
    Copy,
    Plus,
    RefreshCw,
    Server,
    Trash2,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";

  interface ViberNode {
    id: string;
    name: string;
    status: "pending" | "active" | "offline";
    onboard_token: string | null;
    token_expires_at: string | null;
    created_at: string;
  }

  let nodes = $state<ViberNode[]>([]);
  let loading = $state(true);
  let creating = $state(false);
  let copiedId = $state<string | null>(null);
  let showCreateDialog = $state(false);
  let newNodeName = $state("My Viber");

  function getOnboardCommand(token: string) {
    return `npx openviber onboard --token ${token}`;
  }

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function statusLabel(status: ViberNode["status"]) {
    switch (status) {
      case "active":
        return "Active";
      case "pending":
        return "Pending";
      default:
        return "Offline";
    }
  }

  function statusDot(status: ViberNode["status"]) {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "pending":
        return "bg-amber-500";
      default:
        return "bg-gray-400";
    }
  }

  async function fetchNodes() {
    try {
      const response = await fetch("/api/nodes");
      const payload = await response.json();
      nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    } catch (error) {
      console.error("Failed to fetch nodes:", error);
      nodes = [];
    }
  }

  async function createNode() {
    creating = true;
    try {
      const response = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newNodeName.trim() || "My Viber" }),
      });
      const payload = await response.json();
      if (payload?.node) {
        showCreateDialog = false;
        newNodeName = "My Viber";
        await fetchNodes();
      }
    } catch (error) {
      console.error("Failed to create node:", error);
    } finally {
      creating = false;
    }
  }

  async function deleteNode(nodeId: string) {
    const ok = window.confirm("Delete this node?");
    if (!ok) return;

    try {
      await fetch("/api/nodes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: nodeId }),
      });
      await fetchNodes();
    } catch (error) {
      console.error("Failed to delete node:", error);
    }
  }

  async function copyCommand(node: ViberNode) {
    if (!node.onboard_token) return;

    try {
      await navigator.clipboard.writeText(
        getOnboardCommand(node.onboard_token),
      );
      copiedId = node.id;
      setTimeout(() => {
        if (copiedId === node.id) copiedId = null;
      }, 1800);
    } catch (error) {
      console.error("Failed to copy command:", error);
    }
  }

  onMount(() => {
    loading = true;
    fetchNodes().finally(() => {
      loading = false;
    });
  });
</script>

<svelte:head>
  <title>Nodes - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-semibold text-foreground">Nodes</h1>
      <p class="text-sm mt-0.5 text-muted-foreground">
        Manage machine registrations and onboarding tokens.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onclick={() => (showCreateDialog = true)}
      >
        <Plus class="size-4 mr-1" />
        Add Node
      </Button>
      <Button variant="outline" size="icon" onclick={() => fetchNodes()}>
        <RefreshCw class="size-4" />
      </Button>
    </div>
  </div>

  {#if loading}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _}
        <div class="rounded-xl border border-border bg-card p-4 space-y-3">
          <div class="flex items-start justify-between">
            <div class="space-y-2 flex-1">
              <Skeleton class="h-4 w-2/3" />
              <Skeleton class="h-3 w-1/2" />
            </div>
            <Skeleton class="size-6 rounded-md shrink-0" />
          </div>
          <Skeleton class="h-9 w-full rounded-md" />
          <Skeleton class="h-3 w-3/4" />
        </div>
      {/each}
    </div>
  {:else if nodes.length === 0}
    <div
      class="rounded-xl border border-dashed border-border px-6 py-14 text-center"
    >
      <Server class="mx-auto mb-4 size-10 text-muted-foreground/60" />
      <h2 class="text-lg font-medium text-foreground">No nodes yet</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Create a node and onboard your first machine.
      </p>
      <Button class="mt-4" onclick={() => (showCreateDialog = true)}>
        <Plus class="size-4 mr-1" />
        Create Node
      </Button>
    </div>
  {:else}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each nodes as node (node.id)}
        <Card>
          <CardHeader class="pb-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <CardTitle class="flex items-center gap-2 text-base">
                  <span class="truncate">{node.name}</span>
                  <span
                    class={`size-1.5 rounded-full ${statusDot(node.status)}`}
                  ></span>
                </CardTitle>
                <CardDescription class="text-xs mt-0.5">
                  {statusLabel(node.status)} · created {formatTimeAgo(
                    node.created_at,
                  )}
                </CardDescription>
              </div>
              <button
                type="button"
                class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                onclick={() => deleteNode(node.id)}
                title="Delete node"
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent class="pt-0 space-y-2">
            {#if node.onboard_token}
              <button
                type="button"
                class="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs hover:bg-muted transition-colors"
                onclick={() => copyCommand(node)}
              >
                {#if copiedId === node.id}
                  <Check class="size-3.5" />
                  Copied
                {:else}
                  <Copy class="size-3.5" />
                  Copy Onboard Command
                {/if}
              </button>
            {/if}
            {#if node.token_expires_at}
              <p
                class="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"
              >
                <Clock class="size-3" />
                Token expires {new Date(node.token_expires_at).toLocaleString()}
              </p>
            {/if}
          </CardContent>
        </Card>
      {/each}
    </div>
  {/if}
</div>

{#if showCreateDialog}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4"
  >
    <div
      class="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
    >
      <h3 class="text-lg font-semibold text-foreground">Create Node</h3>
      <p class="mt-1 text-sm text-muted-foreground">
        Register a new machine for OpenViber.
      </p>
      <div class="mt-4 space-y-2">
        <label for="new-node-name" class="text-xs text-muted-foreground"
          >Node name</label
        >
        <input
          id="new-node-name"
          type="text"
          class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          bind:value={newNodeName}
        />
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button
          variant="outline"
          onclick={() => {
            showCreateDialog = false;
            newNodeName = "My Viber";
          }}
        >
          Cancel
        </Button>
        <Button disabled={creating} onclick={createNode}>
          {creating ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  </div>
{/if}
