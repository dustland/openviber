<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";

  let { children } = $props();

  // Respect system preference, default to light
  onMount(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // Follow system preference
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        document.documentElement.classList.add("dark");
      }
    }
  });
</script>

<div class="min-h-screen bg-background">
  <header class="border-b border-border">
    <nav class="mx-auto px-4 py-3 flex items-center justify-between">
      <a
        href="/"
        class="text-xl font-bold text-foreground flex items-center gap-2"
      >
        <img src="/favicon.png" alt="Viber" class="size-8" />
        Viber Cockpit
      </a>
      <div class="flex items-center gap-4">
        <a
          href="/vibers"
          class="text-muted-foreground hover:text-foreground transition-colors"
        >
          Vibers
        </a>
        <a
          href="/docs"
          class="text-muted-foreground hover:text-foreground transition-colors"
        >
          Docs
        </a>
      </div>
    </nav>
  </header>

  <main>
    {@render children()}
  </main>
</div>
