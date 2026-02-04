<script lang="ts">
  import type { PageData } from "./$types";
  import type { SvelteComponent } from "svelte";

  let { data }: { data: PageData } = $props();

  type DocModule = {
    default: typeof SvelteComponent;
    metadata?: Record<string, unknown>;
  };

  // mdsvex-compiled docs (eager so SSR can find them)
  const docModules = import.meta.glob("$docs/**/*.md", {
    eager: true,
  }) as Record<string, DocModule>;

  // Derive so client-side navigation updates content and head tags
  const docModule = $derived(docModules[data.key]);
  const Doc = $derived(docModule?.default);
  const metadata = $derived(docModule?.metadata ?? data.metadata ?? {});
</script>

<svelte:head>
  <title>{(metadata.title as string) ?? "Documentation"} - Viber Docs</title>
  {#if metadata.description}
    <meta name="description" content={metadata.description as string} />
  {/if}
</svelte:head>

{#key data.key}
  {#if Doc}
    <Doc />
  {:else}
    <p class="text-red-600">Document not found.</p>
  {/if}
{/key}

<style>
  :global(.aside) {
    margin: 1rem 0;
    padding: 0.95rem 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--muted) / 0.35);
    box-shadow: 0 1px 8px -6px hsl(var(--foreground) / 0.8);
  }

  :global(.aside > p:first-child) {
    margin: 0 0 0.45rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: hsl(var(--foreground));
  }

  :global(.aside-tip) {
    background: hsl(var(--primary) / 0.09);
    box-shadow:
      inset 0.22rem 0 0 hsl(var(--primary) / 0.45),
      0 1px 8px -6px hsl(var(--foreground) / 0.8);
  }
  :global(.aside-note) {
    background: hsl(var(--muted));
    box-shadow:
      inset 0.22rem 0 0 hsl(var(--muted-foreground) / 0.45),
      0 1px 8px -6px hsl(var(--foreground) / 0.8);
  }
  :global(.aside-caution) {
    background: hsl(var(--destructive) / 0.08);
    box-shadow:
      inset 0.22rem 0 0 hsl(var(--destructive) / 0.45),
      0 1px 8px -6px hsl(var(--foreground) / 0.8);
  }
  :global(.aside-danger) {
    background: hsl(var(--destructive) / 0.1);
    box-shadow:
      inset 0.22rem 0 0 hsl(var(--destructive) / 0.55),
      0 1px 8px -6px hsl(var(--foreground) / 0.8);
  }
  :global(.aside p:last-child) {
    margin-bottom: 0;
  }
</style>
