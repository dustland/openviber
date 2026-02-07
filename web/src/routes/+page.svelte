<script lang="ts">
  import {
    ArrowRight,
    Chrome,
    Clock,
    Code,
    FileText,
    Globe,
    Monitor,
    Moon,
    Search,
    Shield,
    Terminal,
    Wrench,
    Zap,
  } from "@lucide/svelte";

  const valueProps = [
    {
      icon: Monitor,
      title: "Runs Locally",
      description:
        "Your machine is the runtime. No cloud dependency, full control over data and compute.",
    },
    {
      icon: Moon,
      title: "Works While You Sleep",
      description:
        "Scheduled jobs run autonomously on cron. Wake up to finished research, updated repos, and reports.",
    },
    {
      icon: Shield,
      title: "Fully Private",
      description:
        "API keys, files, and data never leave your machine. Outbound-only connections, no inbound ports.",
    },
    {
      icon: Zap,
      title: "Multi-Viber",
      description:
        "Run multiple vibers on one node — each with its own persona, tools, memory, and scheduled jobs.",
    },
  ];

  const builtinTools = [
    {
      icon: FileText,
      name: "File",
      desc: "Read, write, create, and manage files",
    },
    { icon: Search, name: "Search", desc: "Find information across the web" },
    {
      icon: Chrome,
      name: "Browser",
      desc: "Navigate pages, click, type, extract",
    },
    { icon: Globe, name: "Web", desc: "Fetch, parse, and crawl any URL" },
    { icon: Terminal, name: "tmux", desc: "Run terminal commands in sessions" },
    {
      icon: Monitor,
      name: "Desktop",
      desc: "Interact with desktop applications",
    },
    { icon: Clock, name: "Schedule", desc: "Create and manage recurring jobs" },
    {
      icon: Code,
      name: "Cursor Agent",
      desc: "Drive Cursor IDE for code edits",
    },
  ];

  const integrations = [
    "Cursor",
    "Claude Code",
    "Codex CLI",
    "Chrome",
    "tmux",
    "Office",
    "Any MCP Server",
  ];
</script>

<svelte:head>
  <title>OpenViber · You Imagine. Vibers Build.</title>
</svelte:head>

