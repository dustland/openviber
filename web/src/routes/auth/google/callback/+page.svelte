<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  let error: string | null = null;

  function parseHashParams(hash: string) {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    return new URLSearchParams(raw);
  }

  onMount(async () => {
    const params = new URLSearchParams($page.url.search);
    const next = params.get("next") || "/vibers";
    const state = params.get("state") || "";
    const hash = parseHashParams(window.location.hash);
    const accessToken = hash.get("access_token");

    if (!accessToken) {
      error = "Missing Supabase access token in callback.";
      return;
    }

    try {
      const response = await fetch("/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, state }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to create session.");
      }

      window.location.replace(next);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Login failed.";
    }
  });
</script>

<svelte:head>
  <title>Completing sign in - OpenViber</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background p-4">
  <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-center">
    {#if error}
      <h1 class="text-lg font-semibold mb-2">Sign in failed</h1>
      <p class="text-sm text-destructive">{error}</p>
      <a class="mt-4 inline-block text-sm underline" href="/login">Back to login</a>
    {:else}
      <h1 class="text-lg font-semibold mb-2">Completing sign in…</h1>
      <p class="text-sm text-muted-foreground">Please wait while we verify your Supabase session.</p>
    {/if}
  </div>
</div>
