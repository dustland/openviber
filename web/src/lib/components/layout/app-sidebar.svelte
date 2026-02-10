<script lang="ts" generics="Snippets extends Record<string, Snippet> = {}">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import type { Snippet } from "svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import {
    BookOpen,
    Check,
    ChevronRight,
    Laptop,
    LogOut,
    Moon,
    Sun,
    Settings,
    Sparkles,
  } from "@lucide/svelte";
  import { themeStore, type Theme } from "$lib/stores/theme";

  function setTheme(nextTheme: Theme) {
    themeStore.set(nextTheme);
  }

  interface SessionUser {
    name: string;
    email: string;
    avatarUrl?: string | null;
  }

  let {
    children,
    sidebar,
    header,
  }: {
    children: Snippet;
    sidebar?: Snippet;
    header?: Snippet;
  } = $props();

  const user = $derived(($page.data?.user as SessionUser | undefined) || null);
</script>

<Sidebar.Provider>
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header class="p-2 pb-1">
      {#if header}
        {@render header()}
      {:else}
        <Sidebar.Menu>
          <Sidebar.MenuItem class="flex items-center gap-2">
            <a
              href="/"
              class="w-full inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-accent transition-colors"
              title="OpenViber"
            >
              <img src="/favicon.png" alt="OpenViber" class="size-5" />
              <span
                class="truncate font-medium group-data-[collapsible=icon]:hidden"
              >
                OpenViber
              </span>
            </a>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      {/if}
    </Sidebar.Header>

    <Sidebar.Content>
      {#if sidebar}
        {@render sidebar()}
      {/if}
    </Sidebar.Content>

    <Sidebar.Footer>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          {#if user}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="group/usermenu w-full h-9 rounded-md px-2 text-sm text-sidebar-foreground inline-flex items-center gap-2.5 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
              >
                {#if user.avatarUrl}
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    class="size-6 rounded-full object-cover shrink-0"
                  />
                {:else}
                  <div
                    class="size-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0"
                  >
                    {user.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                {/if}
                <span
                  class="truncate flex-1 text-left group-data-[collapsible=icon]:hidden"
                >
                  {user.name}
                </span>
                <ChevronRight
                  class="size-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]/usermenu:rotate-180 group-data-[collapsible=icon]:hidden"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                class="min-w-48 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <div class="px-2.5 py-2 border-b border-border mb-1">
                  <p class="text-sm font-medium">{user.name}</p>
                  <p class="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => goto("/hub")}
                >
                  <Sparkles class="size-4" />
                  Skill Hub
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => goto("/docs")}
                >
                  <BookOpen class="size-4" />
                  Docs
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="w-full rounded px-2.5 py-2 text-left text-sm hover:bg-accent flex items-center gap-2.5 outline-none cursor-pointer"
                  onSelect={() => goto("/settings")}
                >
                  <Settings class="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div class="px-2.5 py-1.5">
                  <p
                    class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
                  >
                    Theme
                  </p>
                </div>
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
                  <LogOut class="size-4" />
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

  <Sidebar.Inset class="flex flex-col h-full min-h-0 bg-muted/40">
    <!-- Mobile header: sidebar trigger (visible < md only) -->
    <header
      class="flex md:hidden items-center gap-2 h-11 shrink-0 border-b border-border/40 px-3"
    >
      <Sidebar.Trigger class="size-7" />
      <a href="/" class="inline-flex items-center gap-1.5">
        <img src="/favicon.png" alt="OpenViber" class="size-4" />
        <span class="text-sm font-medium">OpenViber</span>
      </a>
    </header>
    {@render children()}
  </Sidebar.Inset>
</Sidebar.Provider>
