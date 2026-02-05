<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { headerStore } from "$lib/stores/header";
  import { Button } from "$lib/components/ui/button";
  import {
    ArrowLeft,
    Moon,
    Check,
    Circle,
    Laptop,
    Sun,
    ChevronDown,
    Server,
    BookOpen,
  } from "@lucide/svelte";

  type Theme = "light" | "dark" | "system";

  let { children } = $props();
  let theme = $state<Theme>("system");

  function applyTheme(selectedTheme: Theme) {
    if (selectedTheme === "system") {
      localStorage.removeItem("theme");
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", isDark);
      return;
    }

    localStorage.setItem("theme", selectedTheme);
    document.documentElement.classList.toggle("dark", selectedTheme === "dark");
  }

  function setTheme(nextTheme: Theme) {
    theme = nextTheme;
    applyTheme(theme);
  }

  onMount(() => {
    const stored = localStorage.getItem("theme");
    theme = stored === "dark" || stored === "light" ? stored : "system";
    applyTheme(theme);
  });
</script>

<div class="h-screen bg-background flex flex-col overflow-hidden">
  <header class="border-b border-border/50 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-50">
    <nav class="flex items-center gap-2 px-4 py-2 text-sm min-h-12 flex-wrap">
      <a
        href="/"
        class="font-semibold text-foreground flex items-center gap-2 shrink-0"
      >
        <img src="/favicon.png" alt="Viber" class="size-6" />
        OpenViber
      </a>

      {#if $headerStore.viber}
        <span class="w-px h-5 bg-border shrink-0" aria-hidden="true"></span>
        <Button
          variant="ghost"
          size="icon"
          href="/vibers"
          class="size-8 shrink-0"
        >
          <ArrowLeft class="size-4" />
        </Button>
        <span
          class="font-medium truncate max-w-[200px] shrink-0"
          title={$headerStore.viber.viberName}
        >
          {$headerStore.viber.viberName}
        </span>
        {#if $headerStore.viber.isConnected}
          <span
            class="text-green-600 dark:text-green-400 shrink-0"
            title="Online"
          >
            <Circle class="size-2 fill-current inline" aria-hidden="true" />
          </span>
        {:else}
          <span class="text-muted-foreground shrink-0" title="Offline">
            <Circle class="size-2 inline" aria-hidden="true" />
          </span>
        {/if}
      {/if}

      <!-- Right side navigation -->
      <div class="flex items-center gap-1 ml-auto">
        <a
          href="/vibers"
          class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-2.5 py-1.5 rounded-md hover:bg-accent"
          title="Vibers"
        >
          <Server class="size-4 shrink-0" />
          <span class="hidden sm:inline text-sm">Vibers</span>
        </a>
        <a
          href="/docs"
          class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-2.5 py-1.5 rounded-md hover:bg-accent"
          title="Docs"
        >
          <BookOpen class="size-4 shrink-0" />
          <span class="hidden sm:inline text-sm">Docs</span>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger
            class="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground inline-flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground"
            aria-label="Theme menu"
          >
            {#if theme === "light"}
              <Sun class="size-4 shrink-0 text-muted-foreground" />
            {:else if theme === "dark"}
              <Moon class="size-4 shrink-0 text-muted-foreground" />
            {:else}
              <Laptop class="size-4 shrink-0 text-muted-foreground" />
            {/if}
            <span class="hidden sm:inline capitalize">{theme}</span>
            <ChevronDown class="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={6}
            align="end"
            class="min-w-36 rounded-md border border-border bg-popover p-1 shadow-md"
          >
            <DropdownMenuItem
              class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
              onSelect={() => setTheme("system")}
            >
              <Laptop class="size-4" />
              System
              {#if theme === "system"}<Check class="size-4 ml-auto" />{/if}
            </DropdownMenuItem>
            <DropdownMenuItem
              class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
              onSelect={() => setTheme("light")}
            >
              <Sun class="size-4" />
              Light
              {#if theme === "light"}<Check class="size-4 ml-auto" />{/if}
            </DropdownMenuItem>
            <DropdownMenuItem
              class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
              onSelect={() => setTheme("dark")}
            >
              <Moon class="size-4" />
              Dark
              {#if theme === "dark"}<Check class="size-4 ml-auto" />{/if}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  </header>

  <main class="flex-1 min-h-0 flex flex-col">
    {@render children()}
  </main>
</div>
