<script lang="ts">
  import { onMount } from "svelte";
  import { marked } from "marked";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Pagination from "$lib/components/ui/pagination";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import {
    AlertCircle,
    BookText,
    Check,
    CheckCircle,
    ChevronDown,
    Download,
    ExternalLink,
    Github,
    Loader2,
    Search,
    Sparkles,
    X,
  } from "@lucide/svelte";

  interface DiscoverSkill {
    id: string;
    importId?: string;
    name: string;
    description: string;
    author: string;
    version: string;
    source: string;
    url: string;
    tags: string[];
    category?: string;
    popularity?: number;
    updatedAt?: string;
    license?: string;
  }

  interface SourcePreviewState {
    loading: boolean;
    error: string | null;
    skills: DiscoverSkill[];
    total: number;
    page: number;
    totalPages: number;
  }

  interface ImportState {
    status: "idle" | "importing" | "success" | "error";
    message?: string;
  }

  interface SkillPreviewDialogState {
    open: boolean;
    loading: boolean;
    error: string | null;
    title: string;
    sourceRepoUrl: string;
    sourceMarkdown: string;
    renderedHtml: string;
    frontmatter: Record<string, string | string[]>;
    skill: DiscoverSkill | null;
  }

  interface CategoryOption {
    name: string;
    tag: string;
    count: number;
  }

  interface SkillCardMetadata {
    emoji?: string;
    name?: string;
    description?: string;
    version?: string;
    tags?: string[];
    homepage?: string;
    repository?: string;
    userInvocable?: boolean;
  }

  const SEARCH_LIMIT = 24;
  const BROWSE_LIMIT = 24;
  const SOURCE_ID = "openclaw";
  const SOURCE_LABEL = "OpenClaw Skills (Curated)";

  let query = $state("");
  let lastSearchQuery = $state("");
  let sortOrder = $state<"relevance" | "popularity" | "recent" | "name">(
    "relevance",
  );
  let selectedCategoryTag = $state("");
  let categories = $state<CategoryOption[]>([]);

  let previewState = $state<SourcePreviewState>({
    loading: false,
    error: null,
    skills: [],
    total: 0,
    page: 1,
    totalPages: 0,
  });
  let previewLoading = $state(false);
  let importStates = $state<Record<string, ImportState>>({});
  let authenticated = $state(false);
  let installedSkillNames = $state<Set<string>>(new Set());
  let skillCardMetadata = $state<Record<string, SkillCardMetadata>>({});
  let skillPreviewDialog = $state<SkillPreviewDialogState>({
    open: false,
    loading: false,
    error: null,
    title: "",
    sourceRepoUrl: "",
    sourceMarkdown: "",
    renderedHtml: "",
    frontmatter: {},
    skill: null,
  });
  let skillPreviewTab = $state<"preview" | "source">("preview");

  let searchResults = $state<DiscoverSkill[]>([]);
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);
  let page = $state(1);
  let total = $state(0);
  let totalPages = $state(0);
  const fetchedSkillMetadataKeys = new Set<string>();
  const fetchingSkillMetadataKeys = new Set<string>();

  const hasActiveSearch = $derived(lastSearchQuery.trim().length > 0);
  const combinedPreviewResults = $derived.by(() => {
    const combined = [...previewState.skills];

    if (sortOrder === "popularity") {
      combined.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (sortOrder === "recent") {
      combined.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      });
    } else if (sortOrder === "name") {
      combined.sort((a, b) => a.name.localeCompare(b.name));
    }

    return combined;
  });
  const hasCategories = $derived(categories.length > 0);

  function getSkillKey(skill: DiscoverSkill) {
    return `${skill.source}:${skill.id}`;
  }

  function isSkillInstalled(skill: DiscoverSkill): boolean {
    const name = (skill.importId || skill.id || "").toLowerCase();
    if (!name) return false;
    // Check full name and also just the slug part (after /)
    if (installedSkillNames.has(name)) return true;
    const slug = name.split("/").pop();
    if (slug && installedSkillNames.has(slug)) return true;
    return false;
  }

  function syncInstalledStates(skills: DiscoverSkill[]) {
    const updates: Record<string, ImportState> = {};
    for (const skill of skills) {
      const key = getSkillKey(skill);
      if (!importStates[key] && isSkillInstalled(skill)) {
        updates[key] = { status: "success", message: "Already installed" };
      }
    }
    if (Object.keys(updates).length > 0) {
      importStates = { ...importStates, ...updates };
    }
  }

  function formatDate(value?: string) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function toBoolean(
    value: string | string[] | undefined,
  ): boolean | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return undefined;
  }

  function toStringValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.replace(/^['"]|['"]$/g, "");
  }

  function toStringArray(value: string | string[] | undefined): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function applyCategoriesFromResponse(data: unknown) {
    const raw = (data as { categories?: unknown })?.categories;
    if (!Array.isArray(raw)) return;
    const next = raw
      .map((entry) => {
        const category = entry as Partial<CategoryOption>;
        if (
          typeof category?.name !== "string" ||
          typeof category?.tag !== "string"
        ) {
          return null;
        }
        return {
          name: category.name,
          tag: category.tag,
          count:
            typeof category.count === "number" &&
            Number.isFinite(category.count)
              ? category.count
              : 0,
        } satisfies CategoryOption;
      })
      .filter((entry): entry is CategoryOption => Boolean(entry));
    if (next.length > 0) {
      categories = next;
    }
  }

  async function fetchSourcePreview(nextPage = 1): Promise<SourcePreviewState> {
    try {
      const params = new URLSearchParams({
        source: SOURCE_ID,
        sort: sortOrder,
        page: String(nextPage),
        limit: String(BROWSE_LIMIT),
      });
      if (selectedCategoryTag) {
        params.set("category", selectedCategoryTag);
      }
      const res = await fetch(`/api/skill-hub?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load skills");
      }
      const data = await res.json();
      applyCategoriesFromResponse(data);
      if (typeof data.authenticated === "boolean") {
        authenticated = data.authenticated;
      }
      if (Array.isArray(data.installed)) {
        installedSkillNames = new Set(
          data.installed.map((n: string) => n.toLowerCase()),
        );
      }
      const skills: DiscoverSkill[] = data.skills ?? [];
      syncInstalledStates(skills);
      return {
        loading: false,
        error: null,
        skills,
        total: data.total ?? 0,
        page: data.page ?? nextPage,
        totalPages: data.totalPages ?? 0,
      };
    } catch (error) {
      return {
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load skills",
        skills: [],
        total: 0,
        page: 1,
        totalPages: 0,
      };
    }
  }

  async function loadSourcePreviews(nextPage = 1) {
    previewLoading = true;
    previewState = { ...previewState, loading: true, error: null, skills: [] };
    previewState = await fetchSourcePreview(nextPage);
    previewLoading = false;
  }

  async function runSearch(nextPage = 1) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      clearSearch();
      return;
    }

    searchLoading = true;
    searchError = null;
    lastSearchQuery = trimmedQuery;

    try {
      const params = new URLSearchParams();
      params.set("q", trimmedQuery);
      params.set("source", SOURCE_ID);
      params.set("sort", sortOrder);
      params.set("page", String(nextPage));
      params.set("limit", String(SEARCH_LIMIT));
      if (selectedCategoryTag) {
        params.set("category", selectedCategoryTag);
      }

      const res = await fetch(`/api/skill-hub?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to search skills");
      }

      const data = await res.json();
      applyCategoriesFromResponse(data);
      if (typeof data.authenticated === "boolean") {
        authenticated = data.authenticated;
      }
      if (Array.isArray(data.installed)) {
        installedSkillNames = new Set(
          data.installed.map((n: string) => n.toLowerCase()),
        );
      }
      searchResults = data.skills ?? [];
      syncInstalledStates(searchResults);
      total = data.total ?? 0;
      totalPages = data.totalPages ?? 0;
      page = data.page ?? nextPage;
    } catch (error) {
      searchError =
        error instanceof Error ? error.message : "Failed to search skills";
      searchResults = [];
      total = 0;
      totalPages = 0;
      page = 1;
    } finally {
      searchLoading = false;
    }
  }

  function clearSearch() {
    query = "";
    lastSearchQuery = "";
    searchError = null;
    searchResults = [];
    total = 0;
    totalPages = 0;
    page = 1;
    void loadSourcePreviews();
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void runSearch(1);
  }

  function handleSortChange() {
    if (hasActiveSearch) {
      void runSearch(1);
    } else {
      void loadSourcePreviews();
    }
  }

  function handleCategoryChange(categoryTag: string) {
    selectedCategoryTag = categoryTag;
    if (hasActiveSearch) {
      void runSearch(1);
    } else {
      void loadSourcePreviews();
    }
  }

  function escapeRawHtml(markdown: string): string {
    return markdown.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function sanitizeRenderedHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "")
      .replace(/href="javascript:[^"]*"/gi, 'href="#"')
      .replace(/href='javascript:[^']*'/gi, "href='#'");
  }

  function parseFrontmatter(markdown: string): {
    body: string;
    frontmatter: Record<string, string | string[]>;
  } {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      return { body: markdown, frontmatter: {} };
    }

    const frontmatterRaw = match[1];
    const body = markdown.slice(match[0].length);
    const frontmatter: Record<string, string | string[]> = {};
    let currentKey: string | null = null;

    for (const rawLine of frontmatterRaw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const keyValue = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (keyValue) {
        const key = keyValue[1];
        const value = keyValue[2];
        if (value) {
          frontmatter[key] = value;
          currentKey = null;
        } else {
          frontmatter[key] = [];
          currentKey = key;
        }
        continue;
      }

      const listItem = line.match(/^-\s+(.+)$/);
      if (listItem && currentKey && Array.isArray(frontmatter[currentKey])) {
        (frontmatter[currentKey] as string[]).push(listItem[1]);
      }
    }

    return { body, frontmatter };
  }

  function deriveRepoUrl(skill: DiscoverSkill): string {
    if (!skill.url) return "";
    try {
      const parsed = new URL(skill.url);
      if (parsed.hostname.toLowerCase() !== "github.com") return skill.url;
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        return `https://github.com/${segments[0]}/${segments[1]}`;
      }
      return skill.url;
    } catch {
      return skill.url;
    }
  }

  function getGitHubRepoUrl(skill: DiscoverSkill): string {
    const metadata = skillCardMetadata[getSkillKey(skill)];
    const repoUrl =
      metadata?.repository || metadata?.homepage || deriveRepoUrl(skill);
    if (!repoUrl) return "";
    try {
      const parsed = new URL(repoUrl);
      return parsed.hostname.toLowerCase() === "github.com" ? repoUrl : "";
    } catch {
      return "";
    }
  }

  function getSkillName(skill: DiscoverSkill): string {
    return skillCardMetadata[getSkillKey(skill)]?.name || skill.name;
  }

  function getSkillEmoji(skill: DiscoverSkill): string {
    const emoji = skillCardMetadata[getSkillKey(skill)]?.emoji;
    return typeof emoji === "string" ? emoji.trim() : "";
  }

  function getSkillDescription(skill: DiscoverSkill): string {
    return (
      skillCardMetadata[getSkillKey(skill)]?.description || skill.description
    );
  }

  function getSkillVersion(skill: DiscoverSkill): string {
    return skillCardMetadata[getSkillKey(skill)]?.version || skill.version;
  }

  function getSkillTags(skill: DiscoverSkill): string[] {
    const metadataTags = skillCardMetadata[getSkillKey(skill)]?.tags || [];
    if (metadataTags.length > 0) return metadataTags.slice(0, 4);
    return (skill.tags || []).slice(0, 4);
  }

  function getUserInvocable(skill: DiscoverSkill): boolean {
    return Boolean(skillCardMetadata[getSkillKey(skill)]?.userInvocable);
  }

  async function fetchSkillCardMetadata(skill: DiscoverSkill) {
    const key = getSkillKey(skill);
    if (
      fetchedSkillMetadataKeys.has(key) ||
      fetchingSkillMetadataKeys.has(key)
    ) {
      return;
    }
    fetchingSkillMetadataKeys.add(key);

    try {
      const params = new URLSearchParams({
        source: skill.source,
        skillId: skill.importId || skill.id,
      });
      if (skill.url) params.set("skillUrl", skill.url);
      const res = await fetch(`/api/skill-hub/readme?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (typeof data.markdown !== "string") return;

      const { frontmatter } = parseFrontmatter(data.markdown);
      const metadata: SkillCardMetadata = {
        emoji:
          toStringValue(frontmatter.emoji) || toStringValue(frontmatter.icon),
        name: toStringValue(frontmatter.name),
        description: toStringValue(frontmatter.description),
        version: toStringValue(frontmatter.version),
        tags: toStringArray(frontmatter.tags),
        homepage: toStringValue(frontmatter.homepage),
        repository: toStringValue(frontmatter.repository),
        userInvocable: toBoolean(frontmatter["user-invocable"]),
      };

      skillCardMetadata = {
        ...skillCardMetadata,
        [key]: metadata,
      };
      fetchedSkillMetadataKeys.add(key);
    } finally {
      fetchingSkillMetadataKeys.delete(key);
    }
  }

  async function openSkillPreview(skill: DiscoverSkill) {
    skillPreviewTab = "preview";
    skillPreviewDialog = {
      open: true,
      loading: true,
      error: null,
      title: skill.name,
      sourceRepoUrl: deriveRepoUrl(skill),
      sourceMarkdown: "",
      renderedHtml: "",
      frontmatter: {},
      skill,
    };

    try {
      const params = new URLSearchParams({
        source: skill.source,
        skillId: skill.importId || skill.id,
      });
      if (skill.url) params.set("skillUrl", skill.url);

      const res = await fetch(`/api/skill-hub/readme?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load SKILL.md");
      }

      const markdown =
        typeof data.markdown === "string"
          ? data.markdown
          : "No SKILL.md content available.";
      const { body, frontmatter } = parseFrontmatter(markdown);
      const rendered = marked.parse(escapeRawHtml(body), {
        gfm: true,
        breaks: true,
      });

      skillPreviewDialog = {
        ...skillPreviewDialog,
        loading: false,
        error: null,
        sourceRepoUrl:
          typeof data.sourceRepoUrl === "string" && data.sourceRepoUrl
            ? data.sourceRepoUrl
            : skillPreviewDialog.sourceRepoUrl,
        sourceMarkdown: markdown,
        renderedHtml: sanitizeRenderedHtml(String(rendered)),
        frontmatter,
      };
    } catch (error) {
      skillPreviewDialog = {
        ...skillPreviewDialog,
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load SKILL.md",
      };
    }
  }

  async function importSkill(skill: DiscoverSkill) {
    const key = getSkillKey(skill);
    importStates = { ...importStates, [key]: { status: "importing" } };
    try {
      const res = await fetch("/api/skill-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: skill.importId || skill.id,
          source: skill.source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to import");
      importStates = {
        ...importStates,
        [key]: { status: "success", message: data.message || "Imported" },
      };
    } catch (error) {
      importStates = {
        ...importStates,
        [key]: {
          status: "error",
          message: error instanceof Error ? error.message : "Failed to import",
        },
      };
    }
  }

  $effect(() => {
    const activeSkills = hasActiveSearch
      ? searchResults
      : combinedPreviewResults;
    const limit = hasActiveSearch ? 24 : 16;
    for (const skill of activeSkills.slice(0, limit)) {
      void fetchSkillCardMetadata(skill);
    }
  });

  onMount(async () => {
    await loadSourcePreviews();
  });
</script>

<svelte:head>
  <title>Skill Hub - OpenViber</title>
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
    <div class="space-y-4">
      <header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-2xl font-semibold text-foreground">Skill Hub</h1>
          <a
            href="https://github.com/VoltAgent/awesome-openclaw-skills"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse curated list
            <ExternalLink class="size-3.5" />
          </a>
        </div>
        <p class="text-sm text-muted-foreground mt-1">
          Discover OpenClaw-compatible skills from the curated catalog.
        </p>
      </header>

      <section class="px-1">
        <div class="flex flex-wrap items-center gap-2">
          {#if hasCategories}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="h-9 rounded-md border border-input bg-background px-3 text-sm inline-flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
                aria-label="Select category"
              >
                <span class="max-w-[180px] truncate">
                  {selectedCategoryTag
                    ? (categories.find((c) => c.tag === selectedCategoryTag)
                        ?.name ?? "All categories")
                    : "All categories"}
                </span>
                <ChevronDown class="size-3.5 text-muted-foreground shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                sideOffset={6}
                align="start"
                class="max-h-72 overflow-y-auto min-w-48 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => handleCategoryChange("")}
                >
                  All categories
                  {#if !selectedCategoryTag}<Check
                      class="size-4 ml-auto text-primary"
                    />{/if}
                </DropdownMenuItem>
                {#each categories as category (category.tag)}
                  <DropdownMenuItem
                    class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                    onSelect={() => handleCategoryChange(category.tag)}
                  >
                    <span class="flex-1">{category.name}</span>
                    <span class="text-xs text-muted-foreground"
                      >{category.count}</span
                    >
                    {#if selectedCategoryTag === category.tag}<Check
                        class="size-4 ml-auto text-primary"
                      />{/if}
                  </DropdownMenuItem>
                {/each}
              </DropdownMenuContent>
            </DropdownMenu>
          {/if}

          <label class="sr-only" for="hub-search">Search skills</label>
          <div class="relative min-w-[180px] flex-1">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="hub-search"
              type="search"
              bind:value={query}
              onkeydown={handleSearchKeydown}
              placeholder="Search skills..."
              class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            />
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => {
                void runSearch(1);
              }}
              disabled={searchLoading}
              class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {#if searchLoading}
                <Loader2 class="size-4 animate-spin" />
                Searching...
              {:else}
                <Search class="size-4" />
                Search
              {/if}
            </button>
            {#if hasActiveSearch}
              <button
                type="button"
                onclick={clearSearch}
                class="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X class="size-4" />
                Clear
              </button>
            {/if}
          </div>
        </div>
      </section>

      {#if hasActiveSearch}
        <section class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-foreground">
                Results for "{lastSearchQuery}"
              </h2>
              <p class="text-xs text-muted-foreground">
                {total} result{total === 1 ? "" : "s"} • page {page} of
                {Math.max(totalPages, 1)}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <label class="sr-only" for="hub-sort">Sort</label>
              <select
                id="hub-sort"
                bind:value={sortOrder}
                onchange={handleSortChange}
                class="h-8 rounded-md border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                <option value="relevance">Sort: Relevance</option>
                <option value="popularity">Sort: Popularity</option>
                <option value="recent">Sort: Recent</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </div>

          {#if searchError}
            <div
              class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2"
            >
              <AlertCircle class="size-4 shrink-0" />
              {searchError}
            </div>
          {:else if searchLoading && searchResults.length === 0}
            <div class="flex items-center justify-center py-12">
              <Loader2 class="size-8 animate-spin text-muted-foreground/60" />
            </div>
          {:else if searchResults.length === 0}
            <div
              class="rounded-xl border border-dashed border-border p-8 text-center"
            >
              <Sparkles class="mx-auto mb-3 size-10 text-muted-foreground/50" />
              <p class="text-sm text-muted-foreground">
                No skills found for this query.
              </p>
            </div>
          {:else}
            <div class="grid gap-4 lg:grid-cols-2">
              {#each searchResults as skill (getSkillKey(skill))}
                {@const importState = importStates[getSkillKey(skill)]}
                {@const isImporting = importState?.status === "importing"}
                {@const isImported = importState?.status === "success"}
                {@const hasError = importState?.status === "error"}
                <div class="rounded-xl border border-border bg-card p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex flex-1 items-start gap-3">
                      <div
                        class="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 text-base"
                      >
                        {getSkillEmoji(skill) || "🧩"}
                      </div>
                      <div class="min-w-0 flex-1">
                        <h3 class="text-sm font-semibold text-card-foreground">
                          {getSkillName(skill)}
                        </h3>
                        {#if getSkillDescription(skill)}
                          <p
                            class="mt-1 text-sm text-muted-foreground skill-description"
                          >
                            {getSkillDescription(skill)}
                          </p>
                        {/if}
                      </div>
                    </div>
                    {#if skill.category}
                      <span
                        class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shrink-0"
                      >
                        {skill.category}
                      </span>
                    {/if}
                  </div>
                  <div
                    class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                  >
                    <span>{skill.author}</span>
                    <span>v{getSkillVersion(skill)}</span>
                    {#if skill.updatedAt}
                      <span>• {formatDate(skill.updatedAt)}</span>
                    {/if}
                    {#if getUserInvocable(skill)}
                      <span
                        class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600"
                      >
                        user-invocable
                      </span>
                    {/if}
                    {#each getSkillTags(skill) as tag (tag)}
                      <span
                        class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                      >
                        {tag}
                      </span>
                    {/each}
                  </div>
                  <div class="mt-3 flex flex-wrap items-center gap-3">
                    {#if authenticated}
                      <button
                        type="button"
                        onclick={() => importSkill(skill)}
                        disabled={isImporting || isImported}
                        class="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {#if isImported}
                          <CheckCircle class="size-3.5" />
                          Imported
                        {:else if isImporting}
                          <Loader2 class="size-3.5 animate-spin" />
                          Importing...
                        {:else if hasError}
                          <Download class="size-3.5" />
                          Retry
                        {:else}
                          <Download class="size-3.5" />
                          Import
                        {/if}
                      </button>
                    {:else}
                      <a
                        href="/login?redirect=/hub"
                        class="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Download class="size-3.5" />
                        Sign in to import
                      </a>
                    {/if}
                    <button
                      type="button"
                      onclick={() => openSkillPreview(skill)}
                      class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <BookText class="size-3.5" />
                      SKILL.md
                    </button>
                    {#if getGitHubRepoUrl(skill)}
                      <a
                        href={getGitHubRepoUrl(skill)}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink class="size-3.5" />
                        GitHub
                      </a>
                    {/if}
                  </div>
                  {#if importState?.message}
                    <p
                      class="mt-2 text-xs {hasError
                        ? 'text-destructive'
                        : 'text-muted-foreground'}"
                    >
                      {importState.message}
                    </p>
                  {/if}
                </div>
              {/each}
            </div>

            {#if totalPages > 1}
              <Pagination.Pagination
                count={total}
                perPage={SEARCH_LIMIT}
                {page}
                onPageChange={(p) => {
                  void runSearch(p);
                }}
                siblingCount={1}
              >
                {#snippet children({ pages, currentPage })}
                  <Pagination.PaginationContent>
                    <Pagination.PaginationItem>
                      <Pagination.PaginationPrevious />
                    </Pagination.PaginationItem>
                    {#each pages as p (p.key)}
                      {#if p.type === "ellipsis"}
                        <Pagination.PaginationItem>
                          <Pagination.PaginationEllipsis />
                        </Pagination.PaginationItem>
                      {:else}
                        <Pagination.PaginationItem>
                          <Pagination.PaginationLink
                            page={p}
                            isActive={currentPage === p.value}
                          >
                            {p.value}
                          </Pagination.PaginationLink>
                        </Pagination.PaginationItem>
                      {/if}
                    {/each}
                    <Pagination.PaginationItem>
                      <Pagination.PaginationNext />
                    </Pagination.PaginationItem>
                  </Pagination.PaginationContent>
                {/snippet}
              </Pagination.Pagination>
            {/if}
          {/if}
        </section>
      {:else}
        <section class="space-y-4">
          {#if previewLoading && combinedPreviewResults.length === 0}
            <div class="flex items-center justify-center py-12">
              <Loader2 class="size-8 animate-spin text-muted-foreground/60" />
            </div>
          {:else}
            {#if previewState.error}
              <div
                class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {previewState.error}
              </div>
            {/if}

            {#if combinedPreviewResults.length === 0}
              <div
                class="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
              >
                No skills returned.
              </div>
            {:else}
              <div class="grid gap-4 lg:grid-cols-2">
                {#each combinedPreviewResults as skill (getSkillKey(skill))}
                  {@const importState = importStates[getSkillKey(skill)]}
                  {@const isImporting = importState?.status === "importing"}
                  {@const isImported = importState?.status === "success"}
                  {@const hasError = importState?.status === "error"}
                  <div class="rounded-xl border border-border bg-card p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex flex-1 items-start gap-3">
                        <div
                          class="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 text-base"
                        >
                          {getSkillEmoji(skill) || "🧩"}
                        </div>
                        <div class="min-w-0 flex-1">
                          <h3
                            class="text-sm font-semibold text-card-foreground"
                          >
                            {getSkillName(skill)}
                          </h3>
                          {#if getSkillDescription(skill)}
                            <p
                              class="mt-1 text-sm text-muted-foreground skill-description"
                            >
                              {getSkillDescription(skill)}
                            </p>
                          {/if}
                        </div>
                      </div>
                      {#if skill.category}
                        <span
                          class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground shrink-0"
                        >
                          {skill.category}
                        </span>
                      {/if}
                    </div>
                    <div
                      class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span>{skill.author}</span>
                      <span>v{getSkillVersion(skill)}</span>
                      {#if skill.updatedAt}
                        <span>• {formatDate(skill.updatedAt)}</span>
                      {/if}
                      {#if getUserInvocable(skill)}
                        <span
                          class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600"
                        >
                          user-invocable
                        </span>
                      {/if}
                      {#each getSkillTags(skill) as tag (tag)}
                        <span
                          class="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                        >
                          {tag}
                        </span>
                      {/each}
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-3">
                      {#if authenticated}
                        <button
                          type="button"
                          onclick={() => importSkill(skill)}
                          disabled={isImporting || isImported}
                          class="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {#if isImported}
                            <CheckCircle class="size-3.5" />
                            Imported
                          {:else if isImporting}
                            <Loader2 class="size-3.5 animate-spin" />
                            Importing...
                          {:else if hasError}
                            <Download class="size-3.5" />
                            Retry
                          {:else}
                            <Download class="size-3.5" />
                            Import
                          {/if}
                        </button>
                      {:else}
                        <a
                          href="/login?redirect=/hub"
                          class="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Download class="size-3.5" />
                          Sign in to import
                        </a>
                      {/if}
                      <button
                        type="button"
                        onclick={() => openSkillPreview(skill)}
                        class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <BookText class="size-3.5" />
                        SKILL.md
                      </button>
                      {#if getGitHubRepoUrl(skill)}
                        <a
                          href={getGitHubRepoUrl(skill)}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink class="size-3.5" />
                          GitHub
                        </a>
                      {/if}
                    </div>
                    {#if importState?.message}
                      <p
                        class="mt-2 text-xs {hasError
                          ? 'text-destructive'
                          : 'text-muted-foreground'}"
                      >
                        {importState.message}
                      </p>
                    {/if}
                  </div>
                {/each}
              </div>

              {#if previewState.totalPages > 1}
                <Pagination.Pagination
                  count={previewState.total}
                  perPage={BROWSE_LIMIT}
                  page={previewState.page}
                  onPageChange={(p) => {
                    void loadSourcePreviews(p);
                  }}
                  siblingCount={1}
                >
                  {#snippet children({ pages, currentPage })}
                    <Pagination.PaginationContent>
                      <Pagination.PaginationItem>
                        <Pagination.PaginationPrevious />
                      </Pagination.PaginationItem>
                      {#each pages as p (p.key)}
                        {#if p.type === "ellipsis"}
                          <Pagination.PaginationItem>
                            <Pagination.PaginationEllipsis />
                          </Pagination.PaginationItem>
                        {:else}
                          <Pagination.PaginationItem>
                            <Pagination.PaginationLink
                              page={p}
                              isActive={currentPage === p.value}
                            >
                              {p.value}
                            </Pagination.PaginationLink>
                          </Pagination.PaginationItem>
                        {/if}
                      {/each}
                      <Pagination.PaginationItem>
                        <Pagination.PaginationNext />
                      </Pagination.PaginationItem>
                    </Pagination.PaginationContent>
                  {/snippet}
                </Pagination.Pagination>
              {/if}
            {/if}
          {/if}
        </section>
      {/if}
    </div>
  </div>
</div>

<Dialog.Root bind:open={skillPreviewDialog.open}>
  <Dialog.Content
    class="w-[min(90vw,1500px)] max-w-none sm:max-w-none h-[90vh] flex flex-col gap-0 p-0"
  >
    <Dialog.Header class="px-5 pt-4 pb-3 border-b border-border">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <Dialog.Title class="truncate"
            >{skillPreviewDialog.title} - SKILL.md</Dialog.Title
          >
          <Dialog.Description class="sr-only">
            Review skill instructions before importing.
          </Dialog.Description>
        </div>
        <div class="flex items-center gap-3 shrink-0 mr-8">
          {#if skillPreviewDialog.skill}
            {@const dialogSkill = skillPreviewDialog.skill}
            {@const dialogKey = getSkillKey(dialogSkill)}
            {@const dialogImportState = importStates[dialogKey]}
            {@const dialogImporting = dialogImportState?.status === "importing"}
            {@const dialogImported = dialogImportState?.status === "success"}
            {@const dialogHasError = dialogImportState?.status === "error"}
            {#if authenticated}
              <button
                type="button"
                onclick={() => importSkill(dialogSkill)}
                disabled={dialogImporting || dialogImported}
                class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {#if dialogImported}
                  <CheckCircle class="size-3.5" />
                  Imported
                {:else if dialogImporting}
                  <Loader2 class="size-3.5 animate-spin" />
                  Importing...
                {:else if dialogHasError}
                  <Download class="size-3.5" />
                  Retry
                {:else}
                  <Download class="size-3.5" />
                  Import
                {/if}
              </button>
            {:else}
              <a
                href="/login?redirect=/hub"
                class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Download class="size-3.5" />
                Sign in to import
              </a>
            {/if}
          {/if}
          {#if skillPreviewDialog.sourceRepoUrl}
            <a
              href={skillPreviewDialog.sourceRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github class="size-3.5" />
              GitHub
            </a>
          {/if}
          <div
            class="inline-flex rounded-md border border-border bg-muted/30 p-0.5"
          >
            <button
              type="button"
              onclick={() => {
                skillPreviewTab = "preview";
              }}
              class="rounded px-2.5 py-1 text-xs transition-colors {skillPreviewTab ===
              'preview'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              Preview
            </button>
            <button
              type="button"
              onclick={() => {
                skillPreviewTab = "source";
              }}
              class="rounded px-2.5 py-1 text-xs transition-colors {skillPreviewTab ===
              'source'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              Source
            </button>
          </div>
        </div>
      </div>
    </Dialog.Header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      {#if skillPreviewDialog.loading}
        <div class="flex items-center justify-center py-10">
          <Loader2 class="size-6 animate-spin text-muted-foreground" />
        </div>
      {:else if skillPreviewDialog.error}
        <div
          class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2"
        >
          <AlertCircle class="size-4 shrink-0" />
          {skillPreviewDialog.error}
        </div>
      {:else if skillPreviewTab === "preview"}
        <article class="skill-md-renderer text-sm text-foreground">
          {@html skillPreviewDialog.renderedHtml}
        </article>
      {:else}
        <pre
          class="rounded-lg border border-border bg-muted/20 p-4 text-xs text-foreground overflow-x-auto whitespace-pre-wrap wrap-break-word"><code
            >{skillPreviewDialog.sourceMarkdown}</code
          ></pre>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.skill-md-renderer h1),
  :global(.skill-md-renderer h2),
  :global(.skill-md-renderer h3) {
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  :global(.skill-md-renderer p),
  :global(.skill-md-renderer ul),
  :global(.skill-md-renderer ol),
  :global(.skill-md-renderer pre) {
    margin: 0.5rem 0;
  }

  :global(.skill-md-renderer ul),
  :global(.skill-md-renderer ol) {
    padding-left: 1.25rem;
  }

  :global(.skill-md-renderer code) {
    background: hsl(var(--muted));
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
  }

  :global(.skill-md-renderer pre code) {
    display: block;
    padding: 0.75rem;
    overflow-x: auto;
  }

  :global(.skill-md-renderer a) {
    color: hsl(var(--primary));
    text-decoration: underline;
  }

  .skill-description {
    display: -webkit-box;
    line-clamp: 3;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.25rem;
    min-height: 3.75rem;
  }
</style>
