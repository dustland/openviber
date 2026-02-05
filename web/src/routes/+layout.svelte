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
    RefreshCw,
    Settings,
    MessageSquare,
    Moon,
    Check,
    Circle,
    Laptop,
    Sun,
    ChevronDown,
    Terminal as TerminalIcon,
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
  <header class="border-b border-border shrink-0">
    <nav class="flex items-center gap-2 px-4 py-2 text-sm min-h-10 flex-wrap">
      <a
        href="/"
        class="font-semibold text-foreground flex items-center gap-1.5 shrink-0"
      >
        <img src="/favicon.png" alt="Viber" class="size-4" />
        OpenViber
      </a>

      {#if $headerStore.viber}
        <span class="w-px h-4 bg-border shrink-0" aria-hidden="true"></span>
        <Button
          variant="ghost"
          size="icon"
          href="/vibers"
          class="size-7 shrink-0"
        >
          <ArrowLeft class="size-3" />
        </Button>
        <span
          class="font-medium truncate max-w-[120px] shrink-0"
          title={$headerStore.viber.viberName}
        >
          {$headerStore.viber.viberName}
        </span>
        {#if $headerStore.viber.isConnected}
          <span
            class="text-green-600 dark:text-green-400 shrink-0"
            title="Online"
          >
            <Circle class="size-1.5 fill-current inline" aria-hidden="true"
            ></Circle>
          </span>
        {:else}
          <span class="text-muted-foreground shrink-0" title="Offline">
            <Circle class="size-1.5 inline" aria-hidden="true"></Circle>
          </span>
        {/if}
        <span
          class="w-px h-4 bg-border shrink-0 hidden sm:block"
          aria-hidden="true"
        ></span>
        <div
          class="flex items-center rounded-md border border-border/50 bg-muted/30 p-0.5 shrink-0"
        >
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors {$headerStore
              .viber.activeTab === 'chat'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => headerStore.setActiveTab("chat")}
            title="Chat"
          >
            <MessageSquare class="size-3 shrink-0" />
            <span class="hidden sm:inline">Chat</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors {$headerStore
              .viber.activeTab === 'terminals'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => headerStore.setActiveTab("terminals")}
            title="Terminals"
          >
            <TerminalIcon class="size-3 shrink-0" />
            <span class="hidden sm:inline">Terminals</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors {$headerStore
              .viber.activeTab === 'ports'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => headerStore.setActiveTab("ports")}
            title="Ports"
          >
            <Server class="size-3 shrink-0" />
            <span class="hidden sm:inline">Ports</span>
          </button>
        </div>
        <div class="flex items-center gap-0.5 ml-auto shrink-0">
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            onclick={() => headerStore.requestRefresh()}
          >
            <RefreshCw class="size-3" />
          </Button>
          <Button variant="ghost" size="icon" class="size-7">
            <Settings class="size-3" />
          </Button>
          <a
            href="/vibers"
            class="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs px-1.5 py-0.5 rounded transition-colors"
            title="Vibers"
          >
            <Server class="size-3 shrink-0" />
            <span class="hidden sm:inline">Vibers</span>
          </a>
          <a
            href="/docs"
            class="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs px-1.5 py-0.5 rounded transition-colors"
            title="Docs"
          >
            <BookOpen class="size-3 shrink-0" />
            <span class="hidden sm:inline">Docs</span>
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger
              class="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground inline-flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground"
              aria-label="Theme menu"
            >
              {#if theme === "light"}
                <Sun class="size-3 shrink-0 text-muted-foreground" />
              {:else if theme === "dark"}
                <Moon class="size-3 shrink-0 text-muted-foreground" />
              {:else}
                <Laptop class="size-3 shrink-0 text-muted-foreground" />
              {/if}
              <span class="hidden sm:inline capitalize">{theme}</span>
              <ChevronDown class="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={6}
              align="end"
              class="min-w-32 rounded-md border border-border bg-popover p-1 shadow-md"
            >
              <DropdownMenuItem
                class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none"
                onSelect={() => setTheme("system")}
              >
                <Laptop class="size-3" />
                System
                {#if theme === "system"}<Check class="size-3 ml-auto" />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none"
                onSelect={() => setTheme("light")}
              >
                <Sun class="size-3" />
                Light
                {#if theme === "light"}<Check class="size-3 ml-auto" />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none"
                onSelect={() => setTheme("dark")}
              >
                <Moon class="size-3" />
                Dark
                {#if theme === "dark"}<Check class="size-3 ml-auto" />{/if}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      {:else}
        <div class="flex items-center gap-1 ml-auto">
          <a
            href="/vibers"
            class="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5 py-0.5 rounded"
            title="Vibers"
          >
            <Server class="size-3 shrink-0" />
            <span class="hidden sm:inline">Vibers</span>
          </a>
          <a
            href="/docs"
            class="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1.5 py-0.5 rounded"
            title="Docs"
          >
            <BookOpen class="size-3 shrink-0" />
            <span class="hidden sm:inline">Docs</span>
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger
              class="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground inline-flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground"
              aria-label="Theme menu"
            >
              {#if theme === "light"}
                <Sun class="size-3 shrink-0 text-muted-foreground" />
              {:else if theme === "dark"}
                <Moon class="size-3 shrink-0 text-muted-foreground" />
              {:else}
                <Laptop class="size-3 shrink-0 text-muted-foreground" />
              {/if}
              <span class="hidden sm:inline capitalize">{theme}</span>
              <ChevronDown class="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={6}
              align="end"
              class="min-w-32 rounded-md border border-border bg-popover p-1 shadow-md"
            >
              <DropdownMenuItem
                class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none"
                onSelect={() => setTheme("system")}
              >
                <Laptop class="size-3" />
                System
                {#if theme === "system"}<Check class="size-3 ml-auto" />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none"
                onSelect={() => setTheme("light")}
              >
                <Sun class="size-3" />
                Light
                {#if theme === "light"}<Check class="size-3 ml-auto" />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none"
                onSelect={() => setTheme("dark")}
              >
                <Moon class="size-3" />
                Dark
                {#if theme === "dark"}<Check class="size-3 ml-auto" />{/if}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      {/if}
    </nav>
  </header>

  <main class="flex-1 min-h-0 flex flex-col">
    {@render children()}
  </main>
</div>
