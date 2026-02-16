<script lang="ts">
  import "../app.css";
  import { Toaster } from "svelte-sonner";
  import { onMount } from "svelte";
  import { applyTheme, themeStore, type Theme } from "$lib/stores/theme";
  import type { LayoutData } from "./$types";

  let { children, data }: { children: any; data: LayoutData } = $props();

  type MediaQueryListLegacy = MediaQueryList & {
    addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  };

  onMount(() => {
    const stored = localStorage.getItem("theme");
    const initial: Theme =
      stored === "dark" || stored === "light" ? stored : "system";
    themeStore.set(initial);
    const unsub = themeStore.subscribe((t) => applyTheme(t));

    const media = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ) as MediaQueryListLegacy;

    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme === "dark" || storedTheme === "light") return;

      const isDark = event.matches;
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onSystemThemeChange);
    } else {
      media.addListener?.(onSystemThemeChange);
    }

    return () => {
      unsub();
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onSystemThemeChange);
      } else {
        media.removeListener?.(onSystemThemeChange);
      }
    };
  });
</script>

<div class="h-screen bg-background flex flex-col overflow-hidden">
  {#if data.e2eTestMode}
    <div
      class="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-black text-center text-xs font-medium py-0.5 px-3 rounded-full shadow-lg"
      data-testid="e2e-test-banner"
    >
      E2E Test Mode — auth and onboarding bypassed
    </div>
  {/if}
  <Toaster richColors position="top-right" />
  <main class="flex-1 min-h-0 flex flex-col">
    {@render children()}
  </main>
</div>
