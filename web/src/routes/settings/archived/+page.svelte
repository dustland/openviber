<script lang="ts">
  import { onMount } from "svelte";
  import {
    Archive,
    ArchiveRestore,
    AlertTriangle,
    LoaderCircle,
    RefreshCw,
    Trash2,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Dialog from "$lib/components/ui/dialog";

  interface ArchivedTask {
    id: string;
    viberId: string | null;
    viberName: string | null;
    environmentId: string | null;
    environmentName: string | null;
    goal: string;
    status: string;
    createdAt: string | null;
    completedAt: string | null;
    viberConnected: boolean | null;
    archivedAt: string | null;
  }

  let loading = $state(true);
  let error = $state<string | null>(null);
  let archivedTasks = $state<ArchivedTask[]>([]);
  let busyTaskIds = $state<Set<string>>(new Set());
  let deleteDialogOpen = $state(false);
  let deleteTarget = $state<ArchivedTask | null>(null);
  let deleting = $state(false);

  async function fetchArchivedTasks() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/tasks?include_archived=true");
      if (!res.ok) {
        throw new Error("Failed to load tasks");
      }
      const data: ArchivedTask[] = await res.json();
      archivedTasks = data.filter((t) => t.archivedAt);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load archived tasks";
    } finally {
      loading = false;
    }
  }

  async function restoreTask(taskId: string) {
    if (busyTaskIds.has(taskId)) return;
    busyTaskIds.add(taskId);
    busyTaskIds = new Set(busyTaskIds);
    try {
      const response = await fetch(`/api/tasks/${taskId}/archive`, {
        method: "DELETE",
      });
      if (response.ok) {
        archivedTasks = archivedTasks.filter((t) => t.id !== taskId);
      } else {
        console.error("Failed to restore task");
      }
    } catch (err) {
      console.error("Failed to restore task:", err);
    } finally {
      busyTaskIds.delete(taskId);
      busyTaskIds = new Set(busyTaskIds);
    }
  }

  function openDeleteDialog(task: ArchivedTask) {
    deleteTarget = task;
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const taskId = deleteTarget.id;
    deleting = true;
    try {
      const response = await fetch(`/api/vibers/${taskId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        archivedTasks = archivedTasks.filter((t) => t.id !== taskId);
        deleteDialogOpen = false;
        deleteTarget = null;
      } else {
        console.error("Failed to delete task");
      }
    } catch (err) {
      console.error("Failed to delete task:", err);
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
    fetchArchivedTasks();
  });
</script>

<svelte:head>
  <title>Archived Tasks — Settings — OpenViber</title>
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
              Archived Tasks
            </h1>
            <p class="text-sm text-muted-foreground">
              Manage archived tasks — restore them or delete them permanently
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onclick={() => fetchArchivedTasks()}
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
      <div class="space-y-2">
        {#each Array(4) as _}
          <div class="rounded-xl border border-border bg-card px-4 py-3">
            <div class="flex items-center gap-4">
              <div class="min-w-0 flex-1 space-y-2">
                <Skeleton class="h-4 w-3/5" />
                <div class="flex items-center gap-2">
                  <Skeleton class="h-3 w-16" />
                  <Skeleton class="h-3 w-24" />
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <Skeleton class="h-8 w-20 rounded-md" />
                <Skeleton class="h-8 w-20 rounded-md" />
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if archivedTasks.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <Archive class="size-12 mb-4 text-muted-foreground/30" />
        <p class="text-lg font-medium text-muted-foreground">
          No archived tasks
        </p>
        <p class="text-sm mt-2 max-w-md text-muted-foreground/80">
          When you archive a task, it will appear here. You can then restore it
          or delete it permanently.
        </p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each archivedTasks as task (task.id)}
          <div
            class="group rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors"
          >
            <div class="flex items-center gap-4 px-4 py-3">
              <!-- Info -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-0.5">
                  <p
                    class="text-sm font-medium text-foreground truncate"
                    title={task.goal || task.id}
                  >
                    {task.goal || task.id}
                  </p>
                </div>
                <div
                  class="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  {#if task.environmentName}
                    <Badge variant="outline" class="text-[10px] px-1.5 py-0">
                      {task.environmentName}
                    </Badge>
                  {/if}
                  {#if task.viberName}
                    <span>{task.viberName}</span>
                    <span class="text-muted-foreground/40">·</span>
                  {/if}
                  {#if task.archivedAt}
                    <span>Archived {formatTimeAgo(task.archivedAt)}</span>
                  {/if}
                  {#if task.createdAt}
                    <span class="text-muted-foreground/40">·</span>
                    <span>Created {formatDate(task.createdAt)}</span>
                  {/if}
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8 gap-1.5"
                  disabled={busyTaskIds.has(task.id)}
                  onclick={() => restoreTask(task.id)}
                >
                  {#if busyTaskIds.has(task.id)}
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
                  onclick={() => openDeleteDialog(task)}
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
        {archivedTasks.length} archived task{archivedTasks.length !== 1
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
        Delete task permanently?
      </Dialog.Title>
      <Dialog.Description>
        This action cannot be undone. The task and all its associated data will
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
          <LoaderCircle class="size-4 animate-spin" />
          Deleting...
        {:else}
          <Trash2 class="size-4" />
          Delete permanently
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
