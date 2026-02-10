<script lang="ts">
  import { page } from "$app/stores";
  import * as Sidebar from "$lib/components/ui/sidebar";
  import {
    Archive,
    BookOpen,
    Cable,
    MessageSquare,
    Puzzle,
    Settings,
    Sparkles,
  } from "@lucide/svelte";
  import AppSidebar from "$lib/components/layout/app-sidebar.svelte";

  let { children } = $props();

  const pathname = $derived($page.url.pathname);
  const isGeneralRoute = $derived(
    pathname === "/settings/general" ||
      pathname.startsWith("/settings/general/"),
  );
  const isPersonalizationRoute = $derived(
    pathname === "/settings/personalization" ||
      pathname.startsWith("/settings/personalization/"),
  );
  const isSkillsRoute = $derived(
    pathname === "/settings/skills" || pathname.startsWith("/settings/skills/"),
  );
  const isIntentsRoute = $derived(
    pathname === "/settings/intents" ||
      pathname.startsWith("/settings/intents/"),
  );
  const isIntegrationsRoute = $derived(
    pathname === "/settings/integrations" ||
      pathname.startsWith("/settings/integrations/"),
  );
  const isChannelsRoute = $derived(
    pathname === "/settings/channels" ||
      pathname.startsWith("/settings/channels/"),
  );
  const isArchivedRoute = $derived(
    pathname === "/settings/archived" ||
      pathname.startsWith("/settings/archived/"),
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
                href="/settings/general"
                class="w-full inline-flex items-center gap-2"
              >
                <Settings class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >General</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isPersonalizationRoute}
              tooltipContent="Personalization"
            >
              <a
                href="/settings/personalization"
                class="w-full inline-flex items-center gap-2"
              >
                <BookOpen class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Personalization</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isSkillsRoute}
              tooltipContent="Skill sources"
            >
              <a
                href="/settings/skills"
                class="w-full inline-flex items-center gap-2"
              >
                <Puzzle class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Skill sources</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isIntegrationsRoute}
              tooltipContent="Integrations"
            >
              <a
                href="/settings/integrations"
                class="w-full inline-flex items-center gap-2"
              >
                <Cable class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Integrations</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isIntentsRoute}
              tooltipContent="Intents"
            >
              <a
                href="/settings/intents"
                class="w-full inline-flex items-center gap-2"
              >
                <Sparkles class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Intents</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isChannelsRoute}
              tooltipContent="Channels"
            >
              <a
                href="/settings/channels"
                class="w-full inline-flex items-center gap-2"
              >
                <MessageSquare class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Channels</span
                >
              </a>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>

          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={isArchivedRoute}
              tooltipContent="Archived vibers"
            >
              <a
                href="/settings/archived"
                class="w-full inline-flex items-center gap-2"
              >
                <Archive class="size-4 shrink-0" />
                <span class="truncate group-data-[collapsible=icon]:hidden"
                  >Archived vibers</span
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
