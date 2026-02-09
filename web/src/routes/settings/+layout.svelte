<script lang="ts">
  import { page } from "$app/stores";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { Puzzle, Settings as SettingsIcon, Sparkles } from "@lucide/svelte";
  import AppSidebar from "$lib/components/layout/app-sidebar.svelte";

  let { children } = $props();

  const pathname = $derived($page.url.pathname);
  const isGeneralRoute = $derived(pathname === "/settings");
  const isHubRoute = $derived(
    pathname === "/settings/skills/hub" ||
      pathname.startsWith("/settings/skills/hub/"),
  );
  const isSkillsRoute = $derived(
    pathname === "/settings/skills" ||
      (pathname.startsWith("/settings/skills/") && !isHubRoute),
  );
</script>

<AppSidebar>
  {#snippet sidebar()}
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isGeneralRoute}
              tooltipContent="General"
            >
              <a
                href="/settings"
                class="w-full inline-flex items-center gap-2"
              >
                <SettingsIcon class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >General</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isSkillsRoute}
              tooltipContent="Skills"
            >
              <a
                href="/settings/skills"
                class="w-full inline-flex items-center gap-2"
              >
                <Puzzle class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Skills</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isHubRoute}
              tooltipContent="Skill Hub"
            >
              <a
                href="/settings/skills/hub"
                class="w-full inline-flex items-center gap-2"
              >
                <Sparkles class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Skill Hub</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  {/snippet}
  {@render children()}
</AppSidebar>
