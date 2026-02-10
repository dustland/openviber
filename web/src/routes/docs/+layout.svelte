<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount, tick } from "svelte";
  import {
    ArrowLeft,
    ArrowRight,
    Hash,
    Link,
    Pencil,
    Search,
    ChevronDown,
    FileText,
  } from "@lucide/svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";

  let { children } = $props();

  interface NavItem {
    title: string;
    href: string;
  }

  interface NavSection {
    title: string;
    items: NavItem[];
  }

  interface FlatNavItem extends NavItem {
    section: string;
  }

  interface TocHeading {
    id: string;
    text: string;
    level: 2 | 3;
  }

  const navigation: NavSection[] = [
    {
      title: "Overview",
      items: [{ title: "Introduction", href: "/docs/introduction" }],
    },
    {
      title: "Getting Started",
      items: [
        { title: "Onboarding", href: "/docs/getting-started/onboarding" },
        { title: "Quick Start", href: "/docs/getting-started/quick-start" },
      ],
    },
    {
      title: "Concepts",
      items: [
        { title: "Viber", href: "/docs/concepts/viber" },
        { title: "Jobs", href: "/docs/concepts/jobs" },
        { title: "Skills", href: "/docs/concepts/skills" },
        { title: "Tools", href: "/docs/concepts/tools" },
        { title: "Memory", href: "/docs/concepts/memory" },
      ],
    },
    {
      title: "Design",
      items: [
        { title: "Viber Runtime", href: "/docs/design/viber" },
        { title: "Protocol", href: "/docs/design/protocol" },
        {
          title: "Environments and Threads",
          href: "/docs/design/environments-and-threads",
        },
        { title: "Task Lifecycle", href: "/docs/design/task-lifecycle" },
        { title: "Communication", href: "/docs/design/communication" },
        { title: "Context Management", href: "/docs/design/context-management" },
        { title: "Memory", href: "/docs/design/memory" },
        { title: "Personalization", href: "/docs/design/personalization" },
        { title: "Streaming", href: "/docs/design/streaming" },
        { title: "Security", href: "/docs/design/security" },
        { title: "Error Handling", href: "/docs/design/error-handling" },
        { title: "MCP Integration", href: "/docs/design/mcp-integration" },
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
      title: "Guides",
      items: [{ title: "Local LLM Setup", href: "/docs/guides/local-llm" }],
    },
    {
      title: "Reference",
      items: [
        { title: "Glossary", href: "/docs/reference/glossary" },
        { title: "Config Schema", href: "/docs/reference/config-schema" },
      ],
    },
  ];

  const allItems: FlatNavItem[] = navigation.flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.title })),
  );

  let navQuery = $state("");
  let contentScrollEl = $state<HTMLElement | null>(null);
  let articleEl = $state<HTMLElement | null>(null);
  let headings = $state<TocHeading[]>([]);
  let activeHeadingId = $state("");
  let linkCopied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;
  let headingObserver: IntersectionObserver | null = null;
  let mermaidApi: {
    initialize: (config: Record<string, unknown>) => void;
    run: (options: { nodes: Element[] }) => Promise<void>;
  } | null = null;
  const mermaidModuleUrl =
    "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

  function normalizePath(pathname: string): string {
    if (pathname.length > 1 && pathname.endsWith("/")) {
      return pathname.slice(0, -1);
    }
    return pathname;
  }

  function toTitleCase(segment: string): string {
    return segment
      .split("-")
      .filter(Boolean)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(" ");
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[`~!@#$%^&*()+=,./?<>\\[\\]{}|:;\"']/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  const currentPath = $derived(normalizePath($page.url.pathname));
  const activeIndex = $derived(
    allItems.findIndex((item) => normalizePath(item.href) === currentPath),
  );
  const activeItem = $derived(activeIndex >= 0 ? allItems[activeIndex] : null);
  const previousItem = $derived(
    activeIndex > 0 ? allItems[activeIndex - 1] : null,
  );
  const nextItem = $derived(
    activeIndex >= 0 && activeIndex < allItems.length - 1
      ? allItems[activeIndex + 1]
      : null,
  );
  const mobileTitle = $derived.by(() => {
    if (activeItem) {
      return `${activeItem.section} / ${activeItem.title}`;
    }
    const slug = currentPath.replace(/^\/docs\/?/, "");
    if (!slug) return "Documentation";
    return slug.split("/").map(toTitleCase).join(" / ");
  });

  const editUrl = $derived.by(() => getEditUrl(currentPath));

  const filteredNavigation = $derived.by(() => {
    const query = navQuery.trim().toLowerCase();
    if (!query) return navigation;

    return navigation
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const haystack =
            `${section.title} ${item.title} ${item.href}`.toLowerCase();
          return haystack.includes(query);
        }),
      }))
      .filter((section) => section.items.length > 0);
  });

  function collectHeadings(): void {
    if (!articleEl) {
      headings = [];
      activeHeadingId = "";
      return;
    }

    const seen = new Set<string>();
    const nodes = Array.from(articleEl.querySelectorAll("h2, h3"));
    const nextHeadings: TocHeading[] = [];

    for (const node of nodes) {
      const text = node.textContent?.trim();
      if (!text) continue;

      const baseId =
        node.id || slugify(text) || `section-${nextHeadings.length + 1}`;
      let id = baseId;
      let count = 2;
      while (!id || seen.has(id)) {
        id = `${baseId}-${count++}`;
      }
      seen.add(id);
      node.id = id;

      nextHeadings.push({
        id,
        text,
        level: node.tagName === "H2" ? 2 : 3,
      });
    }

    headings = nextHeadings;
    activeHeadingId = nextHeadings[0]?.id ?? "";
  }

  function observeHeadings(): void {
    headingObserver?.disconnect();
    headingObserver = null;

    if (!headings.length || typeof IntersectionObserver === "undefined") {
      return;
    }

    const nodes = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((node): node is HTMLElement => Boolean(node));

    if (!nodes.length) return;

    headingObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          activeHeadingId = visible[0].target.id;
        }
      },
      {
        root: contentScrollEl,
        rootMargin: "-12% 0px -72% 0px",
        threshold: [0, 1],
      },
    );

    for (const node of nodes) {
      headingObserver.observe(node);
    }
  }

  async function refreshDocChrome(): Promise<void> {
    await tick();
    await renderMermaid();
    collectHeadings();
    addHeadingAnchors();
    enhanceCodeBlocks();
    observeHeadings();
  }

  function scrollToHeading(event: MouseEvent, id: string): void {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target || !contentScrollEl) return;

    const offset = 12;
    const top =
      target.getBoundingClientRect().top -
      contentScrollEl.getBoundingClientRect().top +
      contentScrollEl.scrollTop -
      offset;

    contentScrollEl.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    activeHeadingId = id;
    history.replaceState(null, "", `#${id}`);
  }

  function getPageTitle(pathname: string): string {
    const match = allItems.find(
      (item) => normalizePath(item.href) === normalizePath(pathname),
    );
    if (match) return `${match.title} - ${match.section}`;
    return "Documentation";
  }

  function getEditUrl(pathname: string): string | null {
    const slug = normalizePath(pathname).replace(/^\/docs\/?/, "");
    if (!slug) return null;
    return `https://github.com/dustland/viber/edit/main/docs/${slug}.md`;
  }

  async function copyPageLink(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      linkCopied = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        linkCopied = false;
      }, 1800);
    } catch {
      linkCopied = false;
    }
  }

  async function loadMermaid() {
    if (typeof window === "undefined") return null;
    if (mermaidApi) return mermaidApi;

    try {
      const module = await import(/* @vite-ignore */ mermaidModuleUrl);
      const api = module.default;
      api.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: document.documentElement.classList.contains("dark")
          ? "dark"
          : "default",
      });
      mermaidApi = api;
      return mermaidApi;
    } catch {
      return null;
    }
  }

  async function renderMermaid(): Promise<void> {
    const blocks = Array.from(
      document.querySelectorAll(".docs-prose .mermaid"),
    ) as HTMLElement[];
    if (blocks.length === 0) return;

    const api = await loadMermaid();
    if (!api) return;

    blocks.forEach((block, index) => {
      if (!block.id) {
        block.id = `mermaid-${currentPath.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`;
      }
      block.removeAttribute("data-processed");
    });

    try {
      await api.run({ nodes: blocks });
    } catch {
      // Keep source content visible if Mermaid render fails
    }
  }

  function addHeadingAnchors(): void {
    if (!articleEl) return;
    const nodes = Array.from(articleEl.querySelectorAll("h2, h3"));
    nodes.forEach((node) => {
      if (!node.id) return;
      if (node.querySelector(".docs-heading-anchor")) return;
      const anchor = document.createElement("a");
      anchor.className = "docs-heading-anchor";
      anchor.href = `#${node.id}`;
      anchor.setAttribute("aria-label", "Link to this section");
      anchor.textContent = "#";
      node.appendChild(anchor);
    });
  }

  function enhanceCodeBlocks(): void {
    if (!articleEl) return;
    const blocks = Array.from(articleEl.querySelectorAll("pre"));
    blocks.forEach((block) => {
      if (block.querySelector(".docs-code-copy")) return;
      const code = block.querySelector("code");
      const button = document.createElement("button");
      const label = document.createElement("span");
      button.type = "button";
      button.className = "docs-code-copy";
      label.textContent = "Copy";
      button.appendChild(label);

      button.addEventListener("click", async () => {
        const value = code?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(value);
          button.setAttribute("data-copied", "true");
          label.textContent = "Copied";
          setTimeout(() => {
            button.removeAttribute("data-copied");
            label.textContent = "Copy";
          }, 1600);
        } catch {
          button.setAttribute("data-copied", "false");
          label.textContent = "Failed";
          setTimeout(() => {
            button.removeAttribute("data-copied");
            label.textContent = "Copy";
          }, 1600);
        }
      });

      block.classList.add("docs-code-block");
      block.appendChild(button);
    });
  }

  onMount(() => {
    void refreshDocChrome();
    return () => {
      headingObserver?.disconnect();
      if (copyTimeout) clearTimeout(copyTimeout);
    };
  });

  $effect(() => {
    currentPath;
    void refreshDocChrome();
  });
