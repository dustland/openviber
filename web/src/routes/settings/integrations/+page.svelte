<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import {
    AlertCircle,
    Check,
    ExternalLink,
    Link2Off,
    Loader2,
    Mail,
  } from "@lucide/svelte";

  interface OAuthConnection {
    id: string;
    provider: string;
    accountEmail: string | null;
    scopes: string[];
    connected: boolean;
    tokenExpiresAt: string | null;
  }

  interface OAuthProvider {
    id: string;
    name: string;
    description: string;
    configured: boolean;
    connection: OAuthConnection | null;
  }

  let providers = $state<OAuthProvider[]>([]);
  let loading = $state(true);
  let disconnecting = $state<string | null>(null);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);

  // Check URL params for success/error messages
  function checkUrlMessages() {
    const params = $page.url.searchParams;
    if (params.get("success") === "google_connected") {
      successMessage = "Google account connected successfully.";
    }
    if (params.get("error")) {
      const errorCode = params.get("error");
      const messages: Record<string, string> = {
        google_denied: "Google authorization was denied.",
        missing_params: "Missing parameters in OAuth callback.",
        invalid_state: "Invalid OAuth state — please try again.",
        token_exchange_failed: "Failed to exchange tokens with Google.",
      };
      error = messages[errorCode!] || `OAuth error: ${errorCode}`;
    }
  }

  async function fetchProviders() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to load integrations");
      const data = await res.json();
      providers = data.providers ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load integrations";
    } finally {
      loading = false;
    }
  }

  async function disconnect(providerId: string) {
    disconnecting = providerId;
    error = null;
    successMessage = null;
    try {
      const res = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      successMessage = "Disconnected successfully.";
      await fetchProviders();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to disconnect";
    } finally {
      disconnecting = null;
    }
  }

  onMount(() => {
    checkUrlMessages();
    fetchProviders();
  });
</script>

<div class="mx-auto max-w-2xl space-y-8 p-6">
  <div>
    <h2 class="text-xl font-semibold">Integrations</h2>
    <p class="text-muted-foreground text-sm mt-1">
      Connect external accounts so skills can access them on your behalf.
      Tokens are encrypted at rest.
    </p>
  </div>

  {#if error}
    <div
      class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
    >
      <AlertCircle class="size-4 shrink-0" />
      {error}
    </div>
  {/if}

  {#if successMessage}
    <div
      class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
    >
      <Check class="size-4 shrink-0" />
      {successMessage}
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <Loader2 class="size-5 animate-spin text-muted-foreground" />
    </div>
  {:else}
    <div class="space-y-4">
      {#each providers as provider (provider.id)}
        <div
          class="rounded-lg border bg-card p-5 space-y-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div
                class="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted"
              >
                {#if provider.id === "google"}
                  <Mail class="size-4" />
                {:else}
                  <ExternalLink class="size-4" />
                {/if}
              </div>
              <div>
                <h3 class="font-medium">{provider.name}</h3>
                <p class="text-muted-foreground text-sm">{provider.description}</p>
              </div>
            </div>

            <div class="shrink-0">
              {#if provider.connection}
                <span
                  class="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400"
                >
                  <Check class="size-3" />
                  Connected
                </span>
              {:else if provider.configured}
                <span
                  class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  Not connected
                </span>
              {:else}
                <span
                  class="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400"
                >
                  Not configured
                </span>
              {/if}
            </div>
          </div>

          {#if provider.connection}
            <div
              class="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
            >
              <div class="text-sm">
                <span class="text-muted-foreground">Account:</span>
                <span class="ml-1 font-mono text-xs">
                  {provider.connection.accountEmail || "Unknown"}
                </span>
              </div>
              <button
                class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/20 transition-colors"
                onclick={() => disconnect(provider.id)}
                disabled={disconnecting === provider.id}
              >
                {#if disconnecting === provider.id}
                  <Loader2 class="size-3.5 animate-spin" />
                  Disconnecting...
                {:else}
                  <Link2Off class="size-3.5" />
                  Disconnect
                {/if}
              </button>
            </div>
          {:else if provider.configured}
            <a
              href="/auth/{provider.id}"
              class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Connect {provider.name}
            </a>
          {:else}
            <p class="text-sm text-muted-foreground">
              The server administrator needs to configure {provider.name} OAuth credentials
              (<code class="text-xs">GOOGLE_CLIENT_ID</code> and <code class="text-xs">GOOGLE_CLIENT_SECRET</code>).
            </p>
          {/if}
        </div>
      {/each}

      {#if providers.length === 0}
        <div class="rounded-lg border border-dashed p-8 text-center">
          <p class="text-muted-foreground text-sm">
            No integrations available. Configure OAuth providers in the server
            environment variables.
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
