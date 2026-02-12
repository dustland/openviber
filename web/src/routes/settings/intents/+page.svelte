<script lang="ts">
  import { onMount } from "svelte";
  import {
    ArrowLeft,
    Bug,
    ChevronDown,
    ChevronUp,
    Code2,
    Copy,
    FileText,
    HeartPulse,
    Loader2,
    Palette,
    Pencil,
    Plus,
    ShieldCheck,
    Sparkles,
    TrainFront,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { Textarea } from "$lib/components/ui/textarea";
  import type { Intent } from "$lib/data/intents";

  const ICON_OPTIONS = [
    { value: "sparkles", label: "Sparkles", component: Sparkles },
    { value: "palette", label: "Palette", component: Palette },
    { value: "code-2", label: "Code", component: Code2 },
    { value: "bug", label: "Bug", component: Bug },
    { value: "shield-check", label: "Shield", component: ShieldCheck },
    { value: "file-text", label: "Document", component: FileText },
    { value: "heart-pulse", label: "Health", component: HeartPulse },
    { value: "train-front", label: "Railway", component: TrainFront },
  ] as const;

  const INTENT_ICONS: Record<string, typeof Sparkles> = {
    palette: Palette,
    sparkles: Sparkles,
    "heart-pulse": HeartPulse,
    "shield-check": ShieldCheck,
    "file-text": FileText,
    "code-2": Code2,
    bug: Bug,
    "train-front": TrainFront,
  };

  let intents = $state<Intent[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let deleting = $state<string | null>(null);
  let error = $state<string | null>(null);

  // Form state
  let showForm = $state(false);
  let editingId = $state<string | null>(null);
  let formName = $state("");
  let formDescription = $state("");
  let formIcon = $state("sparkles");
  let formBody = $state("");
  let expandedIntentIds = $state<string[]>([]);

  const customIntents = $derived(intents.filter((i) => !i.builtin));
  const builtinIntents = $derived(intents.filter((i) => i.builtin));

  async function fetchIntents() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/intents");
      if (!res.ok) throw new Error("Failed to load intents");
      const data = await res.json();
      intents = data.intents ?? [];
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load intents";
    } finally {
      loading = false;
    }
  }

  function openNewForm() {
    editingId = null;
    formName = "";
    formDescription = "";
    formIcon = "sparkles";
    formBody = "";
    showForm = true;
  }

  function openEditForm(intent: Intent) {
    editingId = intent.id;
    formName = intent.name;
    formDescription = intent.description;
    formIcon = intent.icon;
    formBody = intent.body;
    showForm = true;
  }

  function closeForm() {
    showForm = false;
    editingId = null;
  }

  function isExpanded(intentId: string) {
    return expandedIntentIds.includes(intentId);
  }

  function toggleExpanded(intentId: string) {
    if (isExpanded(intentId)) {
      expandedIntentIds = expandedIntentIds.filter((id) => id !== intentId);
    } else {
      expandedIntentIds = [...expandedIntentIds, intentId];
    }
  }

  function replicateIntent(intent: Intent) {
    editingId = null;
    formName = `${intent.name} (Copy)`;
    formDescription = intent.description;
    formIcon = intent.icon;
    formBody = intent.body;
    showForm = true;
  }

  async function saveIntent() {
    if (!formName.trim() || !formBody.trim()) return;

    saving = true;
    error = null;
    try {
      const payload = {
        id: editingId ?? undefined,
        name: formName.trim(),
        description: formDescription.trim(),
        icon: formIcon,
        body: formBody.trim(),
      };

      const method = editingId ? "PUT" : "POST";
      const res = await fetch("/api/intents", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save intent");
      }

      closeForm();
      await fetchIntents();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save intent";
    } finally {
      saving = false;
    }
  }

  async function deleteIntent(id: string) {
    deleting = id;
    error = null;
    try {
      const res = await fetch("/api/intents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete intent");
      }
      await fetchIntents();
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to delete intent";
    } finally {
      deleting = null;
    }
  }

  onMount(() => {
    fetchIntents();
  });
</script>

