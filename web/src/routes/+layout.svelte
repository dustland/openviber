<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { applyTheme, themeStore, type Theme } from "$lib/stores/theme";

  let { children } = $props();

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
  <main class="flex-1 min-h-0 flex flex-col">
    {@render children()}
  </main>
</div>
