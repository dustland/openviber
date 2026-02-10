<script lang="ts">
  import { onMount } from "svelte";
  import {
    BookOpen,
    Brain,
    Check,
    Heart,
    Loader2,
    Save,
    User,
  } from "@lucide/svelte";
  import { Textarea } from "$lib/components/ui/textarea";

  interface Tab {
    id: "soul" | "user" | "memory";
    label: string;
    icon: typeof Heart;
    description: string;
    placeholder: string;
  }

  const TABS: Tab[] = [
    {
      id: "soul",
      label: "Soul",
      icon: Heart,
      description:
        "How your viber thinks and communicates — personality, tone, operational boundaries, negative constraints.",
      placeholder: `# Soul

## Communication Style

- Be direct and concise. Skip preambles.
- Lead with the answer, then explain if needed.
- When uncertain, say so explicitly.

## Behavior

- Push back on requests when there's a better approach.
- Ask clarifying questions before starting complex tasks.

## Operational Boundaries

- Require explicit confirmation for destructive actions.
- Always confirm before affecting external systems.

## What I Value

- Correctness over speed
- Explicit over implicit
- Working code over theoretical discussion`,
    },
    {
      id: "user",
      label: "User",
      icon: User,
      description:
        "Who the viber is working for — your projects, team, preferences, current priorities.",
      placeholder: `# User Context

## Identity

- Name: Your Name
- Role: Your role
- Timezone: Your/Timezone

## Current Focus

- Primary project: What you're building
- Goal this quarter: What you're aiming for

## Technical Preferences

- Language: TypeScript
- Package manager: pnpm
- Framework: SvelteKit

## Current Priorities (update weekly)

1. First priority
2. Second priority
3. Third priority`,
    },
    {
      id: "memory",
      label: "Memory",
      icon: Brain,
      description:
        "What persists across sessions — decisions, learned patterns, corrections, preferences discovered over time.",
      placeholder: `# Memory

## Decisions

- (Decisions that affect future work)

## Patterns

- (Recurring patterns the viber should remember)

## Corrections

- (Mistakes to avoid repeating)

## Preferences Learned

- (Preferences discovered through interaction)`,
    },
  ];

  let activeTab = $state<"soul" | "user" | "memory">("soul");
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // The stored values (last saved)
  let stored = $state({ soul: "", user: "", memory: "" });
  // The edit values (current textarea contents)
  let draft = $state({ soul: "", user: "", memory: "" });

  const hasChanges = $derived(
    draft.soul !== stored.soul ||
      draft.user !== stored.user ||
      draft.memory !== stored.memory,
  );

  const activeTabMeta = $derived(TABS.find((t) => t.id === activeTab)!);

  const charCount = $derived(draft[activeTab].length);

  async function fetchPersonalization() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/personalization");
      if (!res.ok) throw new Error("Failed to load personalization");
      const data = await res.json();
      stored = {
        soul: data.soul ?? "",
        user: data.user ?? "",
        memory: data.memory ?? "",
      };
      draft = { ...stored };
    } catch (err) {
      error =
        err instanceof Error ? err.message : "Failed to load personalization";
    } finally {
      loading = false;
    }
  }

  async function save() {
    saving = true;
    error = null;
    successMessage = null;
    try {
      const res = await fetch("/api/personalization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soul: draft.soul,
          user: draft.user,
          memory: draft.memory,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      stored = { ...draft };
      successMessage = "Personalization saved";
      setTimeout(() => (successMessage = null), 3000);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save";
    } finally {
      saving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (hasChanges && !saving) void save();
    }
  }

  onMount(() => {
    fetchPersonalization();
  });
</script>

<svelte:head>
  <title>Personalization — Settings — OpenViber</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex-1 min-h-0 flex flex-col overflow-hidden" onkeydown={handleKeydown}>
  <!-- Header -->
  <div class="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur px-6 py-5">
    <div>
      <div class="flex items-center gap-3">
          <div
            class="flex items-center justify-center size-10 rounded-lg bg-primary/10"
          >
            <BookOpen class="size-5 text-primary" />
          </div>
          <div>
            <h1 class="text-2xl font-semibold text-foreground">
              Personalization
            </h1>
            <p class="text-sm text-muted-foreground">
              The agent's autobiography — define how it thinks, who it serves,
              and what it remembers.
            </p>
          </div>
        </div>

      {#if error}
        <div
          class="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error}
        </div>
      {/if}

      {#if successMessage}
        <div
          class="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"
        >
          <Check class="size-4" />
          {successMessage}
        </div>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <Loader2 class="size-8 text-muted-foreground/50 animate-spin" />
        <p class="text-sm text-muted-foreground">Loading personalization...</p>
      </div>
    </div>
  {:else}
    <!-- Tabs + Editor -->
    <div class="flex-1 min-h-0 flex flex-col">
      <!-- Tab bar -->
      <div
        class="shrink-0 border-b border-border/50 bg-muted/20 px-6"
      >
        <div class="flex items-center gap-1 -mb-px">
          {#each TABS as tab (tab.id)}
            {@const Icon = tab.icon}
            {@const isActive = activeTab === tab.id}
            {@const isDirty = draft[tab.id] !== stored[tab.id]}
            <button
              type="button"
              onclick={() => (activeTab = tab.id)}
              class="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors {isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
            >
              <Icon class="size-4" />
              {tab.label}
              {#if isDirty}
                <span
                  class="size-1.5 rounded-full bg-amber-500"
                  title="Unsaved changes"
                ></span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Editor area -->
      <div class="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <div class="space-y-4">
          <!-- Tab description -->
          <div class="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-4">
            <activeTabMeta.icon class="size-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 class="text-sm font-semibold text-foreground">
                {activeTabMeta.label}.md
              </h2>
              <p class="text-xs text-muted-foreground mt-0.5">
                {activeTabMeta.description}
              </p>
            </div>
          </div>

          <!-- Markdown editor -->
          <div class="relative">
            <Textarea
              bind:value={draft[activeTab]}
              rows={20}
              placeholder={activeTabMeta.placeholder}
              class="resize-y min-h-[400px] font-mono text-sm leading-relaxed"
            />
            <div
              class="absolute bottom-3 right-3 text-[10px] text-muted-foreground/50 pointer-events-none"
            >
              {charCount} chars
              {#if hasChanges}
                · unsaved
              {/if}
            </div>
          </div>

          <!-- Tips -->
          <div class="text-xs text-muted-foreground space-y-1.5 pb-6">
            <p class="font-medium text-foreground/70">Tips</p>
            {#if activeTab === "soul"}
              <p>
                Start with what annoys you about AI responses. Negative
                constraints ("never do X") eliminate friction faster than
                positive instructions.
              </p>
              <p>
                This is per-viber in the node filesystem
                (<code class="rounded bg-muted px-1 py-0.5 text-[10px]"
                  >~/.openviber/vibers/&lbrace;id&rbrace;/soul.md</code
                >). What you write here becomes the default for new vibers.
              </p>
            {:else if activeTab === "user"}
              <p>
                The deeper your context, the better the output. Add current
                projects, team members, technical preferences, and weekly
                priorities.
              </p>
              <p>
                This file is shared across all vibers — you're the same person
                regardless of which agent you talk to. Update priorities weekly
                for best results.
              </p>
            {:else}
              <p>
                Let this grow organically. Say "remember this" during
                conversations, or add entries manually after significant
                decisions.
              </p>
              <p>
                Review weekly and prune stale items. Each viber also has its own
                memory on the node — this is the global default.
              </p>
            {/if}
            <p class="text-muted-foreground/60">
              Press <kbd
                class="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono"
                >Cmd+S</kbd
              > to save.
            </p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Floating save bar -->
  {#if hasChanges}
    <div
      class="shrink-0 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 px-6 py-3 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2 duration-200"
    >
      <p class="text-sm text-muted-foreground">Unsaved changes</p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={() => { draft = { ...stored }; }}
          disabled={saving}
          class="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onclick={save}
          disabled={saving}
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
        >
          {#if saving}
            <Loader2 class="size-4 animate-spin" />
            Saving…
          {:else}
            <Save class="size-4" />
            Save
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>
