<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Sign in - OpenViber</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background p-4">
  <div
    class="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm"
  >
    <div class="text-center mb-8">
      <img src="/favicon.png" alt="OpenViber" class="size-14 mx-auto mb-4" />
      <h1 class="text-2xl font-semibold">Welcome back</h1>
      <p class="text-sm text-muted-foreground mt-2">
        Sign in to continue to OpenViber
      </p>
    </div>

    {#if data.supabaseAuthEnabled}
      <a
        href={`/auth/github?redirect=${encodeURIComponent(data.redirectTo)}`}
        class="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
          />
        </svg>
        Continue with GitHub
      </a>
    {:else}
      <div
        class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        <p class="font-medium mb-1">Authentication not configured</p>
        <p class="text-destructive/80">
          Please configure your environment variables to enable sign in.
        </p>
      </div>
    {/if}
  </div>
</div>
