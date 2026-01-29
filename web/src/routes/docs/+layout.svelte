<script lang="ts">
  import { page } from "$app/stores";
  import { ChevronRight } from "lucide-svelte";

  let { children } = $props();

  // Get page title from navigation based on current path
  function getPageTitle(pathname: string): string {
    for (const section of navigation) {
      for (const item of section.items) {
        if (item.href === pathname) {
          return item.title;
        }
      }
    }
    return "Documentation";
  }

  const navigation = [
    {
      title: "Getting Started",
      items: [
        { title: "Installation", href: "/docs/getting-started/installation" },
        { title: "Quick Start", href: "/docs/getting-started/quick-start" },
      ],
    },
    {
      title: "Guides",
      items: [
        { title: "Agents", href: "/docs/guides/agents" },
        { title: "Spaces", href: "/docs/guides/spaces" },
        { title: "Tools", href: "/docs/guides/tools" },
        { title: "State", href: "/docs/guides/state" },
        { title: "Streaming", href: "/docs/guides/streaming" },
      ],
    },
    {
      title: "Tutorials",
      items: [
        { title: "Overview", href: "/docs/tutorials/index" },
        { title: "1. First Agent", href: "/docs/tutorials/1-first-agent" },
        { title: "2. Multi-Agent", href: "/docs/tutorials/2-multi-agent" },
        { title: "3. Custom Tools", href: "/docs/tutorials/3-custom-tools" },
        { title: "4. Configuration", href: "/docs/tutorials/4-configuration" },
        {
          title: "Comprehensive Systems",
          href: "/docs/tutorials/91-comprehensive-systems",
        },
      ],
    },
    {
      title: "Design",
      items: [
        { title: "Architecture", href: "/docs/design/arch" },
        { title: "Philosophy", href: "/docs/design/philosophy" },
        { title: "Viber Daemon", href: "/docs/design/viber-daemon" },
        { title: "Viber vs Clawdbot", href: "/docs/design/viber-vs-clawdbot" },
        { title: "Channels", href: "/docs/design/channels" },
        { title: "Skills", href: "/docs/design/skills" },
        { title: "Task Lifecycle", href: "/docs/design/task-lifecycle" },
        { title: "Tool Execution", href: "/docs/design/tool-execution" },
        { title: "Memory", href: "/docs/design/memory" },
        { title: "Message Parts", href: "/docs/design/message-parts" },
        { title: "Desktop Tools", href: "/docs/design/desktop-tools" },
        { title: "Communication", href: "/docs/design/communication" },
        { title: "Package Structure", href: "/docs/design/package-structure" },
        { title: "Security", href: "/docs/design/security" },
      ],
    },
    {
      title: "API Reference",
      items: [
        { title: "API Overview", href: "/docs/api" },
        { title: "Types", href: "/docs/api/types" },
      ],
    },
    {
      title: "Reference",
      items: [{ title: "Glossary", href: "/docs/reference/glossary" }],
    },
  ];
</script>

<svelte:head>
  <title>{getPageTitle($page.url.pathname)} - Viber Docs</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
  <div class="flex gap-8">
    <!-- Sidebar -->
    <aside class="w-64 shrink-0 hidden lg:block">
      <nav class="sticky top-24 space-y-6">
        {#each navigation as section}
          <div>
            <h3
              class="font-semibold mb-2"
              style="color: hsl(var(--foreground));"
            >
              {section.title}
            </h3>
            <ul class="space-y-1">
              {#each section.items as item}
                <li>
                  <a
                    href={item.href}
                    class="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors {$page
                      .url.pathname === item.href
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
                    style={$page.url.pathname === item.href
                      ? "background: hsl(var(--primary) / 0.1); color: hsl(var(--primary));"
                      : "color: hsl(var(--muted-foreground));"}
                  >
                    <ChevronRight class="w-3 h-3" />
                    {item.title}
                  </a>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex-1 min-w-0 max-w-3xl">
      <article class="prose prose-slate dark:prose-invert max-w-none">
        {@render children()}
      </article>
    </main>
  </div>
</div>

<style>
  :global(.prose) {
    color: hsl(var(--foreground));
  }
  :global(.prose h1) {
    color: hsl(var(--foreground));
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }
  :global(.prose h2) {
    color: hsl(var(--foreground));
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 2rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid hsl(var(--border));
  }
  :global(.prose h3) {
    color: hsl(var(--foreground));
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
  }
  :global(.prose p) {
    margin-bottom: 1rem;
    line-height: 1.75;
  }
  :global(.prose code) {
    background: hsl(var(--muted));
    padding: 0.2em 0.4em;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
  :global(.prose pre) {
    background: hsl(var(--muted));
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 1rem 0;
  }
  :global(.prose pre code) {
    background: none;
    padding: 0;
  }
  :global(.prose a) {
    color: hsl(var(--primary));
    text-decoration: underline;
  }
  :global(.prose ul) {
    list-style-type: disc;
    padding-left: 1.5rem;
    margin-bottom: 1rem;
  }
  :global(.prose ol) {
    list-style-type: decimal;
    padding-left: 1.5rem;
    margin-bottom: 1rem;
  }
  :global(.prose li) {
    margin-bottom: 0.5rem;
  }
  :global(.prose blockquote) {
    border-left: 4px solid hsl(var(--border));
    padding-left: 1rem;
    font-style: italic;
    color: hsl(var(--muted-foreground));
  }
</style>
