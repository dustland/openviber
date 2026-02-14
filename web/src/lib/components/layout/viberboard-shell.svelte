<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/stores";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { ChevronDown, Cpu, FolderGit2, Server } from "@lucide/svelte";

  interface SessionUser {
    name: string;
    email: string;
    avatarUrl?: string | null;
  }

  let { children, sidebar }: { children?: Snippet; sidebar?: Snippet } =
    $props();

  const pathname = $derived($page.url.pathname);
  const isTasksRoute = $derived(
    pathname === "/tasks" || pathname.startsWith("/tasks/"),
  );
  const isEnvironmentsRoute = $derived(
    pathname === "/environments" || pathname.startsWith("/environments/"),
  );
  const isVibersRoute = $derived(
    pathname === "/vibers" || pathname.startsWith("/vibers/"),
  );
  const user = $derived(($page.data?.user as SessionUser | undefined) || null);
</script>

<Sidebar.Provider>
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header class="p-2 pb-1">
      <Sidebar.Menu>
        <Sidebar.MenuItem class="flex items-center gap-2">
          <a
            href="/"
            class="w-full inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-accent transition-colors"
            title="OpenViber"
          >
            <img src="/favicon.png" alt="OpenViber" class="size-5" />
            <span
              class="hidden truncate font-medium sm:inline group-data-[collapsible=icon]:hidden"
            >
              OpenViber
            </span>
          </a>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Header>

    <Sidebar.Content>
      {#if sidebar}
        {@render sidebar()}
      {:else}
        <Sidebar.Group>
          <Sidebar.GroupContent>
            <Sidebar.Menu>
              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={isTasksRoute}
                  tooltipContent="Tasks"
                >
                  <a
                    href="/tasks"
                    class="w-full inline-flex items-center gap-2"
                  >
                    <Cpu class="size-4 shrink-0" />
                    <span class="truncate group-data-[collapsible=icon]:hidden"
                      >Tasks</span
                    >
                  </a>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>

              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={isEnvironmentsRoute}
                  tooltipContent="Environments"
                >
                  <a
                    href="/environments"
                    class="w-full inline-flex items-center gap-2"
                  >
                    <FolderGit2 class="size-4 shrink-0" />
                    <span class="truncate group-data-[collapsible=icon]:hidden"
                      >Environments</span
                    >
                  </a>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>

              <Sidebar.MenuItem>
                <Sidebar.MenuButton
                  isActive={isVibersRoute}
                  tooltipContent="Vibers"
                >
                  <a
                    href="/vibers"
                    class="w-full inline-flex items-center gap-2"
                  >
                    <Server class="size-4 shrink-0" />
                    <span class="truncate group-data-[collapsible=icon]:hidden"
                      >Vibers</span
                    >
                  </a>
                </Sidebar.MenuButton>
              </Sidebar.MenuItem>
            </Sidebar.Menu>
          </Sidebar.GroupContent>
        </Sidebar.Group>
      {/if}
    </Sidebar.Content>

    <Sidebar.Footer>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          {#if user}
            <DropdownMenu>
              <DropdownMenuTrigger
                class="w-full h-9 rounded-md px-2 text-sm text-sidebar-foreground inline-flex items-center gap-2.5 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
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
                  <p class="text-sm font-medium">{user.name}</p>
                  <p class="text-xs text-muted-foreground">{user.email}</p>
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

  <Sidebar.Inset class="flex flex-col h-full min-h-0 bg-background">
    {@render children?.()}
  </Sidebar.Inset>
</Sidebar.Provider>
