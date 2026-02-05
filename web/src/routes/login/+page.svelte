<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Sign in - OpenViber</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background p-4">
  <div class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
    <div class="text-center mb-6">
      <img src="/favicon.png" alt="OpenViber" class="size-12 mx-auto mb-3" />
      <h1 class="text-2xl font-semibold">Sign in to OpenViber</h1>
      <p class="text-sm text-muted-foreground mt-2">Use your Google account through Supabase Auth to securely access Viber Board.</p>
    </div>

    {#if data.supabaseAuthEnabled}
      <a
        href={`/auth/google?redirect=${encodeURIComponent(data.redirectTo)}`}
        class="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
      >
        Continue with Google (Supabase)
      </a>
    {:else}
      <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Supabase OAuth is not configured. Set <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, and <code>APP_URL</code>.
      </div>
    {/if}
  </div>
</div>
