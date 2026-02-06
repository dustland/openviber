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
        href={`/auth/google?redirect=${encodeURIComponent(data.redirectTo)}`}
        class="w-full inline-flex items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
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
