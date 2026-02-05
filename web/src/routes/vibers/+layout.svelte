<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import {
    Server,
    BookOpen,
    Moon,
    Sun,
    Laptop,
    Check,
    Home,
  } from "@lucide/svelte";

  type Theme = "light" | "dark" | "system";

  let { children } = $props();
  let theme = $state<Theme>("system");

  // Check if we're on a nested viber page (has its own layout)
  const isNestedViber = $derived($page.params.id !== undefined);

  function applyTheme(selectedTheme: Theme) {
    if (typeof window === "undefined") return;
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
  });
</script>

<!-- If nested viber page (has id), just render children (they have their own layout) -->
{#if isNestedViber}
  {@render children()}
{:else}
  <!-- Vibers list page layout -->
  <Sidebar.Provider>
    <Sidebar.Root collapsible="icon" class="border-r border-sidebar-border">
      <Sidebar.Header class="p-2 pb-1">
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton size="sm" class="group-data-[collapsible=icon]:p-0!">
              {#snippet child({ props })}
                <a href="/" {...props}>
                  <img src="/favicon.png" alt="OpenViber" class="size-6" />
                  <span class="truncate font-semibold text-sm">OpenViber</span>
                </a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Header>

      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              <Sidebar.MenuItem>
                <Sidebar.MenuButton tooltipContent="Home">
                  {#snippet child({ props })}
                    <a href="/" {...props}>
                      <Home class="size-4" />
                      <span>Home</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
              <Sidebar.MenuItem>
                <Sidebar.MenuButton isActive={true} tooltipContent="Vibers">
                  {#snippet child({ props })}
                    <a href="/vibers" {...props}>
                      <Server class="size-4" />
                      <span>Vibers</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
              <Sidebar.MenuItem>
                <Sidebar.MenuButton tooltipContent="Documentation">
                  {#snippet child({ props })}
                    <a href="/docs" {...props}>
                      <BookOpen class="size-4" />
                      <span>Docs</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.Footer>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger class="w-full">
                {#snippet child({ props })}
                  <Sidebar.MenuButton {...props} tooltipContent="Theme">
                    {#if theme === "light"}
                      <Sun class="size-4" />
                    {:else if theme === "dark"}
                      <Moon class="size-4" />
                    {:else}
                      <Laptop class="size-4" />
                    {/if}
                    <span class="capitalize">{theme}</span>
                  </Sidebar.MenuButton>
                {/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                class="min-w-32 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none cursor-pointer"
                  onSelect={() => setTheme("system")}
                >
                  <Laptop class="size-3.5" />
                  System
                  {#if theme === "system"}<Check class="size-3.5 ml-auto" />{/if}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none cursor-pointer"
                  onSelect={() => setTheme("light")}
                >
                  <Sun class="size-3.5" />
                  Light
                  {#if theme === "light"}<Check class="size-3.5 ml-auto" />{/if}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-1.5 text-left text-xs hover:bg-accent flex items-center gap-2 outline-none cursor-pointer"
                  onSelect={() => setTheme("dark")}
                >
                  <Moon class="size-3.5" />
                  Dark
                  {#if theme === "dark"}<Check class="size-3.5 ml-auto" />{/if}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Footer>

      <Sidebar.Rail />
    </Sidebar.Root>

    <Sidebar.Inset>
      <header class="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <Sidebar.Trigger class="-ml-1" />
        <Sidebar.Separator orientation="vertical" class="mr-2 h-4" />
        <span class="text-sm font-medium">Vibers</span>
      </header>
      <div class="flex-1 overflow-y-auto">
        {@render children()}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}
