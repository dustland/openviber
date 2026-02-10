<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    Check,
    ExternalLink,
    Eye,
    EyeOff,
    Loader2,
    MessageSquare,
    Save,
    Shield,
  } from "@lucide/svelte";

  interface ChannelFieldMeta {
    key: string;
    label: string;
    placeholder?: string;
    help?: string;
    secret?: boolean;
    type?: "text" | "password" | "url";
  }

  interface ChannelConfig {
    enabled: boolean;
    displayName: string;
    description: string;
    docsUrl: string;
    fields: ChannelFieldMeta[];
    config: Record<string, string>;
  }

  let channels = $state<Record<string, ChannelConfig>>({});
  let editChannels = $state<
    Record<string, { enabled: boolean; config: Record<string, string> }>
  >({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let revealedFields = $state<Set<string>>(new Set());

  function initEditState(data: Record<string, ChannelConfig>) {
    const edit: Record<string, { enabled: boolean; config: Record<string, string> }> =
      {};

    for (const [key, channel] of Object.entries(data)) {
      const config: Record<string, string> = {};
      for (const field of channel.fields ?? []) {
        config[field.key] = channel.config?.[field.key] || "";
      }
      edit[key] = {
        enabled: channel.enabled,
        config,
      };
    }

    editChannels = edit;
  }

  async function fetchSettings() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load channel settings");
      }
      const data = await res.json();
      channels = data.channels ?? {};
      initEditState(channels);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load channel settings";
    } finally {
      loading = false;
    }
  }

  async function saveSettings() {
    saving = true;
    error = null;
    successMessage = null;
    try {
      const payload: Record<
        string,
        { enabled: boolean; config: Record<string, string> }
      > = {};

      for (const [key, edit] of Object.entries(editChannels)) {
        payload[key] = {
          enabled: edit.enabled,
          config: { ...edit.config },
        };
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save channel settings");
      }

      successMessage = "Channel settings saved";
      await fetchSettings();

      setTimeout(() => {
        successMessage = null;
      }, 3000);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save channel settings";
    } finally {
      saving = false;
    }
  }

  function toggleChannel(key: string) {
    if (editChannels[key]) {
      editChannels[key].enabled = !editChannels[key].enabled;
    }
  }

  function getFieldKey(channelId: string, fieldKey: string) {
    return `${channelId}:${fieldKey}`;
  }

  function toggleRevealField(fieldKey: string) {
    const next = new Set(revealedFields);
    if (next.has(fieldKey)) {
      next.delete(fieldKey);
    } else {
      next.add(fieldKey);
    }
    revealedFields = next;
  }

  const enabledCount = $derived(
    Object.values(editChannels).filter((channel) => channel.enabled).length,
  );

  const hasChanges = $derived.by(() => {
    for (const [key, edit] of Object.entries(editChannels)) {
      const original = channels[key];
      if (!original) continue;
      if (edit.enabled !== original.enabled) return true;
      for (const field of original.fields ?? []) {
        const originalValue = original.config?.[field.key] || "";
        const editedValue = edit.config?.[field.key] || "";
        if (editedValue !== originalValue) return true;
      }
    }
    return false;
  });

  onMount(() => {
    fetchSettings();
  });
</script>

<svelte:head>
  <title>Channels - OpenViber</title>
</svelte:head>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center gap-3 mb-2">
        <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10">
          <MessageSquare class="size-5 text-primary" />
        </div>
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Channels</h1>
          <p class="text-sm text-muted-foreground">
            Configure chat apps that can connect to your vibers.
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
          <p class="text-sm text-muted-foreground">Loading channels...</p>
        </div>
      </div>
    {:else}
      <section class="mb-10">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold text-foreground">Channel integrations</h2>
            <p class="text-sm text-muted-foreground">
              {enabledCount} of {Object.keys(editChannels).length} channels enabled.
            </p>
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
          {#each Object.entries(editChannels) as [key, edit] (key)}
            {@const meta = channels[key]}
            {#if meta}
              <div
                class="rounded-xl border transition-all duration-200 {edit.enabled
                  ? 'border-border bg-card shadow-sm'
                  : 'border-border/60 bg-card/50'}"
              >
                <div class="flex items-start gap-4 p-4">
                  <button
                    type="button"
                    onclick={() => toggleChannel(key)}
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
                    {#if meta.fields.length > 0}
                      <div class="grid gap-3 sm:grid-cols-2">
                        {#each meta.fields as field (field.key)}
                          {@const fieldId = getFieldKey(key, field.key)}
                          <div>
                            <label
                              for={"channel-" + key + "-" + field.key}
                              class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5"
                            >
                              {field.label}
                            </label>
                            <div class="relative">
                              <input
                                id={"channel-" + key + "-" + field.key}
                                type={field.secret
                                  ? revealedFields.has(fieldId)
                                    ? "text"
                                    : "password"
                                  : field.type || "text"}
                                bind:value={edit.config[field.key]}
                                placeholder={field.placeholder || ""}
                                class="w-full h-9 rounded-md border border-input bg-background px-3 pr-10 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
                              />
                              {#if field.secret}
                                <button
                                  type="button"
                                  onclick={() => toggleRevealField(fieldId)}
                                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                  title={revealedFields.has(fieldId) ? "Hide" : "Reveal"}
                                >
                                  {#if revealedFields.has(fieldId)}
                                    <EyeOff class="size-4" />
                                  {:else}
                                    <Eye class="size-4" />
                                  {/if}
                                </button>
                              {/if}
                            </div>
                            {#if field.help}
                              <p class="mt-1 text-[11px] text-muted-foreground/60">
                                {field.help}
                              </p>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {:else}
                      <div class="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <Shield class="size-3.5" />
                        No configuration required
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>
