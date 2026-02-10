<script lang="ts">
  import { onMount } from "svelte";
  import {
    Archive,
    ArchiveRestore,
    AlertTriangle,
    Loader2,
    LoaderCircle,
    RefreshCw,
    Trash2,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Dialog from "$lib/components/ui/dialog";

  interface ArchivedViber {
    id: string;
    nodeId: string | null;
    nodeName: string | null;
    environmentId: string | null;
    environmentName: string | null;
    goal: string;
    status: string;
    createdAt: string | null;
    completedAt: string | null;
    nodeConnected: boolean | null;
    archivedAt: string | null;
  }

  let loading = $state(true);
  let error = $state<string | null>(null);
  let archivedVibers = $state<ArchivedViber[]>([]);
  let busyViberIds = $state<Set<string>>(new Set());
  let deleteDialogOpen = $state(false);
  let deleteTarget = $state<ArchivedViber | null>(null);
  let deleting = $state(false);

  async function fetchArchivedVibers() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/vibers?include_archived=true");
      if (!res.ok) {
        throw new Error("Failed to load vibers");
      }
      const data: ArchivedViber[] = await res.json();
      archivedVibers = data.filter((v) => v.archivedAt);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load archived vibers";
    } finally {
      loading = false;
    }
  }

  async function restoreViber(viberId: string) {
    if (busyViberIds.has(viberId)) return;
    busyViberIds.add(viberId);
    busyViberIds = new Set(busyViberIds);
    try {
      const response = await fetch(`/api/vibers/${viberId}/archive`, {
        method: "DELETE",
      });
      if (response.ok) {
        archivedVibers = archivedVibers.filter((v) => v.id !== viberId);
      } else {
        console.error("Failed to restore viber");
      }
    } catch (err) {
      console.error("Failed to restore viber:", err);
    } finally {
      busyViberIds.delete(viberId);
      busyViberIds = new Set(busyViberIds);
    }
  }

  function openDeleteDialog(viber: ArchivedViber) {
    deleteTarget = viber;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const viberId = deleteTarget.id;
    deleting = true;
    try {
      const response = await fetch(`/api/vibers/${viberId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        archivedVibers = archivedVibers.filter((v) => v.id !== viberId);
        deleteDialogOpen = false;
        deleteTarget = null;
      } else {
        console.error("Failed to delete viber");
      }
    } catch (err) {
      console.error("Failed to delete viber:", err);
    } finally {
      deleting = false;
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Unknown";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  onMount(() => {
    fetchArchivedVibers();
  });
</script>

<svelte:head>
  <title>Archived Vibers — Settings — OpenViber</title>
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="w-full px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="flex items-center justify-center size-10 rounded-lg bg-primary/10"
          >
            <Archive class="size-5 text-primary" />
          </div>
          <div>
            <h1 class="text-2xl font-semibold text-foreground">
              Archived Vibers
            </h1>
            <p class="text-sm text-muted-foreground">
              Manage archived vibers — restore them or delete them permanently
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onclick={() => fetchArchivedVibers()}
          disabled={loading}
        >
          <RefreshCw class="size-4 {loading ? 'animate-spin' : ''}" />
        </Button>
      </div>
    </header>

    {#if error}
      <div
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 mb-6"
      >
        <AlertTriangle class="size-5 text-destructive shrink-0" />
        <p class="text-sm text-destructive">{error}</p>
      </div>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="flex flex-col items-center gap-3">
          <Loader2 class="size-8 text-muted-foreground/50 animate-spin" />
          <p class="text-sm text-muted-foreground">Loading archived vibers...</p>
        </div>
      </div>
    {:else if archivedVibers.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <Archive class="size-12 mb-4 text-muted-foreground/30" />
        <p class="text-lg font-medium text-muted-foreground">
          No archived vibers
        </p>
        <p class="text-sm mt-2 max-w-md text-muted-foreground/80">
          When you archive a viber, it will appear here. You can then restore it
          or delete it permanently.
        </p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each archivedVibers as viber (viber.id)}
          <div
            class="group rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors"
          >
            <div class="flex items-center gap-4 px-4 py-3">
              <!-- Info -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-0.5">
                  <p
                    class="text-sm font-medium text-foreground truncate"
                    title={viber.goal || viber.id}
                  >
                    {viber.goal || viber.id}
                  </p>
                </div>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  {#if viber.environmentName}
                    <Badge variant="outline" class="text-[10px] px-1.5 py-0">
                      {viber.environmentName}
                    </Badge>
                  {/if}
                  {#if viber.nodeName}
                    <span>{viber.nodeName}</span>
                    <span class="text-muted-foreground/40">·</span>
                  {/if}
                  {#if viber.archivedAt}
                    <span>Archived {formatTimeAgo(viber.archivedAt)}</span>
                  {/if}
                  {#if viber.createdAt}
                    <span class="text-muted-foreground/40">·</span>
                    <span>Created {formatDate(viber.createdAt)}</span>
                  {/if}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8 gap-1.5"
                  disabled={busyViberIds.has(viber.id)}
                  onclick={() => restoreViber(viber.id)}
                >
                  {#if busyViberIds.has(viber.id)}
                    <LoaderCircle class="size-3.5 animate-spin" />
                  {:else}
                    <ArchiveRestore class="size-3.5" />
                  {/if}
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                  onclick={() => openDeleteDialog(viber)}
                >
                  <Trash2 class="size-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <p class="text-xs text-muted-foreground/60 mt-4">
        {archivedVibers.length} archived viber{archivedVibers.length !== 1
          ? "s"
          : ""}
      </p>
    {/if}
  </div>
</div>

<!-- Delete confirmation dialog -->
<Dialog.Root bind:open={deleteDialogOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <AlertTriangle class="size-5 text-destructive" />
        Delete viber permanently?
      </Dialog.Title>
      <Dialog.Description>
        This action cannot be undone. The viber and all its associated data will
        be permanently removed.
      </Dialog.Description>
    </Dialog.Header>

    {#if deleteTarget}
      <div class="rounded-lg border border-border bg-muted/50 px-3 py-2 my-2">
        <p class="text-sm font-medium text-foreground truncate">
          {deleteTarget.goal || deleteTarget.id}
        </p>
        {#if deleteTarget.archivedAt}
          <p class="text-xs text-muted-foreground mt-0.5">
            Archived {formatDate(deleteTarget.archivedAt)}
          </p>
        {/if}
      </div>
    {/if}

    <Dialog.Footer class="gap-2 sm:gap-0">
      <Button
        variant="outline"
        onclick={() => {
          deleteDialogOpen = false;
          deleteTarget = null;
        }}
        disabled={deleting}
      >
        Cancel
      </Button>
      <Button
        variant="destructive"
        onclick={confirmDelete}
        disabled={deleting}
        class="gap-1.5"
      >
        {#if deleting}
          <Loader2 class="size-4 animate-spin" />
          Deleting...
        {:else}
          <Trash2 class="size-4" />
          Delete permanently
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
