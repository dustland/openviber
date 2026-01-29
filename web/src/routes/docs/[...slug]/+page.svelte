<script lang="ts">
  import { marked } from "marked";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Convert ::: type ... ::: to placeholders, run marked, then restore as styled divs
  function renderMarkdown(content: string): string {
    const asideRegex = /:::(\w+)\n([\s\S]*?)\n:::/g;
    const placeholders: string[] = [];
    let i = 0;
    const withPlaceholders = content.replace(asideRegex, (_, type, body) => {
      const key = `__ASIDE_${i++}__`;
      const inner = marked.parse(body.trim()) as string;
      placeholders.push(
        `<div class="aside aside-${type}"><strong>${type.charAt(0).toUpperCase() + type.slice(1)}</strong><div class="aside-body">${inner}</div></div>`,
      );
      return key;
    });
    let html = marked.parse(withPlaceholders) as string;
    placeholders.forEach((p, j) => {
      html = html.replace(`__ASIDE_${j}__`, p);
    });
    return html;
  }

  const html = $derived(renderMarkdown(data.content));
</script>

<svelte:head>
  <title>{data.title ?? "Documentation"} - Viber Docs</title>
  {#if data.description}
    <meta name="description" content={data.description} />
  {/if}
</svelte:head>

{#if data.title}
  <h1>{data.title}</h1>
{/if}
{@html html}

<style>
  :global(.aside) {
    margin: 1rem 0;
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    border-left: 4px solid hsl(var(--border));
  }
  :global(.aside-tip) {
    background: hsl(var(--primary) / 0.08);
    border-left-color: hsl(var(--primary));
  }
  :global(.aside-note) {
    background: hsl(var(--muted));
    border-left-color: hsl(var(--muted-foreground));
  }
  :global(.aside-caution) {
    background: hsl(var(--destructive) / 0.08);
    border-left-color: hsl(var(--destructive));
  }
  :global(.aside-body) {
    margin-top: 0.5rem;
  }
  :global(.aside-body :first-child) {
    margin-top: 0;
  }
</style>
