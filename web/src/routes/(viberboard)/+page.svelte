<script lang="ts">
  import { page } from "$app/stores";
  import {
    ArrowRight,
    Bot,
    CalendarClock,
    Cpu,
    FolderGit2,
    Server,
    Settings,
    Puzzle,
    Sparkles,
    Zap,
  } from "@lucide/svelte";

  interface SessionUser {
    name: string;
    email: string;
    avatarUrl?: string | null;
  }

  const user = $derived(($page.data?.user as SessionUser | undefined) || null);

  const quickLinks = [
    {
      icon: Bot,
      title: "Vibers",
      description: "Create and manage AI agents",
      href: "/vibers",
      color: "primary",
    },
    {
      icon: CalendarClock,
      title: "Jobs",
      description: "Schedule recurring tasks",
      href: "/jobs",
      color: "primary",
    },
    {
      icon: Puzzle,
      title: "Skills",
      description: "Installed skills & discovery",
      href: "/skills",
      color: "primary",
    },
    {
      icon: Server,
      title: "Nodes",
      description: "Connected daemon instances",
      href: "/nodes",
      color: "primary",
    },
    {
      icon: FolderGit2,
      title: "Environments",
      description: "Runtime configurations",
      href: "/environments",
      color: "primary",
    },
    {
      icon: Settings,
      title: "Settings",
      description: "App preferences",
      href: "/settings",
      color: "primary",
    },
  ];
</script>

<svelte:head>
  <title>Dashboard — OpenViber</title>
  <meta
    name="description"
    content="OpenViber dashboard — manage your AI workforce from one place."
  />
</svelte:head>

<div class="flex-1 overflow-y-auto">
  <div class="px-6 py-10 md:px-8 md:py-14">
    <!-- Welcome -->
    <section class="mb-10">
      <div class="flex items-center gap-3 mb-2">
        <img src="/favicon.png" alt="OpenViber" class="size-9" />
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-foreground">
            {#if user}
              Welcome back, {user.name?.split(" ")[0] || "there"}
            {:else}
              Welcome to OpenViber
            {/if}
          </h1>
          <p class="text-sm text-muted-foreground">
            Your local AI workforce, ready to go.
          </p>
        </div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="mb-10">
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4"
      >
        Quick Access
      </h2>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each quickLinks as link}
          <a
            href={link.href}
            class="group flex items-start gap-3.5 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:bg-card/80 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/5"
          >
            <div
              class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary transition-all duration-300 group-hover:bg-primary/14 group-hover:scale-110"
            >
              <link.icon class="size-4.5" />
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium text-card-foreground"
                  >{link.title}</span
                >
                <ArrowRight
                  class="size-3 text-muted-foreground/0 transition-all duration-300 group-hover:text-primary group-hover:translate-x-0.5"
                />
              </div>
              <p class="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                {link.description}
              </p>
            </div>
          </a>
        {/each}
      </div>
    </section>

    <!-- Getting Started -->
    <section>
      <div
        class="rounded-xl border border-border/50 bg-card/30 p-6 backdrop-blur-sm"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8"
          >
            <Sparkles class="size-4.5 text-primary" />
          </div>
          <div>
            <h3 class="text-sm font-semibold text-card-foreground mb-1">
              Getting Started
            </h3>
            <p class="text-sm text-muted-foreground leading-relaxed mb-3">
              Create your first viber, give it a role and tools, and let it work
              autonomously. Each viber is a specialist agent running on your
              machine — fully private, fully yours.
            </p>
            <div class="flex flex-wrap gap-2">
              <a
                href="/vibers/new"
                class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-all duration-200 hover:brightness-110"
              >
                <Zap class="size-3" />
                Create a Viber
              </a>
              <a
                href="/landing"
                class="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3.5 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-accent/80 hover:border-primary/30"
              >
                Learn More
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
