<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount, tick } from "svelte";
  import { ArrowLeft, ArrowRight, Hash, Library, Search } from "@lucide/svelte";

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
      title: "Design",
      items: [
        { title: "Docs Reorg", href: "/docs/design/doc-reorg" },
        { title: "Architecture", href: "/docs/design/arch" },
        {
          title: "Plan and Artifacts",
          href: "/docs/design/plan-and-artifacts",
        },
        { title: "Philosophy", href: "/docs/design/philosophy" },
        { title: "Viber Daemon", href: "/docs/design/viber-daemon" },
        { title: "Viber vs Clawdbot", href: "/docs/design/viber-vs-clawdbot" },
        { title: "Channels", href: "/docs/design/channels" },
        { title: "Skills", href: "/docs/design/skills" },
        { title: "Task Lifecycle", href: "/docs/design/task-lifecycle" },
        {
          title: "Tmux Coding Scenario",
          href: "/docs/design/tmux-coding-scenario",
        },
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

  const allItems: FlatNavItem[] = navigation.flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.title })),
  );

  let navQuery = $state("");
  let contentScrollEl = $state<HTMLElement | null>(null);
  let articleEl = $state<HTMLElement | null>(null);
  let headings = $state<TocHeading[]>([]);
  let activeHeadingId = $state("");
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

      const baseId = node.id || slugify(text) || `section-${nextHeadings.length + 1}`;
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
    observeHeadings();
  }

  function selectDoc(event: Event): void {
    const target = event.currentTarget as HTMLSelectElement;
    const nextPath = target.value;
    if (nextPath && nextPath !== currentPath) {
      void goto(nextPath);
    }
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

  async function loadMermaid() {
    if (typeof window === "undefined") return null;
    if (mermaidApi) return mermaidApi;

    try {
      const module = await import(
        /* @vite-ignore */ mermaidModuleUrl
      );
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

  onMount(() => {
    void refreshDocChrome();
    return () => {
      headingObserver?.disconnect();
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
      <a href="/docs" class="docs-brand">
        <span class="docs-brand-icon"><Library class="size-4" /></span>
        <span>Viber Docs</span>
      </a>

      <label class="docs-search">
        <Search class="docs-search-icon size-4" />
        <input
          type="search"
          placeholder="Search docs..."
          bind:value={navQuery}
          aria-label="Search documentation pages"
        />
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
      <label for="docs-mobile-select">Browse docs</label>
      <select
        id="docs-mobile-select"
        value={currentPath}
        onchange={selectDoc}
        aria-label="Browse documentation pages"
      >
        <option value="/docs">Documentation Home</option>
        {#each navigation as section}
          <optgroup label={section.title}>
            {#each section.items as item}
              <option value={item.href}>{item.title}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <p>{mobileTitle}</p>
    </div>

    <div class="docs-main-grid">
      <section bind:this={contentScrollEl} class="docs-content-scroll">
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
  }

  .docs-layout {
    display: flex;
    flex: 1;
    min-height: 0;
    background: hsl(var(--background));
  }

  .docs-sidebar {
    display: none;
    width: 18.5rem;
    background: hsl(var(--muted) / 0.26);
    box-shadow: 1px 0 8px -6px hsl(var(--foreground) / 0.45);
  }

  .docs-sidebar-inner {
    position: sticky;
    top: 0;
    display: flex;
    height: 100vh;
    flex-direction: column;
    gap: 0.9rem;
    overflow-y: auto;
    padding: 1.1rem 0.85rem 1.25rem;
  }

  .docs-brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    border-radius: 0.5rem;
    padding: 0.55rem 0.65rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    background: hsl(var(--background) / 0.84);
    box-shadow: 0 1px 6px -5px hsl(var(--foreground) / 0.75);
  }

  .docs-brand-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.35rem;
    padding: 0.25rem;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
  }

  .docs-search {
    position: relative;
    display: block;
  }

  .docs-search input {
    width: 100%;
    border-radius: 0.5rem;
    border: 0;
    background: hsl(var(--background) / 0.88);
    padding: 0.52rem 0.7rem 0.52rem 2rem;
    font-size: 0.84rem;
    color: hsl(var(--foreground));
    box-shadow: inset 0 0 0 1px hsl(var(--muted) / 0.95);
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

  .docs-nav {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding-right: 0.15rem;
  }

  .docs-nav-section h2 {
    margin: 0 0 0.2rem;
    padding: 0.25rem 0.55rem;
    font-size: 0.66rem;
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
    background: hsl(var(--primary) / 0.14);
    color: hsl(var(--foreground));
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
    background: hsl(var(--background));
  }

  .docs-mobile-nav {
    margin: 1rem 1rem 0;
    border-radius: 0.6rem;
    background: hsl(var(--muted) / 0.3);
    padding: 0.8rem;
    box-shadow: 0 1px 8px -6px hsl(var(--foreground) / 0.8);
  }

  .docs-mobile-nav label {
    display: block;
    margin-bottom: 0.42rem;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }

  .docs-mobile-nav select {
    width: 100%;
    border: 0;
    border-radius: 0.45rem;
    background: hsl(var(--background));
    padding: 0.5rem 0.62rem;
    color: hsl(var(--foreground));
    font-size: 0.92rem;
    box-shadow: inset 0 0 0 1px hsl(var(--muted) / 0.95);
  }

  .docs-mobile-nav p {
    margin-top: 0.5rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.8rem;
  }

  .docs-main-grid {
    max-width: 82rem;
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
    padding-right: 0.1rem;
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
    background: hsl(var(--muted) / 0.3);
    padding: 0.78rem;
    box-shadow: 0 1px 8px -6px hsl(var(--foreground) / 0.8);
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
    background: hsl(var(--muted) / 0.3);
    transition: background-color 0.16s ease;
    box-shadow: 0 1px 8px -6px hsl(var(--foreground) / 0.75);
  }

  .pager-card:hover {
    background: hsl(var(--muted) / 0.42);
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
    background: hsl(var(--card) / 0.86);
    border-radius: 0.6rem;
    padding: clamp(1.1rem, 1.9vw, 1.8rem);
    box-shadow: 0 1px 10px -7px hsl(var(--foreground) / 0.45);
  }

  :global(.docs-prose h1) {
    color: hsl(var(--foreground));
    font-size: clamp(2rem, 4vw, 2.5rem);
    font-weight: 750;
    margin-bottom: 0.8rem;
    letter-spacing: -0.03em;
  }

  :global(.docs-prose h2) {
    color: hsl(var(--foreground));
    font-size: clamp(1.3rem, 2.8vw, 1.62rem);
    font-weight: 640;
    margin-top: 2rem;
    margin-bottom: 0.85rem;
    padding-bottom: 0.45rem;
    box-shadow: inset 0 -1px 0 hsl(var(--muted) / 0.8);
    letter-spacing: -0.01em;
  }

  :global(.docs-prose h3) {
    color: hsl(var(--foreground));
    font-size: 1.16rem;
    font-weight: 600;
    margin-top: 1.45rem;
    margin-bottom: 0.65rem;
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
    background: hsl(var(--muted) / 0.85);
    color: hsl(var(--foreground));
    border-radius: 0.35rem;
    padding: 0.14em 0.38em;
    font-size: 0.86em;
    box-shadow: inset 0 0 0 1px hsl(var(--muted) / 0.9);
  }

  :global(.docs-prose pre) {
    margin: 1rem 0 1.2rem;
    background: hsl(var(--muted) / 0.8);
    border-radius: 0.5rem;
    padding: 0.95rem 1rem;
    overflow-x: auto;
    box-shadow: 0 1px 8px -6px hsl(var(--foreground) / 0.75);
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

  :global(.docs-prose .mermaid) {
    margin: 1rem 0 1.2rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background: hsl(var(--muted) / 0.22);
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
    background: hsl(var(--muted) / 0.35);
    box-shadow: inset 0.15rem 0 0 hsl(var(--primary) / 0.35);
  }

  :global(.docs-prose table) {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 1.25rem 0;
    border-radius: 0.5rem;
    overflow: hidden;
    font-size: 0.93rem;
    background: hsl(var(--muted) / 0.25);
    box-shadow: 0 1px 8px -6px hsl(var(--foreground) / 0.75);
  }

  :global(.docs-prose thead) {
    background: hsl(var(--muted) / 0.55);
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
    background: hsl(var(--background) / 0.92);
  }

  :global(.docs-prose tbody tr:nth-child(even)) {
    background: hsl(var(--muted) / 0.24);
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

  @media (max-width: 1279px) {
    .docs-pager {
      grid-template-columns: minmax(0, 1fr);
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
