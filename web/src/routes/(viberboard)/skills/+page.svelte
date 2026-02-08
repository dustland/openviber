<script lang="ts">
  import { onMount } from "svelte";
  import { Puzzle, Server, FileText, AlertCircle } from "@lucide/svelte";

  interface SkillInfo {
    id: string;
    name: string;
    description: string;
    usedByNodes: { id: string; name: string }[];
  }

  let skills = $state<SkillInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function fetchSkills() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load skills");
      }
      const data = await res.json();
      skills = data.skills ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load skills";
      skills = [];
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchSkills();
  });
</script>

<svelte:head>
  <title>Skills - OpenViber</title>
</svelte:head>

<div class="p-6 h-full overflow-y-auto">
  <div class="max-w-4xl mx-auto">
    <header class="mb-8">
      <h1 class="text-3xl font-bold text-foreground mb-2">Skills</h1>
      <p class="text-muted-foreground">
        Skills extend vibers with domain knowledge and tools. Listed below are
        all skills available on connected nodes and where they are installed.
      </p>
    </header>

    {#if error}
      <div
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3"
      >
        <AlertCircle class="size-5 text-destructive shrink-0" />
        <p class="text-destructive">{error}</p>
      </div>
    {:else if loading}
      <div class="flex items-center justify-center py-16">
        <div class="animate-pulse flex flex-col items-center gap-3">
          <Puzzle class="size-10 text-muted-foreground/50" />
          <p class="text-sm text-muted-foreground">Loading skills…</p>
        </div>
      </div>
    {:else if skills.length === 0}
      <div
        class="rounded-xl border border-dashed border-border p-12 text-center"
      >
        <Puzzle class="size-12 text-muted-foreground/50 mx-auto mb-4" />
        <h2 class="text-lg font-medium text-foreground mb-2">
          No skills found
        </h2>
        <p class="text-muted-foreground text-sm max-w-md mx-auto mb-6">
          Connect a node (run <code class="rounded bg-muted px-1.5 py-0.5 text-xs">openviber start</code>) so that its installed skills appear here. Skills are loaded from the node’s skill registry.
        </p>
        <a
          href="/docs/concepts/skills"
          class="inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <FileText class="size-4" />
          Learn about Skills
        </a>
      </div>
    {:else}
      <div class="grid gap-4">
        {#each skills as skill}
          <div
            class="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <h2 class="text-lg font-semibold text-card-foreground mb-1">
                  {skill.name}
                </h2>
                {#if skill.description}
                  <p class="text-sm text-muted-foreground mb-3">
                    {skill.description}
                  </p>
                {/if}
                {#if skill.usedByNodes.length > 0}
                  <div class="flex flex-wrap items-center gap-2 text-sm">
                    <Server class="size-4 text-muted-foreground shrink-0" />
                    <span class="text-muted-foreground">Installed on:</span>
                    {#each skill.usedByNodes as node}
                      <span
                        class="inline-flex items-center rounded-md bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {node.name}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="shrink-0">
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  <Puzzle class="size-3.5" />
                  {skill.usedByNodes.length === 0
                    ? "Available"
                    : skill.usedByNodes.length === 1
                      ? "1 node"
                      : `${skill.usedByNodes.length} nodes`}
                </span>
              </div>
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-6 text-center text-sm text-muted-foreground">
        {skills.length} skill{skills.length === 1 ? "" : "s"} available
      </p>
    {/if}
  </div>
</div>