<div class="relative h-full overflow-x-hidden overflow-y-auto">
  <div class="pointer-events-none absolute inset-0 -z-10">
    <div
      class="absolute -top-32 left-1/2 size-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.18),transparent_60%)]"
    ></div>
    <div
      class="absolute right-[-10rem] top-56 size-[26rem] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--ring)/0.16),transparent_70%)]"
    ></div>
  </div>

  <main class="container mx-auto px-6 py-16 md:px-8 md:py-24">
    <!-- Hero -->
    <section class="mx-auto max-w-5xl text-center">
      <img
        src="/favicon.png"
        alt="OpenViber"
        class="mx-auto mb-8 size-20 md:size-24"
      />

      <h1
        class="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text pb-1 text-4xl font-semibold leading-[1.15] tracking-tight text-transparent md:text-6xl"
      >
        You Imagine. Vibers Build.
      </h1>
      <p
        class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl"
      >
        Turn your machine into an AI coworker. OpenViber runs vibers locally —
        autonomous agents that write code, research the web, manage files, and
        run scheduled tasks while you sleep. Fully private, fully yours.
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
          href="/docs"
          class="inline-flex items-center gap-2 rounded-lg border border-border bg-background/80 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
        >
          Read the Docs
        </a>
      </div>
    </section>

    <!-- Why OpenViber -->
    <section class="mx-auto mt-20 max-w-6xl md:mt-28">
      <h2
        class="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-primary"
      >
        Why OpenViber
      </h2>
      <p
        class="mx-auto mb-10 max-w-2xl text-center text-base text-muted-foreground"
      >
        A local-first AI platform designed for people who want their agents to
        actually do things — not just chat.
      </p>

      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {#each valueProps as prop}
          <div
            class="rounded-2xl border border-border/80 bg-card/70 p-6 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <div
              class="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20"
            >
              <prop.icon class="size-5" />
            </div>
            <h3 class="font-semibold text-card-foreground">{prop.title}</h3>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
              {prop.description}
            </p>
          </div>
        {/each}
      </div>
    </section>

    <!-- Built-in Tools -->
    <section class="mx-auto mt-20 max-w-6xl md:mt-28">
      <h2
        class="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-primary"
      >
        Built-in Tools
      </h2>
      <p
        class="mx-auto mb-10 max-w-2xl text-center text-base text-muted-foreground"
      >
        Every viber comes loaded with tools to get real work done — from file
        ops to browser automation.
      </p>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each builtinTools as tool}
          <div
            class="group flex items-start gap-3 rounded-xl border border-border/70 bg-card/50 p-4 transition-colors hover:border-primary/30 hover:bg-card/80"
          >
            <div
              class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"
            >
              <tool.icon class="size-4" />
            </div>
            <div>
              <div class="text-sm font-medium text-card-foreground">
                {tool.name}
              </div>
              <div class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {tool.desc}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Works With -->
    <section class="mx-auto mt-20 max-w-6xl md:mt-28">
      <h2
        class="mb-3 text-center text-sm font-semibold uppercase tracking-widest text-primary"
      >
        Works With
      </h2>
      <p
        class="mx-auto mb-10 max-w-xl text-center text-base text-muted-foreground"
      >
        Vibers drive your favorite dev tools through skills and MCP
        integrations.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-3">
        {#each integrations as name}
          <span
            class="rounded-full border border-border/80 bg-card/60 px-4 py-2 text-sm font-medium text-foreground/90 shadow-sm backdrop-blur transition-colors hover:border-primary/40 hover:bg-card"
          >
            {name}
          </span>
        {/each}
      </div>
    </section>

    <!-- Get Started CTA -->
    <section class="mx-auto mt-20 max-w-3xl text-center md:mt-28">
      <div
        class="rounded-2xl border border-border/80 bg-gradient-to-br from-card to-card/70 px-8 py-10 shadow-sm md:px-12 md:py-14"
      >
        <Wrench class="mx-auto mb-4 size-8 text-primary" />
        <h2 class="text-2xl font-semibold text-card-foreground">
          Get your first viber running in 5 minutes
        </h2>
        <p class="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Install OpenViber, run the onboarding command, and start your first
          viber — all from your terminal.
        </p>

        <div class="mx-auto mt-6 max-w-sm rounded-lg bg-muted/80 px-4 py-3">
          <code class="text-sm text-foreground">npx openviber onboard</code>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/docs/getting-started/quick-start"
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary/90"
          >
            Quick Start Guide
            <ArrowRight class="size-4" />
          </a>
          <a
            href="https://github.com/dustland/openviber"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-lg border border-border bg-background/80 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  </main>

  <!-- Footer -->
  <footer class="border-t border-border/60 bg-card/30 backdrop-blur">
    <div
      class="container mx-auto flex flex-col items-center gap-6 px-6 py-10 md:flex-row md:justify-between md:px-8"
    >
      <div class="flex items-center gap-2">
        <img src="/favicon.png" alt="OpenViber" class="size-5" />
        <span class="text-sm font-medium text-foreground/80">OpenViber</span>
        <span class="text-xs text-muted-foreground"
          >© {new Date().getFullYear()} Dustland</span
        >
      </div>

      <nav class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <a
          href="/docs"
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >Docs</a
        >
        <a
          href="/docs/getting-started/quick-start"
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >Quick Start</a
        >
        <a
          href="https://github.com/dustland/openviber"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >GitHub</a
        >
        <a
          href="https://www.npmjs.com/package/openviber"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >npm</a
        >
      </nav>
    </div>
  </footer>
</div>
