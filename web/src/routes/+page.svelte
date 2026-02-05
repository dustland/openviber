<script lang="ts">
  import {
    ArrowRight,
    Bot,
    Brain,
    Cpu,
    Shield,
    Sparkles,
    Workflow,
  } from "@lucide/svelte";

  const architecturePillars = [
    {
      icon: Workflow,
      title: "Task Lifecycle Orchestration",
      description:
        "From intake to completion with explicit state transitions, progress updates, and human checkpoints.",
      href: "/docs/design/task-lifecycle",
    },
    {
      icon: Brain,
      title: "Three-File Personalization",
      description:
        "SOUL, USER, and MEMORY files keep behavior consistent while remaining simple to manage.",
      href: "/docs/design/personalization",
    },
    {
      icon: Cpu,
      title: "Protocol-Driven Runtime",
      description:
        "WebSocket message contracts, streaming support, and channel abstractions for reliable operations.",
      href: "/docs/design/protocol",
    },
    {
      icon: Shield,
      title: "Security & Error Recovery",
      description:
        "Layered defenses, provider fallback patterns, and graceful degradation for production readiness.",
      href: "/docs/design/security",
    },
  ];

  const implementationTracks = [
    "Daemon runtime + controller as the authoritative execution path",
    "Context and memory controls for long-running, high-signal sessions",
    "Plan/artifact conventions that keep autonomous work auditable",
  ];
</script>

<svelte:head>
  <title>OpenViber · Agent Runtime Platform</title>
</svelte:head>

<div class="relative overflow-y-auto h-full">
  <div class="pointer-events-none absolute inset-0 -z-10">
    <div
      class="absolute -top-32 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.18),transparent_60%)]"
    ></div>
    <div
      class="absolute right-[-10rem] top-56 size-[26rem] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--ring)/0.16),transparent_70%)]"
    ></div>
  </div>

  <main class="container mx-auto px-4 py-14 md:py-20">
    <section class="mx-auto max-w-5xl text-center">
      <div
        class="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
      >
        <Sparkles class="size-3.5 text-primary" />
        Architecture-first platform for autonomous yet controllable AI work
      </div>

      <h1
        class="text-balance bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-6xl"
      >
        Build powerful AI operations with a calm, operator-friendly control
        surface
      </h1>
      <p class="mx-auto mt-6 max-w-3xl text-pretty text-lg text-muted-foreground md:text-xl">
        OpenViber combines daemon-driven execution, protocol-level observability,
        and practical personalization so teams can run advanced agent workflows
        without drowning in complexity.
      </p>

      <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/vibers"
          class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90"
        >
          Open Control Board
          <ArrowRight class="size-4" />
        </a>
        <a
          href="/docs/design/arch"
          class="inline-flex items-center gap-2 rounded-lg border border-border bg-background/80 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
        >
          Read Architecture Docs
        </a>
      </div>
    </section>

    <section class="mx-auto mt-14 grid max-w-6xl gap-5 md:mt-20 md:grid-cols-2">
      {#each architecturePillars as pillar}
        <a
          href={pillar.href}
          class="group rounded-2xl border border-border/80 bg-card/70 p-6 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
        >
          <div
            class="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
          >
            <pillar.icon class="size-5" />
          </div>
          <h2 class="text-lg font-semibold text-card-foreground">{pillar.title}</h2>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
            {pillar.description}
          </p>
          <span
            class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-90"
          >
            View design doc
            <ArrowRight
              class="size-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </a>
      {/each}
    </section>

    <section
      class="mx-auto mt-14 max-w-6xl rounded-2xl border border-border/80 bg-gradient-to-br from-card to-card/70 p-7 shadow-sm md:mt-16 md:p-8"
    >
      <div class="flex items-center gap-2 text-sm font-medium text-primary">
        <Bot class="size-4" />
        Implementation Readiness Focus
      </div>
      <p class="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
        The design docs now map to clear implementation tracks, helping teams
        ship a platform that scales in capability while staying approachable for
        operators.
      </p>

      <ul class="mt-5 grid gap-3 text-sm text-foreground/90 md:grid-cols-3">
        {#each implementationTracks as track}
          <li class="rounded-xl border border-border/70 bg-background/70 p-4">
            {track}
          </li>
        {/each}
      </ul>
    </section>
  </main>
</div>
