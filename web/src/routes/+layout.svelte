<script lang="ts">
  import "../app.css";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { applyTheme, themeStore, type Theme } from "$lib/stores/theme";
  import {
    Moon,
    Check,
    Laptop,
    Sun,
    ChevronDown,
    Server,
    LayoutDashboard,
    Home,
    BookOpen,
    Sparkles,
  } from "@lucide/svelte";

  let { children, data } = $props();

  // Route detection
  const isHomepage = $derived($page.url.pathname === "/landing");
  const isLogin = $derived($page.url.pathname === "/login");
  const isVibers = $derived($page.url.pathname.startsWith("/vibers"));
  const isDocs = $derived($page.url.pathname.startsWith("/docs"));

  type MediaQueryListLegacy = MediaQueryList & {
    addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  };

  function setTheme(nextTheme: Theme) {
    themeStore.set(nextTheme);
  }

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
  <!-- Homepage/Login: Transparent floating navbar -->
  {#if isHomepage || isLogin}
    <header class="absolute top-0 left-0 right-0 z-50">
      <nav class="flex items-center gap-2 px-6 py-4 text-sm">
        <a
          href="/landing"
          class="font-semibold text-foreground flex items-center gap-2 shrink-0"
        >
          <img src="/favicon.png" alt="Viber" class="size-7" />
          <span class="text-lg">OpenViber</span>
        </a>

        <div class="flex items-center gap-1 ml-auto">
          <a
            href="/"
            class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-3 py-2 rounded-md hover:bg-accent/50"
          >
            <LayoutDashboard class="size-4 shrink-0" />
            <span class="text-sm">Dashboard</span>
          </a>
          <a
            href="/docs"
            class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-3 py-2 rounded-md hover:bg-accent/50"
          >
            <BookOpen class="size-4 shrink-0" />
            <span class="text-sm">Docs</span>
          </a>

          {#if data.user}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="size-9 rounded-full overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
                aria-label="User menu"
              >
                {#if data.user.avatarUrl}
                  <img
                    src={data.user.avatarUrl}
                    alt={data.user.name}
                    class="size-full object-cover"
                  />
                {:else}
                  <div
                    class="size-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary"
                  >
                    {data.user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                {/if}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                sideOffset={6}
                align="end"
                class="min-w-48 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <div class="px-2.5 py-2 border-b border-border mb-1">
                  <p class="text-sm font-medium">{data.user.name}</p>
                  <p class="text-xs text-muted-foreground">{data.user.email}</p>
                </div>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => {
                    window.location.href = "/";
                  }}
                >
                  <LayoutDashboard class="size-4" />
                  Go to Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => {
                    window.location.href = "/hub";
                  }}
                >
                  <Sparkles class="size-4" />
                  Hub
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer text-destructive"
                  onSelect={() => {
                    const form = document.createElement("form");
                    form.method = "POST";
                    form.action = "/auth/logout";
                    document.body.appendChild(form);
                    form.submit();
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          {:else}
            <a
              href="/auth/github?redirect=/"
              class="text-muted-foreground hover:text-foreground transition-colors shrink-0 px-3 py-2 rounded-md hover:bg-accent/50"
            >
              Sign in
            </a>
          {/if}
          <DropdownMenu>
            <DropdownMenuTrigger
              class="size-9 rounded-md hover:bg-accent/50 inline-flex items-center justify-center transition-colors"
              aria-label="Theme menu"
            >
              {#if $themeStore === "light"}
                <Sun class="size-4 text-muted-foreground" />
              {:else if $themeStore === "dark"}
                <Moon class="size-4 text-muted-foreground" />
              {:else}
                <Laptop class="size-4 text-muted-foreground" />
              {/if}
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
                {#if $themeStore === "system"}<Check
                    class="size-4 ml-auto"
                  />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("light")}
              >
                <Sun class="size-4" />
                Light
                {#if $themeStore === "light"}<Check
                    class="size-4 ml-auto"
                  />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("dark")}
              >
                <Moon class="size-4" />
                Dark
                {#if $themeStore === "dark"}<Check
                    class="size-4 ml-auto"
                  />{/if}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  {/if}

  <!-- Docs: Standard navbar with backdrop -->
  {#if isDocs}
    <header
      class="border-b border-border/50 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-50"
    >
      <nav class="flex items-center gap-2 px-4 py-2 text-sm min-h-12">
        <a
          href="/landing"
          class="font-semibold text-foreground flex items-center gap-2 shrink-0"
        >
          <img src="/favicon.png" alt="Viber" class="size-6" />
          OpenViber
        </a>

        <div class="flex items-center gap-1 ml-auto">
          <a
            href="/landing"
            class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-2.5 py-1.5 rounded-md hover:bg-accent"
          >
            <Home class="size-4 shrink-0" />
            <span class="hidden sm:inline text-sm">Home</span>
          </a>
          <a
            href="/"
            class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 px-2.5 py-1.5 rounded-md hover:bg-accent"
          >
            <LayoutDashboard class="size-4 shrink-0" />
            <span class="hidden sm:inline text-sm">Dashboard</span>
          </a>
          <a
            href="/docs"
            class="flex items-center gap-1.5 text-foreground transition-colors shrink-0 px-2.5 py-1.5 rounded-md bg-accent"
          >
            <BookOpen class="size-4 shrink-0" />
            <span class="hidden sm:inline text-sm">Docs</span>
          </a>

          {#if data.user}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="size-8 rounded-full overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
                aria-label="User menu"
              >
                {#if data.user.avatarUrl}
                  <img
                    src={data.user.avatarUrl}
                    alt={data.user.name}
                    class="size-full object-cover"
                  />
                {:else}
                  <div
                    class="size-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary"
                  >
                    {data.user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                {/if}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                sideOffset={6}
                align="end"
                class="min-w-48 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <div class="px-2.5 py-2 border-b border-border mb-1">
                  <p class="text-sm font-medium">{data.user.name}</p>
                  <p class="text-xs text-muted-foreground">{data.user.email}</p>
                </div>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => {
                    window.location.href = "/hub";
                  }}
                >
                  <Sparkles class="size-4" />
                  Hub
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer text-destructive"
                  onSelect={() => {
                    const form = document.createElement("form");
                    form.method = "POST";
                    form.action = "/auth/logout";
                    document.body.appendChild(form);
                    form.submit();
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          {:else}
            <a
              href="/login"
              class="text-muted-foreground hover:text-foreground transition-colors shrink-0 px-2.5 py-1.5 rounded-md hover:bg-accent"
            >
              Sign in
            </a>
          {/if}
          <DropdownMenu>
            <DropdownMenuTrigger
              class="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground inline-flex items-center gap-1.5 hover:bg-accent hover:text-accent-foreground"
              aria-label="Theme menu"
            >
              {#if $themeStore === "light"}
                <Sun class="size-4 shrink-0 text-muted-foreground" />
              {:else if $themeStore === "dark"}
                <Moon class="size-4 shrink-0 text-muted-foreground" />
              {:else}
                <Laptop class="size-4 shrink-0 text-muted-foreground" />
              {/if}
              <span class="hidden sm:inline capitalize">{$themeStore}</span>
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
                {#if $themeStore === "system"}<Check
                    class="size-4 ml-auto"
                  />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("light")}
              >
                <Sun class="size-4" />
                Light
                {#if $themeStore === "light"}<Check
                    class="size-4 ml-auto"
                  />{/if}
              </DropdownMenuItem>
              <DropdownMenuItem
                class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                onSelect={() => setTheme("dark")}
              >
                <Moon class="size-4" />
                Dark
                {#if $themeStore === "dark"}<Check
                    class="size-4 ml-auto"
                  />{/if}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  {/if}

  <!-- Vibers: No navbar (handled by vibers layout sidebar) -->

  <main class="flex-1 min-h-0 flex flex-col {isHomepage ? 'pt-0' : ''}">
    {@render children()}
  </main>
</div>