<svelte:head>
  <title>Intents — Settings — OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="space-y-8">
    <!-- Header -->
    <header class="space-y-2">
      <div class="flex items-center gap-2 text-muted-foreground mb-4">
        <a
          href="/settings"
          class="inline-flex items-center gap-1 text-xs hover:text-foreground transition-colors"
        >
          <ArrowLeft class="size-3" />
          Settings
        </a>
        <span class="text-xs">/</span>
        <span class="text-xs text-foreground">Intents</span>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-foreground">Intents</h1>
          <p class="text-sm text-muted-foreground mt-1">
            Manage intent templates used on the New Viber page. Intents are
            simple descriptions of what a viber should do — the node picks the
            right skills automatically.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110"
          onclick={openNewForm}
        >
          <Plus class="size-4" />
          New intent
        </button>
      </div>
    </header>

    {#if error}
      <div
        class="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {error}
      </div>
    {/if}

    <!-- Create / Edit form -->
    {#if showForm}
      <div class="rounded-xl border border-primary/30 bg-card p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-foreground">
            {editingId ? "Edit intent" : "New intent"}
          </h2>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors"
            onclick={closeForm}
            aria-label="Close form"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label
              for="intent-name"
              class="text-xs font-medium text-muted-foreground">Name</label
            >
            <input
              id="intent-name"
              type="text"
              bind:value={formName}
              placeholder="e.g. Beautify Homepage"
              class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div class="space-y-1.5">
            <label
              for="intent-desc"
              class="text-xs font-medium text-muted-foreground"
              >Description (short)</label
            >
            <input
              id="intent-desc"
              type="text"
              bind:value={formDescription}
              placeholder="One-liner shown on card"
              class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <span class="text-xs font-medium text-muted-foreground">Icon</span>
          <div class="flex flex-wrap gap-2">
            {#each ICON_OPTIONS as opt}
              <button
                type="button"
                class="inline-flex size-9 items-center justify-center rounded-lg border transition-colors {formIcon ===
                opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/30'}"
                onclick={() => (formIcon = opt.value)}
                title={opt.label}
              >
                <opt.component class="size-4" />
              </button>
            {/each}
          </div>
        </div>

        <div class="space-y-1.5">
          <label
            for="intent-body"
            class="text-xs font-medium text-muted-foreground"
            >Body (markdown)</label
          >
          <p class="text-[11px] text-muted-foreground">
            Describe what the viber should do. Write in natural language — the
            node will match skills automatically. You can also declare required
            skills explicitly with a line like:
            <code class="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]"
              >Required skills: cursor-agent, github</code
            >
          </p>
          <Textarea
            id="intent-body"
            bind:value={formBody}
            rows={8}
            placeholder="Review and polish the homepage of the target repository.

- Improve layout, typography, and spacing
- Use the repo's existing framework
- Keep changes scoped and safe"
            class="resize-y min-h-[160px] font-mono text-xs"
          />
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            class="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
            onclick={closeForm}
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110 disabled:opacity-50"
            disabled={saving || !formName.trim() || !formBody.trim()}
            onclick={saveIntent}
          >
            {#if saving}
              <Loader2 class="size-4 animate-spin" />
            {/if}
            {editingId ? "Save changes" : "Create intent"}
          </button>
        </div>
      </div>
    {/if}

    <!-- Custom intents -->
    <section class="space-y-3">
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Your intents ({customIntents.length})
      </h2>

      {#if loading}
        <div
          class="flex items-center justify-center py-10 text-sm text-muted-foreground"
        >
          <Loader2 class="size-4 animate-spin" />
          Loading...
        </div>
      {:else if customIntents.length === 0}
        <div
          class="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No custom intents yet. Click "New intent" to create one.
        </div>
      {:else}
        <div class="space-y-2">
          {#each customIntents as intent (intent.id)}
            {@const IconComponent = INTENT_ICONS[intent.icon] ?? Sparkles}
            <div
              class="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/20"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-3 min-w-0">
                  <div
                    class="size-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0"
                  >
                    <IconComponent class="size-4" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {intent.name}
                    </p>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {intent.description}
                    </p>
                    {#if isExpanded(intent.id)}
                      <pre
                        class="text-xs text-muted-foreground/80 mt-2 whitespace-pre-wrap wrap-break-word font-mono">{intent.body}</pre>
                    {:else}
                      <p
                        class="text-xs text-muted-foreground/70 mt-2 line-clamp-2 font-mono"
                      >
                        {intent.body.slice(0, 120)}{intent.body.length > 120
                          ? "..."
                          : ""}
                      </p>
                    {/if}
                    <div class="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        onclick={() => toggleExpanded(intent.id)}
                      >
                        {#if isExpanded(intent.id)}
                          <ChevronUp class="size-3.5" />
                          Collapse
                        {:else}
                          <ChevronDown class="size-3.5" />
                          Expand
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        onclick={() => replicateIntent(intent)}
                      >
                        <Copy class="size-3.5" />
                        Replicate
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <button
                    type="button"
                    class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Edit"
                    onclick={() => openEditForm(intent)}
                  >
                    <Pencil class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    class="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                    disabled={deleting === intent.id}
                    onclick={() => deleteIntent(intent.id)}
                  >
                    {#if deleting === intent.id}
                      <Loader2 class="size-3.5 animate-spin" />
                    {:else}
                      <Trash2 class="size-3.5" />
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Built-in intents (read-only) -->
    <section class="space-y-3">
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Built-in intents ({builtinIntents.length})
      </h2>
      <p class="text-xs text-muted-foreground">
        These ship with OpenViber and cannot be edited. They appear alongside
        your custom intents on the New Viber page.
      </p>

      {#if !loading}
        <div class="space-y-2">
          {#each builtinIntents as intent (intent.id)}
            {@const IconComponent = INTENT_ICONS[intent.icon] ?? Sparkles}
            <div
              class="rounded-xl border border-border/60 bg-card/50 p-4 opacity-80"
            >
              <div class="flex items-start gap-3">
                <div
                  class="size-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground shrink-0"
                >
                  <IconComponent class="size-4" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-foreground">
                      {intent.name}
                    </p>
                    <span
                      class="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      built-in
                    </span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    {intent.description}
                  </p>
                  {#if isExpanded(intent.id)}
                    <pre
                      class="text-xs text-muted-foreground/80 mt-2 whitespace-pre-wrap wrap-break-word font-mono">{intent.body}</pre>
                  {:else}
                    <p
                      class="text-xs text-muted-foreground/70 mt-2 line-clamp-2 font-mono"
                    >
                      {intent.body.slice(0, 120)}{intent.body.length > 120
                        ? "..."
                        : ""}
                    </p>
                  {/if}
                  <div class="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onclick={() => toggleExpanded(intent.id)}
                    >
                      {#if isExpanded(intent.id)}
                        <ChevronUp class="size-3.5" />
                        Collapse
                      {:else}
                        <ChevronDown class="size-3.5" />
                        Expand
                      {/if}
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      onclick={() => replicateIntent(intent)}
                    >
                      <Copy class="size-3.5" />
                      Replicate as user intent
                    </button>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
