<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    Check,
    ExternalLink,
    Eye,
    EyeOff,
    Globe,
    Key,
    Loader2,
    Puzzle,
    Save,
    Settings,
    Shield,
  } from "@lucide/svelte";

  interface SourceConfig {
    enabled: boolean;
    url?: string;
    apiKey?: string;
    displayName: string;
    description: string;
    defaultUrl: string;
    urlLabel: string;
    apiKeyLabel: string;
    apiKeyEnvVar: string;
    docsUrl: string;
  }

  let sources = $state<Record<string, SourceConfig>>({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let revealedKeys = $state<Set<string>>(new Set());

  let editSources = $state<Record<string, { enabled: boolean; url: string; apiKey: string }>>({});

  function initEditState(src: Record<string, SourceConfig>) {
    const edit: Record<string, { enabled: boolean; url: string; apiKey: string }> = {};
    for (const [key, cfg] of Object.entries(src)) {
      edit[key] = {
        enabled: cfg.enabled,
        url: cfg.url || "",
        apiKey: cfg.apiKey || "",
      };
    }
    editSources = edit;
  }

  async function fetchSettings() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load settings");
      }
      const data = await res.json();
      sources = data.sources ?? {};
      initEditState(sources);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      loading = false;
    }
  }

  async function saveSettings() {
    saving = true;
    error = null;
    successMessage = null;
    try {
      const payload: Record<string, { enabled: boolean; url?: string; apiKey?: string }> = {};
      for (const [key, edit] of Object.entries(editSources)) {
        payload[key] = {
          enabled: edit.enabled,
          url: edit.url || undefined,
          apiKey: edit.apiKey || undefined,
        };
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      successMessage = "Settings saved successfully";
      await fetchSettings();

      setTimeout(() => {
        successMessage = null;
      }, 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save settings";
    } finally {
      saving = false;
    }
  }

  function toggleRevealKey(key: string) {
    const next = new Set(revealedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    revealedKeys = next;
  }

  function toggleSource(key: string) {
    if (editSources[key]) {
      editSources[key].enabled = !editSources[key].enabled;
    }
  }

  const enabledCount = $derived(
    Object.values(editSources).filter((s) => s.enabled).length,
  );

  const hasChanges = $derived.by(() => {
    for (const [key, edit] of Object.entries(editSources)) {
      const orig = sources[key];
      if (!orig) continue;
      if (edit.enabled !== orig.enabled) return true;
      if ((edit.url || "") !== (orig.url || "")) return true;
      if (edit.apiKey && edit.apiKey !== (orig.apiKey || "")) return true;
    }
    return false;
  });

  onMount(() => {
    fetchSettings();
  });
</script>

<svelte:head>
  <title>Settings - OpenViber</title>
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center gap-3 mb-2">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
          <Settings class="size-5 text-primary" />
        </div>
        <div>
          <h1 class="text-2xl font-semibold text-foreground">General</h1>
          <p class="text-sm text-muted-foreground">
            Configure your OpenViber instance
          </p>
        </div>
      </div>
    </header>

    {#if error}
      <div
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3 mb-6"
      >
        <AlertCircle class="size-5 text-destructive shrink-0" />
        <p class="text-sm text-destructive">{error}</p>
      </div>
    {/if}

    {#if successMessage}
      <div
        class="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 flex items-center gap-3 mb-6 animate-in fade-in slide-in-from-top-1 duration-200"
      >
        <Check class="size-5 text-emerald-600 shrink-0" />
        <p class="text-sm text-emerald-700 dark:text-emerald-400">{successMessage}</p>
      </div>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="animate-pulse flex flex-col items-center gap-3">
          <Loader2 class="size-8 text-muted-foreground/50 animate-spin" />
          <p class="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    {:else}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2.5">
            <Puzzle class="size-5 text-muted-foreground" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">Skill Sources</h2>
              <p class="text-sm text-muted-foreground">
                Choose where to discover and import skills from.
                {enabledCount} of {Object.keys(editSources).length} sources enabled.
              </p>
            </div>
          </div>
          <button
            type="button"
            onclick={saveSettings}
            disabled={saving || !hasChanges}
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if saving}
              <Loader2 class="size-4 animate-spin" />
              Saving...
            {:else}
              <Save class="size-4" />
              Save Changes
            {/if}
          </button>
        </div>

        <div class="space-y-3">
          {#each Object.entries(editSources) as [key, edit] (key)}
            {@const meta = sources[key]}
            {#if meta}
              <div
                class="rounded-xl border transition-all duration-200 {edit.enabled
                  ? 'border-border bg-card shadow-sm'
                  : 'border-border/60 bg-card/50'}"
              >
                <div class="flex items-start gap-4 p-4">
                  <button
                    type="button"
                    onclick={() => toggleSource(key)}
                    role="switch"
                    aria-checked={edit.enabled}
                    class="mt-0.5 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background {edit.enabled
                      ? 'bg-primary'
                      : 'bg-input'}"
                  >
                    <span
                      class="pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 {edit.enabled
                        ? 'translate-x-5'
                        : 'translate-x-0'}"
                    />
                  </button>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="text-base font-semibold text-foreground {!edit.enabled ? 'opacity-60' : ''}">
                        {meta.displayName}
                      </h3>
                      {#if meta.docsUrl}
                        <a
                          href={meta.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-muted-foreground hover:text-foreground transition-colors"
                          title="Open documentation"
                        >
                          <ExternalLink class="size-3.5" />
                        </a>
                      {/if}
                    </div>
                    <p class="text-sm text-muted-foreground {!edit.enabled ? 'opacity-50' : ''}">
                      {meta.description}
                    </p>
                  </div>

                  <div class="shrink-0">
                    {#if edit.enabled}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span class="size-1.5 rounded-full bg-emerald-500"></span>
                        Enabled
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        <span class="size-1.5 rounded-full bg-muted-foreground/40"></span>
                        Disabled
                      </span>
                    {/if}
                  </div>
                </div>

                {#if edit.enabled}
                  <div class="border-t border-border/50 px-4 py-3 bg-muted/20">
                    <div class="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          for="url-{key}"
                          class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5"
                        >
                          <Globe class="size-3.5" />
                          {meta.urlLabel || "API URL"}
                        </label>
                        <input
                          id="url-{key}"
                          type="url"
                          bind:value={edit.url}
                          placeholder={meta.defaultUrl}
                          class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
                        />
                        <p class="mt-1 text-[11px] text-muted-foreground/60">
                          Leave empty to use default: {meta.defaultUrl}
                        </p>
                      </div>

                      {#if meta.apiKeyLabel}
                        <div>
                          <label
                            for="key-{key}"
                            class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5"
                          >
                            <Key class="size-3.5" />
                            {meta.apiKeyLabel}
                          </label>
                          <div class="relative">
                            <input
                              id="key-{key}"
                              type={revealedKeys.has(key) ? "text" : "password"}
                              bind:value={edit.apiKey}
                              placeholder={meta.apiKeyEnvVar
                                ? `Or set ${meta.apiKeyEnvVar} env var`
                                : "Enter API key"}
                              class="w-full h-9 rounded-md border border-input bg-background px-3 pr-10 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background font-mono"
                            />
                            <button
                              type="button"
                              onclick={() => toggleRevealKey(key)}
                              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              title={revealedKeys.has(key) ? "Hide" : "Reveal"}
                            >
                              {#if revealedKeys.has(key)}
                                <EyeOff class="size-4" />
                              {:else}
                                <Eye class="size-4" />
                              {/if}
                            </button>
                          </div>
                          {#if meta.apiKeyEnvVar}
                            <p class="mt-1 text-[11px] text-muted-foreground/60">
                              Alternatively, set the <code class="rounded bg-muted px-1 py-0.5 text-[10px]">{meta.apiKeyEnvVar}</code> environment variable
                            </p>
                          {/if}
                        </div>
                      {:else}
                        <div class="flex items-end">
                          <div class="flex items-center gap-2 text-xs text-muted-foreground/60 pb-1">
                            <Shield class="size-3.5" />
                            No authentication required
                          </div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </section>

      <section class="rounded-xl border border-dashed border-border/70 p-6 text-center mb-8">
        <Puzzle class="size-8 text-muted-foreground/40 mx-auto mb-3" />
        <h3 class="text-sm font-medium text-foreground mb-1">Want to add a custom skill source?</h3>
        <p class="text-sm text-muted-foreground max-w-md mx-auto mb-3">
          You can also import skills directly from the CLI using <code class="rounded bg-muted px-1.5 py-0.5 text-xs">openviber skill import</code> with any GitHub URL, npm package, or registry.
        </p>
        <div class="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <code class="rounded bg-muted px-2 py-1">openviber skill search "web scraping"</code>
          <code class="rounded bg-muted px-2 py-1">openviber skill import owner/repo</code>
        </div>
      </section>
    {/if}
  </div>
</div>
