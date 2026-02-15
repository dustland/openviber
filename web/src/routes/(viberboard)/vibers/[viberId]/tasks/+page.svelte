<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    CheckCircle2,
    Cpu,
    ListTodo,
    LoaderCircle,
  } from "@lucide/svelte";

  interface Task {
    id: string;
    goal: string;
    status: string;
    created_at: string | null;
    viber_id: string | null;
    viber_name: string | null;
    environment_name: string | null;
  }

  let { data } = $props();
  const viberId = $derived(data.viberId);

  let tasks = $state<Task[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function formatTimeAgo(dateStr: string | null): string {
    if (!dateStr) return "";
    const normalized = /[Z+-]/.test(dateStr.slice(-6))
      ? dateStr
      : dateStr + "Z";
    const diff = Date.now() - new Date(normalized).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function statusIcon(status: string) {
    switch (status) {
      case "running":
        return { icon: LoaderCircle, class: "text-emerald-500 animate-spin" };
      case "error":
        return { icon: AlertCircle, class: "text-red-500" };
      case "completed":
        return { icon: CheckCircle2, class: "text-blue-500" };
      default:
        return { icon: Cpu, class: "text-muted-foreground" };
    }
  }

  function statusBadgeClass(status: string) {
    switch (status) {
      case "running":
        return "bg-emerald-500/10 text-emerald-600";
      case "error":
        return "bg-red-500/10 text-red-600";
      case "completed":
        return "bg-blue-500/10 text-blue-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  async function fetchTasks() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to load tasks");
      const data = await res.json();
      const allTasks: Task[] = data.tasks ?? [];
      // Filter tasks by viber
      tasks = allTasks.filter((t) => t.viber_id === viberId);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load tasks";
      tasks = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchTasks();
  });
</script>

<div class="p-6">
  {#if error}
    <div
      class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 mb-6"
    >
      <AlertCircle class="size-5 text-destructive shrink-0" />
      <p class="text-destructive">{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-16">
      <div class="animate-pulse flex flex-col items-center gap-3">
        <ListTodo class="size-10 text-muted-foreground/50" />
        <p class="text-sm text-muted-foreground">Loading tasks…</p>
      </div>
    </div>
  {:else if tasks.length === 0}
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center"
    >
      <ListTodo class="size-12 text-muted-foreground/50 mx-auto mb-4" />
      <h2 class="text-lg font-medium text-foreground mb-2">
        No tasks for this viber
      </h2>
      <p class="text-muted-foreground text-sm max-w-md mx-auto">
        Tasks assigned to this viber will appear here.
      </p>
    </div>
  {:else}
    <div class="grid gap-3">
      {#each tasks as task (task.id)}
        {@const si = statusIcon(task.status)}
        <a
          href={`/tasks/${task.id}`}
          class="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm flex items-center gap-4 group"
        >
          <div class="shrink-0">
            <si.icon class={`size-5 ${si.class}`} />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <h3
                class="text-sm font-medium text-card-foreground truncate group-hover:text-foreground"
              >
                {task.goal || task.id}
              </h3>
              <span
                class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusBadgeClass(task.status)}`}
              >
                {task.status}
              </span>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              {#if task.environment_name}
                <span>{task.environment_name}</span>
              {/if}
              {#if task.created_at}
                <span>{formatTimeAgo(task.created_at)}</span>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>

    <p class="mt-6 text-center text-sm text-muted-foreground">
      {tasks.length} task{tasks.length === 1 ? "" : "s"}
    </p>
  {/if}
</div>