</script>

<svelte:head>
  <title>{getPageTitle(currentPath)} - Viber Docs</title>
</svelte:head>

<div class="docs-layout">
  <aside class="docs-sidebar">
    <div class="docs-sidebar-inner">
      <label class="docs-search">
        <Search class="docs-search-icon size-4" />
        <input
          type="search"
          placeholder="Search docs..."
          bind:value={navQuery}
          aria-label="Search documentation pages"
        />
        <span class="docs-search-shortcut" aria-hidden="true">⌘K</span>
      </label>

      <nav class="docs-nav" aria-label="Documentation navigation">
        {#if filteredNavigation.length === 0}
          <p class="docs-empty">No pages found for "{navQuery}".</p>
        {:else}
          {#each filteredNavigation as section}
            <section class="docs-nav-section">
              <h2>{section.title}</h2>
              <ul>
                {#each section.items as item}
                  {@const isActive = normalizePath(item.href) === currentPath}
                  <li>
                    <a href={item.href} class:active={isActive}>{item.title}</a>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        {/if}
      </nav>
    </div>
  </aside>

  <main class="docs-main">
    <div class="docs-mobile-nav lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          class="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground inline-flex items-center gap-2 hover:bg-accent transition-colors"
        >
          <FileText class="size-4 shrink-0 text-muted-foreground" />
          <span class="flex-1 text-left truncate">{mobileTitle}</span>
          <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          class="w-[calc(100vw-2rem)] max-w-md max-h-80 overflow-y-auto"
        >
          <DropdownMenuItem
            class="cursor-pointer"
            onSelect={() => goto("/docs")}
          >
            Documentation Home
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {#each navigation as section, i}
            {#if i > 0}
              <DropdownMenuSeparator />
            {/if}
            <DropdownMenuLabel class="text-xs text-muted-foreground font-semibold">
              {section.title}
            </DropdownMenuLabel>
            {#each section.items as item}
              <DropdownMenuItem
                class="cursor-pointer {normalizePath(item.href) === currentPath ? 'bg-accent' : ''}"
                onSelect={() => goto(item.href)}
              >
                {item.title}
              </DropdownMenuItem>
            {/each}
          {/each}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="docs-main-grid">
      <section bind:this={contentScrollEl} class="docs-content-scroll">
        <div class="docs-meta-bar">
          <div class="docs-breadcrumbs">
            <span>Docs</span>
            {#if activeItem}
              <span class="docs-breadcrumb-separator">/</span>
              <span>{activeItem.section}</span>
            {/if}
          </div>
          <div class="docs-meta-actions">
            <button
              type="button"
              class="docs-meta-button"
              onclick={copyPageLink}
            >
              <Link class="size-3.5" />
              <span>{linkCopied ? "Copied" : "Copy link"}</span>
            </button>
            {#if editUrl}
              <a
                href={editUrl}
                class="docs-meta-button"
                target="_blank"
                rel="noreferrer"
              >
                <Pencil class="size-3.5" />
                <span>Edit on GitHub</span>
              </a>
            {/if}
          </div>
        </div>
        <article
          bind:this={articleEl}
          class="prose prose-slate dark:prose-invert docs-prose max-w-none"
        >
          {@render children()}
        </article>

        {#if previousItem || nextItem}
          <nav class="docs-pager" aria-label="Previous and next pages">
            {#if previousItem}
              <a href={previousItem.href} class="pager-card">
                <span class="direction"
                  ><ArrowLeft class="size-3.5" /> Previous</span
                >
                <span class="title">{previousItem.title}</span>
                <span class="section">{previousItem.section}</span>
              </a>
            {/if}
            {#if nextItem}
              <a href={nextItem.href} class="pager-card next">
                <span class="direction"
                  >Next <ArrowRight class="size-3.5" /></span
                >
                <span class="title">{nextItem.title}</span>
                <span class="section">{nextItem.section}</span>
              </a>
            {/if}
          </nav>
        {/if}
      </section>

      {#if headings.length > 0}
        <aside class="docs-toc" aria-label="Table of contents">
          <div class="docs-toc-scroll">
            <div class="docs-toc-card">
              <p class="docs-toc-title">
                <Hash class="size-3.5" />
                On this page
              </p>
              <ul>
                {#each headings as heading}
                  <li class:child={heading.level === 3}>
                    <a
                      href={`#${heading.id}`}
                      class:active={activeHeadingId === heading.id}
                      onclick={(event) => scrollToHeading(event, heading.id)}
                    >
                      {heading.text}
                    </a>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </aside>
      {/if}
    </div>
  </main>
</div>

<style>
  :global(html) {
    scroll-behavior: smooth;
  }

  :root {
    --docs-scroll-track: transparent;
    --docs-scroll-thumb: hsl(var(--muted-foreground) / 0.35);
    --docs-scroll-thumb-hover: hsl(var(--muted-foreground) / 0.55);
    --docs-bg-glow: radial-gradient(
      circle at 16% 12%,
      hsl(var(--primary) / 0.12) 0,
      transparent 42%
    );
    --docs-bg-glow-secondary: radial-gradient(
      circle at 84% 6%,
      hsl(var(--foreground) / 0.05) 0,
      transparent 38%
    );
    --docs-bg-grid: linear-gradient(
        hsl(var(--border) / 0.16) 1px,
        transparent 1px
      ),
      linear-gradient(90deg, hsl(var(--border) / 0.16) 1px, transparent 1px);
    --docs-bg-grid-size: 38px 38px;
    --docs-bg-opacity: 0.85;
  }

  :global(.dark) {
    --docs-bg-glow: radial-gradient(
      circle at 18% 10%,
      hsl(var(--primary) / 0.2) 0,
      transparent 40%
    );
    --docs-bg-glow-secondary: radial-gradient(
      circle at 82% 12%,
      hsl(220 80% 60% / 0.14) 0,
      transparent 40%
    );
    --docs-bg-grid: linear-gradient(
        hsl(var(--border) / 0.22) 1px,
        transparent 1px
      ),
      linear-gradient(90deg, hsl(var(--border) / 0.22) 1px, transparent 1px);
    --docs-bg-opacity: 0.78;
  }

  .docs-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    background: hsl(var(--background));
    position: relative;
    isolation: isolate;
  }

  .docs-layout::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: var(--docs-bg-glow), var(--docs-bg-glow-secondary),
      var(--docs-bg-grid);
    background-size: auto, auto, var(--docs-bg-grid-size);
    background-position:
      center,
      center,
      top left;
    opacity: var(--docs-bg-opacity);
    pointer-events: none;
    z-index: -1;
  }

  .docs-sidebar {
    display: none;
    width: 18.5rem;
    background: hsl(var(--background));
    border-right: 1px solid hsl(var(--border) / 0.6);
  }

  .docs-sidebar-inner {
    position: sticky;
    top: 0;
    display: flex;
    height: 100vh;
    flex-direction: column;
    gap: 0.85rem;
    overflow-y: auto;
    padding: 1.1rem 1rem 1.4rem;
  }

  .docs-search {
    position: relative;
    display: block;
  }

  .docs-search input {
    width: 100%;
    border-radius: 0.5rem;
    border: 0;
    background: hsl(var(--background));
    padding: 0.52rem 0.7rem 0.52rem 2rem;
    font-size: 0.84rem;
    color: hsl(var(--foreground));
    box-shadow: inset 0 0 0 1px hsl(var(--border) / 0.7);
  }

  .docs-search input:focus {
    outline: none;
    box-shadow:
      inset 0 0 0 1px hsl(var(--primary) / 0.35),
      0 0 0 1px hsl(var(--primary) / 0.25);
  }

  :global(.docs-search-icon) {
    position: absolute;
    left: 0.65rem;
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
  }

  .docs-search-shortcut {
    position: absolute;
    right: 0.55rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.68rem;
    padding: 0.08rem 0.35rem;
    border-radius: 0.35rem;
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border) / 0.8);
    background: hsl(var(--background));
    letter-spacing: 0.08em;
  }

  .docs-nav {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding-right: 0.15rem;
  }

  .docs-nav-section h2 {
    margin: 0 0 0.2rem;
    padding: 0.25rem 0.55rem;
    font-size: 0.64rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
  }

  .docs-nav-section ul {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .docs-nav-section a {
    display: block;
    border-radius: 0.42rem;
    padding: 0.42rem 0.55rem;
    font-size: 0.83rem;
    line-height: 1.35;
    color: hsl(var(--muted-foreground));
    transition: all 0.18s ease;
  }

  .docs-nav-section a:hover {
    background: hsl(var(--background) / 0.75);
    color: hsl(var(--foreground));
  }

  .docs-nav-section a.active {
    background: hsl(var(--primary) / 0.08);
    color: hsl(var(--foreground));
    box-shadow: inset 2px 0 0 hsl(var(--primary));
  }

  .docs-empty {
    border-radius: 0.5rem;
    padding: 0.85rem 0.7rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.83rem;
    background: hsl(var(--background) / 0.78);
  }

  .docs-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding-bottom: 1.2rem;
    background: hsl(var(--background) / 0.72);
    backdrop-filter: saturate(120%) blur(2px);
  }

  .docs-mobile-nav {
    margin: 1rem 1rem 0;
  }

  .docs-main-grid {
    max-width: 76rem;
    margin: 0 auto;
    padding: 1.6rem 1.2rem 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 1.5rem;
    min-height: 0;
    flex: 1;
    width: 100%;
  }

  .docs-content-scroll {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 0.1rem;
  }

  .docs-meta-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid hsl(var(--border) / 0.6);
  }

  .docs-breadcrumbs {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }

  .docs-breadcrumb-separator {
    color: hsl(var(--muted-foreground) / 0.6);
  }

  .docs-meta-actions {
    display: inline-flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .docs-meta-button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    padding: 0.3rem 0.7rem;
    font-size: 0.78rem;
    color: hsl(var(--foreground));
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border) / 0.7);
    transition: all 0.18s ease;
  }

  .docs-meta-button:hover {
    background: hsl(var(--muted) / 0.2);
  }

  .docs-toc {
    display: none;
    min-height: 0;
  }

  .docs-toc-scroll {
    height: 100%;
    overflow-y: auto;
    padding-right: 0.1rem;
  }

  .docs-sidebar-inner,
  .docs-content-scroll,
  .docs-toc-scroll,
  :global(.docs-prose pre) {
    scrollbar-width: auto;
    scrollbar-color: var(--docs-scroll-thumb) var(--docs-scroll-track);
  }

  .docs-sidebar-inner::-webkit-scrollbar,
  .docs-content-scroll::-webkit-scrollbar,
  .docs-toc-scroll::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  :global(.docs-prose pre::-webkit-scrollbar) {
    width: 12px;
    height: 12px;
  }

  .docs-sidebar-inner::-webkit-scrollbar-track,
  .docs-content-scroll::-webkit-scrollbar-track,
  .docs-toc-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  :global(.docs-prose pre::-webkit-scrollbar-track) {
    background: transparent;
  }

  .docs-sidebar-inner::-webkit-scrollbar-thumb,
  .docs-content-scroll::-webkit-scrollbar-thumb,
  .docs-toc-scroll::-webkit-scrollbar-thumb {
    background: var(--docs-scroll-thumb);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  :global(.docs-prose pre::-webkit-scrollbar-thumb) {
    background: var(--docs-scroll-thumb);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .docs-sidebar-inner::-webkit-scrollbar-thumb:hover,
  .docs-content-scroll::-webkit-scrollbar-thumb:hover,
  .docs-toc-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--docs-scroll-thumb-hover);
    background-clip: content-box;
  }

  :global(.docs-prose pre::-webkit-scrollbar-thumb:hover) {
    background: var(--docs-scroll-thumb-hover);
    background-clip: content-box;
  }

  .docs-toc-card {
    border-radius: 0.55rem;
    background: hsl(var(--background));
    padding: 0.78rem;
    border: 1px solid hsl(var(--border) / 0.6);
  }

  .docs-toc-title {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.65rem;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }

  .docs-toc ul {
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .docs-toc li {
    list-style: none;
  }

  .docs-toc li.child a {
    padding-left: 1rem;
    font-size: 0.79rem;
  }

  .docs-toc a {
    display: block;
    border-radius: 0.4rem;
    padding: 0.34rem 0.5rem;
    line-height: 1.3;
    color: hsl(var(--muted-foreground));
    font-size: 0.82rem;
    transition: all 0.18s ease;
  }

  .docs-toc a:hover {
    color: hsl(var(--foreground));
    background: hsl(var(--background) / 0.72);
  }

  .docs-toc a.active {
    color: hsl(var(--foreground));
    background: hsl(var(--primary) / 0.14);
    font-weight: 600;
  }

  .docs-pager {
    margin-top: 0.9rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .pager-card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    border-radius: 0.55rem;
    padding: 0.78rem 0.9rem;
    background: hsl(var(--background));
    transition: background-color 0.16s ease;
    border: 1px solid hsl(var(--border) / 0.6);
  }

  .pager-card:hover {
    background: hsl(var(--muted) / 0.18);
  }

  .pager-card.next {
    text-align: right;
  }

  .pager-card .direction {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .pager-card.next .direction {
    justify-content: flex-end;
  }

  .pager-card .title {
    color: hsl(var(--foreground));
    font-weight: 600;
    font-size: 0.97rem;
  }

  .pager-card .section {
    color: hsl(var(--muted-foreground));
    font-size: 0.8rem;
  }

  :global(.docs-prose) {
    color: hsl(var(--foreground));
    background: hsl(var(--card));
    border-radius: 0.6rem;
    padding: clamp(1.1rem, 1.9vw, 1.8rem);
    border: 1px solid hsl(var(--border) / 0.6);
  }

  :global(.docs-prose h1) {
    color: hsl(var(--foreground));
    font-size: clamp(2rem, 4vw, 2.5rem);
    font-weight: 750;
    margin-bottom: 0.8rem;
    letter-spacing: -0.03em;
  }

  :global(.docs-prose h1 + p) {
    font-size: 1.05rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1.3rem;
  }

  :global(.docs-prose h2) {
    color: hsl(var(--foreground));
    font-size: clamp(1.3rem, 2.8vw, 1.62rem);
    font-weight: 640;
    margin-top: 2rem;
    margin-bottom: 0.85rem;
    padding-bottom: 0.45rem;
    box-shadow: inset 0 -1px 0 hsl(var(--border) / 0.6);
    letter-spacing: -0.01em;
  }

  :global(.docs-prose h3) {
    color: hsl(var(--foreground));
    font-size: 1.16rem;
    font-weight: 600;
    margin-top: 1.45rem;
    margin-bottom: 0.65rem;
  }

  :global(.docs-prose h2),
  :global(.docs-prose h3) {
    position: relative;
    scroll-margin-top: 5.5rem;
  }

  :global(.docs-heading-anchor) {
    position: absolute;
    right: -1.4rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.9rem;
    opacity: 0;
    color: hsl(var(--muted-foreground));
    transition: opacity 0.18s ease;
  }

  :global(.docs-prose h2:hover .docs-heading-anchor),
  :global(.docs-prose h3:hover .docs-heading-anchor) {
    opacity: 1;
  }

  :global(.docs-prose p) {
    margin-bottom: 1rem;
    line-height: 1.72;
  }

  :global(.docs-prose a) {
    color: hsl(var(--primary));
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-thickness: 1.5px;
  }

  :global(.docs-prose code) {
    background: hsl(var(--muted) / 0.55);
    color: hsl(var(--foreground));
    border-radius: 0.35rem;
    padding: 0.14em 0.38em;
    font-size: 0.86em;
    box-shadow: inset 0 0 0 1px hsl(var(--border) / 0.6);
  }

  :global(.docs-prose pre) {
    margin: 1rem 0 1.2rem;
    background: hsl(var(--muted) / 0.35);
    border-radius: 0.5rem;
    padding: 0.95rem 1rem;
    overflow-x: auto;
    border: 1px solid hsl(var(--border) / 0.6);
  }

  :global(.docs-prose pre code) {
    background: transparent;
    padding: 0;
    font-size: 0.85rem;
    box-shadow: none;
  }

  :global(.docs-prose pre.shiki) {
    background: var(--shiki-light-bg) !important;
    color: var(--shiki-light) !important;
  }

  :global(.dark .docs-prose pre.shiki) {
    background: var(--shiki-dark-bg) !important;
    color: var(--shiki-dark) !important;
  }

  :global(.docs-prose pre.shiki code) {
    font-size: 0.86rem;
    line-height: 1.6;
  }

  :global(.docs-code-block) {
    position: relative;
  }

  :global(.docs-code-copy) {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    border-radius: 999px;
    border: 1px solid hsl(var(--border) / 0.7);
    background: hsl(var(--background));
    padding: 0.2rem 0.6rem;
    font-size: 0.72rem;
    color: hsl(var(--foreground));
    transition: all 0.15s ease;
  }

  :global(.docs-code-copy:hover) {
    background: hsl(var(--muted) / 0.2);
  }

  :global(.docs-code-copy[data-copied="true"]) {
    color: hsl(var(--primary));
    border-color: hsl(var(--primary) / 0.5);
  }

  :global(.docs-prose .mermaid) {
    margin: 1rem 0 1.2rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--muted) / 0.22);
    border: 1px solid hsl(var(--border) / 0.55);
    overflow-x: auto;
  }

  :global(.docs-prose ul) {
    list-style-type: disc;
    margin: 0.85rem 0 1rem;
    padding-left: 1.3rem;
  }

  :global(.docs-prose ol) {
    list-style-type: decimal;
    margin: 0.85rem 0 1rem;
    padding-left: 1.3rem;
  }

  :global(.docs-prose li) {
    margin-bottom: 0.38rem;
  }

  :global(.docs-prose blockquote) {
    border-radius: 0.48rem;
    margin: 1rem 0;
    padding: 0.55rem 0.85rem;
    color: hsl(var(--muted-foreground));
    font-style: normal;
    background: hsl(var(--muted) / 0.25);
    border-left: 3px solid hsl(var(--primary) / 0.5);
  }

  :global(.docs-prose table) {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 1.25rem 0;
    border-radius: 0.5rem;
    overflow: hidden;
    font-size: 0.93rem;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border) / 0.6);
  }

  :global(.docs-prose thead) {
    background: hsl(var(--muted) / 0.3);
  }

  :global(.docs-prose th),
  :global(.docs-prose td) {
    text-align: left;
    vertical-align: top;
    padding: 0.6rem 0.74rem;
  }

  :global(.docs-prose th) {
    font-weight: 650;
  }

  :global(.docs-prose tbody tr) {
    background: hsl(var(--background));
  }

  :global(.docs-prose tbody tr:nth-child(even)) {
    background: hsl(var(--muted) / 0.18);
  }

  @media (min-width: 1024px) {
    .docs-sidebar {
      display: block;
    }

    .docs-main-grid {
      padding: 1.7rem 1.9rem 0;
    }
  }

  @media (min-width: 1280px) {
    .docs-main-grid {
      grid-template-columns: minmax(0, 1fr) 17.5rem;
      grid-template-rows: minmax(0, 1fr);
      gap: 1.25rem;
      height: 100%;
      align-items: stretch;
    }

    .docs-content-scroll,
    .docs-toc,
    .docs-toc-scroll {
      height: 100%;
      min-height: 0;
    }

    .docs-toc {
      display: block;
    }
  }

  @media (max-width: 640px) {
    .docs-main-grid {
      padding: 1rem 0.78rem 0;
    }

    :global(.docs-prose) {
      border-radius: 0.78rem;
      padding: 0.95rem;
    }
  }
</style>
