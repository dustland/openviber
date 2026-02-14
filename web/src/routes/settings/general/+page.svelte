<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    Check,
    ChevronDown,
    ChevronUp,
    Cpu,
    ExternalLink,
    Globe,
    Key,
    Loader2,
    Save,
    Settings,
    Shield,
    Terminal,
  } from "@lucide/svelte";

  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // ── AI Providers ──────────────────────────────────────────────────────
  interface AiProviderMeta {
    displayName: string;
    description: string;
    apiKeyPlaceholder: string;
    apiKeyEnvVar: string;
    docsUrl: string;
    defaultBaseUrl: string;
  }

  interface AiProviderState {
    apiKey: string;
    baseUrl: string;
    meta: AiProviderMeta;
  }

  let aiProviders = $state<Record<string, AiProviderState>>({});
  let savedAiProviders = $state<
    Record<string, { apiKey: string; baseUrl: string }>
  >({});
  let expandedProviders = $state<Set<string>>(new Set());

  const MASKED = "••••••";

  // ── Chat model ────────────────────────────────────────────────────────
  let chatModel = $state<string | null>(null);
  let editChatModel = $state("");

  const MODEL_OPTIONS = [
    { id: "", label: "Default (let agent choose)" },
    // Flagship
    { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
    { id: "openai/gpt-5.3", label: "GPT-5.3" },
    { id: "google/gemini-3.0-pro", label: "Gemini 3.0 Pro" },
    // Fast
    { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
    { id: "google/gemini-3.0-flash", label: "Gemini 3.0 Flash" },
    { id: "openai/gpt-5.3-mini", label: "GPT-5.3 Mini" },
    // Value (Chinese)
    { id: "deepseek/deepseek-v3.2", label: "DeepSeek 3.2" },
    { id: "zhipu/glm-4.7", label: "GLM-4.7" },
    { id: "qwen/qwen-3.5-max", label: "Qwen 3.5 Max" },
    // Reasoning
    { id: "deepseek/deepseek-r2", label: "DeepSeek R2" },
    { id: "openai/o4-pro", label: "o4 Pro" },
  ];

  // ── Primary coding CLI ────────────────────────────────────────────────
  let primaryCodingCli = $state<string | null>(null);
  let editPrimaryCodingCli = $state("");
  let codingCliOptions = $state<{ id: string; label: string }[]>([]);

  // ── Timezone ──────────────────────────────────────────────────────────
  let timezone = $state<string | null>(null);
  let editTimezone = $state("");

  // ── Network Proxy ─────────────────────────────────────────────────────
  let proxyUrl = $state<string | null>(null);
  let editProxyUrl = $state("");
  let proxyEnabled = $state(false);
  let editProxyEnabled = $state(false);

  const POPULAR_TIMEZONES = [
    { id: "", label: "Auto-detect from browser" },
    { id: "America/New_York", label: "Eastern (New York)" },
    { id: "America/Chicago", label: "Central (Chicago)" },
    { id: "America/Denver", label: "Mountain (Denver)" },
    { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
    { id: "Europe/London", label: "London (GMT/BST)" },
    { id: "Europe/Paris", label: "Central Europe (Paris)" },
    { id: "Europe/Berlin", label: "Central Europe (Berlin)" },
    { id: "Asia/Tokyo", label: "Tokyo (JST)" },
    { id: "Asia/Shanghai", label: "Shanghai (CST)" },
    { id: "Asia/Singapore", label: "Singapore (SGT)" },
    { id: "Asia/Kolkata", label: "India (IST)" },
    { id: "Asia/Dubai", label: "Dubai (GST)" },
    { id: "Australia/Sydney", label: "Sydney (AEST)" },
    { id: "Pacific/Auckland", label: "Auckland (NZST)" },
  ];

  // ── Change tracking ───────────────────────────────────────────────────
  const hasChanges = $derived(
    (editPrimaryCodingCli || null) !== (primaryCodingCli ?? null) ||
      (editChatModel || null) !== (chatModel ?? null) ||
      (editTimezone || null) !== (timezone ?? null) ||
      (editProxyUrl || null) !== (proxyUrl ?? null) ||
      editProxyEnabled !== proxyEnabled ||
      hasAiProviderChanges(),
  );

  function hasAiProviderChanges(): boolean {
    for (const [key, state] of Object.entries(aiProviders)) {
      const saved = savedAiProviders[key];
      if (!saved) {
        if (state.apiKey || state.baseUrl) return true;
        continue;
      }
      if (state.apiKey !== saved.apiKey) return true;
      if (state.baseUrl !== saved.baseUrl) return true;
    }
    return false;
  }

  function toggleProvider(key: string) {
    const next = new Set(expandedProviders);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    expandedProviders = next;
  }

  function providerHasKey(key: string): boolean {
    const p = aiProviders[key];
    return !!p && !!p.apiKey && p.apiKey !== "";
  }

  // ── Data fetching ─────────────────────────────────────────────────────
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

      // AI providers
      if (data.aiProviders) {
        const providers: Record<string, AiProviderState> = {};
        const saved: Record<string, { apiKey: string; baseUrl: string }> = {};
        for (const [key, value] of Object.entries(data.aiProviders) as [
          string,
          any,
        ][]) {
          providers[key] = {
            apiKey: value.apiKey || "",
            baseUrl: value.baseUrl || "",
            meta: {
              displayName: value.displayName,
              description: value.description,
              apiKeyPlaceholder: value.apiKeyPlaceholder,
              apiKeyEnvVar: value.apiKeyEnvVar,
              docsUrl: value.docsUrl,
              defaultBaseUrl: value.defaultBaseUrl,
            },
          };
          saved[key] = {
            apiKey: value.apiKey || "",
            baseUrl: value.baseUrl || "",
          };
        }
        aiProviders = providers;
        savedAiProviders = saved;
      }

      primaryCodingCli = data.primaryCodingCli ?? null;
      editPrimaryCodingCli = primaryCodingCli ?? "";
      codingCliOptions = data.codingCliOptions ?? [];
      chatModel = data.chatModel ?? null;
      editChatModel = chatModel ?? "";
      timezone = data.timezone ?? null;
      editTimezone = timezone ?? "";
      proxyUrl = data.proxyUrl ?? null;
      editProxyUrl = proxyUrl ?? "";
      proxyEnabled = data.proxyEnabled ?? false;
      editProxyEnabled = proxyEnabled;
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
      // Build AI providers payload
      const aiProvidersPayload: Record<
        string,
        { apiKey?: string; baseUrl?: string }
      > = {};
      for (const [key, state] of Object.entries(aiProviders)) {
        const saved = savedAiProviders[key];
        const hasKeyChange = state.apiKey !== (saved?.apiKey ?? "");
        const hasUrlChange = state.baseUrl !== (saved?.baseUrl ?? "");
        if (hasKeyChange || hasUrlChange) {
          aiProvidersPayload[key] = {};
          if (hasKeyChange) aiProvidersPayload[key].apiKey = state.apiKey;
          if (hasUrlChange) aiProvidersPayload[key].baseUrl = state.baseUrl;
        }
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryCodingCli: editPrimaryCodingCli || null,
          chatModel: editChatModel || null,
          timezone: editTimezone || null,
          proxyUrl: editProxyUrl || null,
          proxyEnabled: editProxyEnabled,
          ...(Object.keys(aiProvidersPayload).length > 0
            ? { aiProviders: aiProvidersPayload }
            : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }

      // Sync saved state
      primaryCodingCli = editPrimaryCodingCli || null;
      chatModel = editChatModel || null;
      timezone = editTimezone || null;
      proxyUrl = editProxyUrl || null;
      proxyEnabled = editProxyEnabled;
      for (const [key, state] of Object.entries(aiProviders)) {
        savedAiProviders[key] = {
          apiKey: state.apiKey,
          baseUrl: state.baseUrl,
        };
        // If we just set a key, it comes back masked
        if (state.apiKey && state.apiKey !== MASKED) {
          aiProviders[key] = { ...state, apiKey: MASKED };
          savedAiProviders[key] = { ...savedAiProviders[key], apiKey: MASKED };
        }
      }

      successMessage = "Settings saved";
      setTimeout(() => (successMessage = null), 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save settings";
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    fetchSettings();
  });
</script>

<svelte:head>
  <title>General — Settings — OpenViber</title>
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="w-full px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center size-10 rounded-lg bg-primary/10"
        >
          <Settings class="size-5 text-primary" />
        </div>
        <div>
          <h1 class="text-2xl font-semibold text-foreground">General</h1>
          <p class="text-sm text-muted-foreground">
            Core settings for your OpenViber instance
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
        class="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 flex items-center gap-3 mb-6"
      >
        <Check class="size-5 text-emerald-600 shrink-0" />
        <p class="text-sm text-emerald-700 dark:text-emerald-400">
          {successMessage}
        </p>
      </div>
    {/if}

    {#if loading}
      <div class="flex items-center justify-center py-20">
        <div class="flex flex-col items-center gap-3">
          <Loader2 class="size-8 text-muted-foreground/50 animate-spin" />
          <p class="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    {:else}
      <div class="space-y-8">
        <!-- ── AI Provider API Keys ──────────────────────────────────── -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <Key class="size-5 text-muted-foreground" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">
                AI Provider API Keys
              </h2>
              <p class="text-sm text-muted-foreground">
                Configure API keys for the AI models your vibers will use. At
                least one provider is required.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            {#each Object.entries(aiProviders) as [key, provider] (key)}
              <div
                class="rounded-xl border border-border bg-card overflow-hidden"
              >
                <!-- Provider header (always visible) -->
                <button
                  type="button"
                  class="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                  onclick={() => toggleProvider(key)}
                >
                  <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm text-foreground">
                        {provider.meta.displayName}
                      </span>
                      {#if providerHasKey(key)}
                        <span
                          class="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                        >
                          Configured
                        </span>
                      {/if}
                    </div>
                    <span
                      class="text-xs text-muted-foreground hidden sm:inline"
                    >
                      {provider.meta.description}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    {#if expandedProviders.has(key)}
                      <ChevronUp class="size-4 text-muted-foreground" />
                    {:else}
                      <ChevronDown class="size-4 text-muted-foreground" />
                    {/if}
                  </div>
                </button>

                <!-- Provider details (expanded) -->
                {#if expandedProviders.has(key)}
                  <div class="border-t border-border px-4 py-4 space-y-4">
                    <p class="text-xs text-muted-foreground sm:hidden mb-3">
                      {provider.meta.description}
                    </p>

                    <!-- API Key -->
                    <div>
                      <label
                        for="ai-key-{key}"
                        class="block text-xs font-medium text-muted-foreground mb-1.5"
                      >
                        API Key
                      </label>
                      <div class="flex gap-2">
                        <input
                          id="ai-key-{key}"
                          type="password"
                          placeholder={provider.meta.apiKeyPlaceholder}
                          value={provider.apiKey}
                          oninput={(e) => {
                            aiProviders[key] = {
                              ...aiProviders[key],
                              apiKey: (e.target as HTMLInputElement).value,
                            };
                          }}
                          onfocus={(e) => {
                            if (
                              (e.target as HTMLInputElement).value === MASKED
                            ) {
                              aiProviders[key] = {
                                ...aiProviders[key],
                                apiKey: "",
                              };
                            }
                          }}
                          class="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
                        />
                      </div>
                      <div class="flex items-center gap-3 mt-1.5">
                        {#if provider.meta.apiKeyEnvVar}
                          <p class="text-[11px] text-muted-foreground/60">
                            Or set via <code
                              class="rounded bg-muted px-1 py-0.5 text-[10px]"
                              >{provider.meta.apiKeyEnvVar}</code
                            > env var
                          </p>
                        {/if}
                        {#if provider.meta.docsUrl}
                          <a
                            href={provider.meta.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            Get API key
                            <ExternalLink class="size-3" />
                          </a>
                        {/if}
                      </div>
                    </div>

                    <!-- Base URL (optional) -->
                    <div>
                      <label
                        for="ai-url-{key}"
                        class="block text-xs font-medium text-muted-foreground mb-1.5"
                      >
                        Base URL
                        <span class="font-normal text-muted-foreground/60"
                          >(optional — for proxies or self-hosted)</span
                        >
                      </label>
                      <input
                        id="ai-url-{key}"
                        type="url"
                        placeholder={provider.meta.defaultBaseUrl}
                        value={provider.baseUrl}
                        oninput={(e) => {
                          aiProviders[key] = {
                            ...aiProviders[key],
                            baseUrl: (e.target as HTMLInputElement).value,
                          };
                        }}
                        class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
                      />
                      <p class="mt-1 text-[11px] text-muted-foreground/60">
                        Leave empty to use the default endpoint: {provider.meta
                          .defaultBaseUrl}
                      </p>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <!-- ── Chat Model ────────────────────────────────────────────── -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <Cpu class="size-5 text-muted-foreground" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">Chat model</h2>
              <p class="text-sm text-muted-foreground">
                Default LLM model used for viber chat and task execution. Each
                viber can override this in its own config.
              </p>
            </div>
          </div>
          <div class="rounded-xl border border-border bg-card p-4">
            <label
              for="chat-model"
              class="block text-xs font-medium text-muted-foreground mb-2"
            >
              Default model
            </label>
            <select
              id="chat-model"
              bind:value={editChatModel}
              class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
            >
              {#each MODEL_OPTIONS as opt (opt.id)}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
            <p class="mt-2 text-[11px] text-muted-foreground/60">
              Uses <code class="rounded bg-muted px-1 py-0.5 text-[10px]"
                >provider/model-name</code
              > format. The model must be accessible via your configured API keys
              above.
            </p>
          </div>
        </section>

        <!-- ── Network Proxy ─────────────────────────────────────────── -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <Shield class="size-5 text-muted-foreground" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">
                Network proxy
              </h2>
              <p class="text-sm text-muted-foreground">
                Route AI API requests through an HTTP proxy. Useful for
                region-restricted models or corporate networks.
              </p>
            </div>
          </div>
          <div class="rounded-xl border border-border bg-card p-4 space-y-4">
            <!-- Enable toggle -->
            <div class="flex items-center justify-between">
              <label
                for="proxy-enabled"
                class="text-sm font-medium text-foreground"
              >
                Enable proxy
              </label>
              <button
                id="proxy-enabled"
                type="button"
                role="switch"
                aria-checked={editProxyEnabled}
                onclick={() => (editProxyEnabled = !editProxyEnabled)}
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background {editProxyEnabled
                  ? 'bg-primary'
                  : 'bg-input'}"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out {editProxyEnabled
                    ? 'translate-x-5'
                    : 'translate-x-0'}"
                />
              </button>
            </div>

            <!-- Proxy URL input -->
            <div>
              <label
                for="proxy-url"
                class="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                Proxy address
              </label>
              <input
                id="proxy-url"
                type="url"
                placeholder="http://127.0.0.1:7890"
                value={editProxyUrl}
                oninput={(e) =>
                  (editProxyUrl = (e.target as HTMLInputElement).value)}
                disabled={!editProxyEnabled}
                class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p class="mt-1.5 text-[11px] text-muted-foreground/60">
                Common with Clash Verge, V2Ray, and other proxy tools. Supports
                HTTP and SOCKS5.
              </p>
            </div>
          </div>
        </section>

        <!-- ── Primary Coding CLI ────────────────────────────────────── -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <Terminal class="size-5 text-muted-foreground" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">
                Primary coding CLI
              </h2>
              <p class="text-sm text-muted-foreground">
                When multiple coding CLIs are installed, the viber will prefer
                this one for coding tasks unless asked for another.
              </p>
            </div>
          </div>
          <div class="rounded-xl border border-border bg-card p-4">
            <label
              for="primary-coding-cli"
              class="block text-xs font-medium text-muted-foreground mb-2"
            >
              Preferred coding CLI
            </label>
            <select
              id="primary-coding-cli"
              bind:value={editPrimaryCodingCli}
              class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
            >
              <option value="">Let agent choose</option>
              {#each codingCliOptions as opt (opt.id)}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </section>

        <!-- ── Timezone ──────────────────────────────────────────────── -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <Globe class="size-5 text-muted-foreground" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">Timezone</h2>
              <p class="text-sm text-muted-foreground">
                Used for job scheduling, heartbeat checks, and time-aware agent
                behavior.
              </p>
            </div>
          </div>
          <div class="rounded-xl border border-border bg-card p-4">
            <label
              for="timezone"
              class="block text-xs font-medium text-muted-foreground mb-2"
            >
              Your timezone
            </label>
            <select
              id="timezone"
              bind:value={editTimezone}
              class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
            >
              {#each POPULAR_TIMEZONES as tz (tz.id)}
                <option value={tz.id}>{tz.label}</option>
              {/each}
            </select>
            <p class="mt-2 text-[11px] text-muted-foreground/60">
              Auto-detect uses your browser's timezone: <code
                class="rounded bg-muted px-1 py-0.5 text-[10px]"
                >{Intl.DateTimeFormat().resolvedOptions().timeZone}</code
              >
            </p>
          </div>
        </section>
      </div>
    {/if}
  </div>

  <!-- Floating save bar -->
  {#if hasChanges}
    <div
      class="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2 duration-200"
    >
      <p class="text-sm text-muted-foreground">Unsaved changes</p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={() => fetchSettings()}
          disabled={saving}
          class="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onclick={saveSettings}
          disabled={saving}
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-sm"
        >
          {#if saving}
            <Loader2 class="size-4 animate-spin" />
            Saving…
          {:else}
            <Save class="size-4" />
            Save Changes
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>
