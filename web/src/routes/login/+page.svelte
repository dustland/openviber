<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  let countdown = $state(5);

  onMount(() => {
    const timer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(timer);
        goto("/landing");
      }
    }, 1000);
    return () => clearInterval(timer);
  });
</script>

<svelte:head>
  <title>Signed out — OpenViber</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background p-4">
  <div
    class="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm text-center"
  >
    <img src="/favicon.png" alt="OpenViber" class="size-14 mx-auto mb-4" />
    <h1 class="text-2xl font-semibold">You've been signed out</h1>
    <p class="text-sm text-muted-foreground mt-2">
      Redirecting to the home page in {countdown}s…
    </p>

    <a
      href="/landing"
      class="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all duration-200 hover:brightness-110"
    >
      Go to Home
    </a>
  </div>
</div>
