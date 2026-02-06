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
    ChevronDown,
  } from "@lucide/svelte";

  type Theme = "light" | "dark" | "system";

  let { children, data } = $props();
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
          <Sidebar.MenuItem class="flex items-center gap-2">
            <a
              href="/"
              class="shrink-0 p-1 rounded hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:mx-auto"
              title="Home"
            >
              <img src="/favicon.png" alt="OpenViber" class="size-5" />
            </a>
            {#await import("$lib/components/viber-switcher.svelte") then { default: ViberSwitcher }}
              <ViberSwitcher />
            {/await}
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Header>

      <Sidebar.Content>
        <Sidebar.Group>
          <Sidebar.GroupContent>
            <Sidebar.Menu>
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
              <DropdownMenuTrigger
                class="w-full h-8 rounded-md border border-sidebar-border bg-sidebar px-2.5 text-sm text-sidebar-foreground inline-flex items-center gap-2 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
              >
                {#if theme === "light"}
                  <Sun class="size-4 shrink-0" />
                {:else if theme === "dark"}
                  <Moon class="size-4 shrink-0" />
                {:else}
                  <Laptop class="size-4 shrink-0" />
                {/if}
                <span
                  class="capitalize flex-1 text-left group-data-[collapsible=icon]:hidden"
                  >{theme}</span
                >
                <ChevronDown
                  class="size-3.5 opacity-50 group-data-[collapsible=icon]:hidden"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
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
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            {#if data?.user}
              <DropdownMenu>
                <DropdownMenuTrigger
                  class="w-full h-9 rounded-md px-2 text-sm text-sidebar-foreground inline-flex items-center gap-2.5 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
                >
                  {#if data.user.avatarUrl}
                    <img
                      src={data.user.avatarUrl}
                      alt={data.user.name}
                      class="size-6 rounded-full object-cover shrink-0"
                    />
                  {:else}
                    <div
                      class="size-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0"
                    >
                      {data.user.name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                  {/if}
                  <span
                    class="truncate flex-1 text-left group-data-[collapsible=icon]:hidden"
                    >{data.user.name}</span
                  >
                  <ChevronDown
                    class="size-3.5 opacity-50 group-data-[collapsible=icon]:hidden"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="end"
                  sideOffset={8}
                  class="min-w-48 rounded-md border border-border bg-popover p-1 shadow-md"
                >
                  <div class="px-2.5 py-2 border-b border-border mb-1">
                    <p class="text-sm font-medium">{data.user.name}</p>
                    <p class="text-xs text-muted-foreground">
                      {data.user.email}
                    </p>
                  </div>
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
                class="w-full text-left text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground px-2 py-1.5 rounded-md hover:bg-sidebar-accent"
              >
                Sign in
              </a>
            {/if}
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.Footer>

      <Sidebar.Rail />
    </Sidebar.Root>

    <Sidebar.Inset class="flex flex-col h-full">
      <div class="flex-1 overflow-y-auto">
        {@render children()}
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
{/if}
