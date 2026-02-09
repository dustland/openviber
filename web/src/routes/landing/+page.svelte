<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import {
    ArrowRight,
    Bot,
    Brain,
    Chrome,
    Clock,
    Code,
    Eye,
    FileText,
    Github,
    Globe,
    Layers,
    Monitor,
    Moon,
    Puzzle,
    Search,
    Shield,
    Sparkles,
    Terminal,
    Wrench,
    Zap,
  } from "@lucide/svelte";

  let { data } = $props();

  const redirectTo = $derived(data.redirectTo || "/");
  const githubAuthUrl = $derived(
    `/auth/github?redirect=${encodeURIComponent(redirectTo)}`,
  );

  const valueProps = [
    {
      icon: Monitor,
      title: "Runs on Your Machine",
      description:
        "No cloud servers. Your laptop is the runtime — full control over data, compute, and costs. Just start it and go.",
    },
    {
      icon: Moon,
      title: "Works While You Sleep",
      description:
        "Cron-scheduled jobs run autonomously overnight. Wake up to finished research, updated repos, and polished reports.",
    },
    {
      icon: Shield,
      title: "Private by Design",
      description:
        "API keys, files, and data never leave your machine. Outbound-only connections — no open ports, no data exfiltration.",
    },
    {
      icon: Layers,
      title: "Multi-Viber Workforce",
      description:
        "Run a dev viber, a researcher, and a PM on one machine — each with its own persona, tools, memory, and budget.",
    },
  ];

  const useCases = [
    {
      icon: Code,
      label: "Development",
      example: '"Build a landing page with dark theme and deploy it"',
      color: "primary",
    },
    {
      icon: Search,
      label: "Research",
      example: '"Analyze competitors and write a market report"',
      color: "primary",
    },
    {
      icon: Clock,
      label: "Automation",
      example: '"Check GitHub issues every morning and summarize"',
      color: "primary",
    },
    {
      icon: Eye,
      label: "Monitoring",
      example: '"Watch CI pipelines and alert me on failures"',
      color: "primary",
    },
  ];

  const howItWorks = [
    {
      step: "01",
      title: "Define Your Viber",
      description:
        "Give it a role, persona, tools, and skills in a simple YAML config. Each viber is a specialist — not a generic chatbot.",
    },
    {
      step: "02",
      title: "Assign Work",
      description:
        "Chat from the Board, run a CLI command, or schedule a cron job. Vibers plan, execute, and verify — then report back with evidence.",
    },
    {
      step: "03",
      title: "Stay in Control",
      description:
        "Watch terminals in real time, approve sensitive actions, set budget limits. Intervene anytime — or let the viber run autonomously.",
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
    { name: "Cursor", category: "IDE" },
    { name: "Claude Code", category: "Agent" },
    { name: "Codex CLI", category: "Agent" },
    { name: "Chrome", category: "Browser" },
    { name: "tmux", category: "Terminal" },
    { name: "Office", category: "Productivity" },
    { name: "Any MCP Server", category: "Protocol" },
  ];

  // Scroll-reveal with IntersectionObserver
  // Must use the .homepage scroll container as root (it's the overflow element)
  onMount(() => {
    const scrollRoot = document.querySelector(".homepage") as Element;
    const reveals = document.querySelectorAll(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { root: scrollRoot, threshold: 0.08, rootMargin: "0px 0px -60px 0px" },
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <title>OpenViber — You Imagine It. Vibers Build It.</title>
  <meta
    name="description"
    content="Turn your machine into an AI workforce. OpenViber runs role-scoped AI agents locally — fully private, fully autonomous, fully yours."
  />
</svelte:head>

<div class="homepage relative h-full overflow-x-hidden overflow-y-auto">
  <!-- Edge glow frame -->
  <div class="edge-glow"></div>

  <!-- Grain texture overlay -->
  <div class="grain"></div>

  <!-- Animated background orbs -->
  <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <main class="container relative mx-auto px-6 py-16 md:px-8 md:py-24">
    <!-- Hero -->
    <section class="mx-auto max-w-5xl pt-8 text-center md:pt-12">
      <div class="hero-logo-wrap mx-auto mb-8 w-fit">
        <img
          src="/favicon.png"
          alt="OpenViber"
          class="hero-logo size-20 md:size-24"
        />
      </div>

      <h1
        class="hero-title pb-1 text-4xl font-semibold leading-[1.15] tracking-tight md:text-6xl"
      >
        You Imagine It. Vibers Build It.
      </h1>
      <p
        class="hero-subtitle mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl"
      >
        Turn your machine into an AI workforce. Deploy role-scoped agents that
        write code, research the web, manage files, and run scheduled jobs — all
        locally, all private, all yours.
      </p>

      <!-- Open source badge -->
      <div
        class="hero-badge mx-auto mt-6 flex items-center justify-center gap-2"
      >
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Sparkles class="size-3 text-primary" />
          100% Open Source
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Shield class="size-3 text-primary" />
          Local-First
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Puzzle class="size-3 text-primary" />
          MCP Native
        </span>
      </div>

      <div
        class="hero-cta mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        {#if data.user}
          <a
            href="/"
            class="cta-primary group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:-translate-y-1"
          >
            Go to Dashboard
            <ArrowRight
              class="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </a>
        {:else if data.supabaseAuthEnabled}
          <a
            href={githubAuthUrl}
            class="cta-primary group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:-translate-y-1"
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
              />
            </svg>
            Sign in with GitHub
            <ArrowRight
              class="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </a>
        {/if}
        <a
          href="/docs"
          class="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/80"
        >
          Read the Docs
        </a>
      </div>
    </section>

    <!-- Divider -->
    <div class="section-divider mx-auto mt-20 md:mt-28"></div>

    <!-- What Vibers Can Do -->
    <section class="reveal mx-auto mt-12 max-w-6xl md:mt-16">
      <h2 class="section-label mb-3 text-center">What Vibers Can Do</h2>
      <p
        class="mx-auto mb-12 max-w-2xl text-center text-base text-muted-foreground"
      >
        Give a viber a goal in plain language. It plans, executes, verifies, and
        reports back — with evidence.
      </p>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {#each useCases as useCase, i}
          <div
            class="reveal-card use-case-card group rounded-2xl p-5"
            style="--delay: {i * 100}ms"
          >
            <div
              class="use-case-icon mb-3 inline-flex size-10 items-center justify-center rounded-xl"
            >
              <useCase.icon class="size-5" />
            </div>
            <div class="mb-2 text-sm font-semibold text-card-foreground">
              {useCase.label}
            </div>
            <p class="text-sm italic leading-relaxed text-muted-foreground/80">
              {useCase.example}
            </p>
          </div>
        {/each}
      </div>
    </section>

    <!-- How it Works -->
    <section class="reveal mx-auto mt-20 max-w-6xl md:mt-28">
      <h2 class="section-label mb-3 text-center">How it Works</h2>
      <p
        class="mx-auto mb-12 max-w-2xl text-center text-base text-muted-foreground"
      >
        From YAML config to autonomous execution in three steps.
      </p>

      <div class="grid gap-6 md:grid-cols-3">
        {#each howItWorks as step, i}
          <div
            class="reveal-card how-step group relative rounded-2xl p-6"
            style="--delay: {i * 120}ms"
          >
            <div class="step-number mb-4">{step.step}</div>
            <h3 class="mb-2 text-lg font-semibold text-card-foreground">
              {step.title}
            </h3>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
            {#if i < howItWorks.length - 1}
              <div class="step-connector hidden md:block">
                <ArrowRight class="size-4 text-primary/40" />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Why OpenViber — dark contrast section -->
    <section
      class="reveal dark-section mx-auto mt-20 max-w-6xl rounded-3xl px-6 py-14 md:mt-28 md:px-10 md:py-16"
    >
      <h2 class="section-label mb-3 text-center">Why OpenViber</h2>
      <p
        class="mx-auto mb-12 max-w-2xl text-center text-base text-[hsl(var(--muted-foreground)/0.8)]"
      >
        A local-first AI platform for people who want their agents to actually
        do things — not just chat.
      </p>

      <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {#each valueProps as prop, i}
          <div
            class="reveal-card glass-card group rounded-2xl p-6"
            style="--delay: {i * 100}ms"
          >
            <div
              class="icon-ring mb-4 inline-flex size-10 items-center justify-center rounded-xl"
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
    <section class="reveal mx-auto mt-20 max-w-6xl md:mt-28">
      <h2 class="section-label mb-3 text-center">Built-in Tools</h2>
      <p
        class="mx-auto mb-12 max-w-2xl text-center text-base text-muted-foreground"
      >
        Every viber ships with real tools — file ops, web search, browser
        automation, terminal sessions, and more.
      </p>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {#each builtinTools as tool, i}
          <div
            class="reveal-card tool-card group flex items-start gap-3 rounded-xl p-4"
            style="--delay: {i * 80}ms"
          >
            <div
              class="tool-icon mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
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
    <section class="reveal mx-auto mt-20 max-w-6xl md:mt-28">
      <h2 class="section-label mb-3 text-center">Integrations</h2>
      <p
        class="mx-auto mb-10 max-w-xl text-center text-base text-muted-foreground"
      >
        Vibers drive your favorite dev tools through skills and MCP servers.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-3">
        {#each integrations as item, i}
          <span
            class="reveal-card integration-pill"
            style="--delay: {i * 70}ms"
          >
            <span class="integration-name">{item.name}</span>
            <span class="integration-category">{item.category}</span>
          </span>
        {/each}
      </div>
    </section>

    <!-- Get Started CTA -->
    <section class="reveal mx-auto mt-20 max-w-3xl text-center md:mt-28">
      <div class="cta-card rounded-2xl px-8 py-10 md:px-12 md:py-14">
        <Bot class="mx-auto mb-4 size-8 text-primary" />
        <h2 class="text-2xl font-semibold text-card-foreground">
          Your first viber, running in 5 minutes
        </h2>
        <p
          class="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground"
        >
          Install OpenViber, run the onboarding wizard, and deploy your first
          viber — all from the terminal.
        </p>

        <div class="code-block mx-auto mt-6 max-w-sm rounded-lg px-4 py-3">
          <code class="text-sm text-foreground">npx openviber onboard</code>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          {#if !data.user && data.supabaseAuthEnabled}
            <a
              href={githubAuthUrl}
              class="cta-primary group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:-translate-y-1"
            >
              <svg
                class="size-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
                />
              </svg>
              Sign in with GitHub
              <ArrowRight
                class="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </a>
          {:else}
            <a
              href="/docs/getting-started/quick-start"
              class="cta-primary group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:-translate-y-1"
            >
              Quick Start Guide
              <ArrowRight
                class="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </a>
          {/if}
          <a
            href="https://github.com/dustland/openviber"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/80"
          >
            <Github class="size-4" />
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  </main>

  <!-- Footer -->
  <footer
    class="relative border-t border-border/40 bg-card/20 backdrop-blur-sm"
  >
    <div
      class="container mx-auto flex flex-col items-center gap-6 px-6 py-10 md:flex-row md:justify-between md:px-8"
    >
      <div class="flex items-center gap-2">
        <img src="/favicon.png" alt="OpenViber" class="size-5" />
        <span class="text-sm font-medium text-foreground/80">OpenViber</span>
        <span class="text-xs text-muted-foreground"
          >&copy; {new Date().getFullYear()} Dustland</span
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

<style>
  /* ── Edge glow frame ── */
  .edge-glow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 50;
    border-radius: 0;
    box-shadow:
      inset 0 0 80px -20px hsl(var(--primary) / 0.08),
      inset 0 0 30px -10px hsl(var(--primary) / 0.04);
    opacity: 0;
    animation: edge-glow-in 1.5s ease-out 0.6s forwards;
  }
  @keyframes edge-glow-in {
    to {
      opacity: 1;
    }
  }

  /* ── Grain texture overlay ── */
  .grain {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 40;
    opacity: 0.025;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-repeat: repeat;
    background-size: 256px 256px;
  }

  /* ── Animated background orbs ── */
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.35;
    will-change: transform;
  }
  .orb-1 {
    width: 40rem;
    height: 40rem;
    top: -12rem;
    left: 50%;
    transform: translateX(-50%);
    background: radial-gradient(
      circle,
      hsl(var(--primary) / 0.3),
      transparent 65%
    );
    animation: float-1 20s ease-in-out infinite;
  }
  .orb-2 {
    width: 26rem;
    height: 26rem;
    top: 22rem;
    right: -10rem;
    background: radial-gradient(
      circle,
      hsl(var(--ring) / 0.22),
      transparent 65%
    );
    animation: float-2 25s ease-in-out infinite;
  }
  .orb-3 {
    width: 22rem;
    height: 22rem;
    top: 64rem;
    left: -8rem;
    background: radial-gradient(
      circle,
      hsl(var(--primary) / 0.18),
      transparent 65%
    );
    animation: float-3 22s ease-in-out infinite;
  }
  @keyframes float-1 {
    0%,
    100% {
      transform: translateX(-50%) translateY(0);
    }
    33% {
      transform: translateX(-45%) translateY(30px);
    }
    66% {
      transform: translateX(-55%) translateY(-20px);
    }
  }
  @keyframes float-2 {
    0%,
    100% {
      transform: translateY(0) translateX(0);
    }
    50% {
      transform: translateY(-40px) translateX(-20px);
    }
  }
  @keyframes float-3 {
    0%,
    100% {
      transform: translateY(0) translateX(0);
    }
    50% {
      transform: translateY(30px) translateX(25px);
    }
  }

  /* ── Hero entrance animations ── */
  .hero-logo-wrap {
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.1s;
  }
  .hero-logo {
    animation: gentle-float 6s ease-in-out 1s infinite;
    filter: drop-shadow(0 0 20px hsl(var(--primary) / 0.15));
  }
  .hero-title {
    background-image: linear-gradient(
      180deg,
      hsl(var(--foreground)),
      hsl(var(--foreground) / 0.65)
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.25s;
  }
  .hero-subtitle {
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.4s;
  }
  .hero-badge {
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.5s;
  }
  .hero-cta {
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.6s;
  }
  @keyframes hero-fade-in {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes gentle-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  /* ── CTA button glow ── */
  .cta-primary {
    box-shadow:
      0 4px 14px -2px hsl(var(--primary) / 0.3),
      0 0 0 0 hsl(var(--primary) / 0);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .cta-primary:hover {
    box-shadow:
      0 8px 24px -4px hsl(var(--primary) / 0.4),
      0 0 0 1px hsl(var(--primary) / 0.15);
  }

  /* ── Section divider gradient ── */
  .section-divider {
    height: 1px;
    max-width: 20rem;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--primary) / 0.4),
      transparent
    );
  }

  /* ── Section label ── */
  .section-label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: hsl(var(--primary));
  }

  /* ── Use case card ── */
  .use-case-card {
    border: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--card) / 0.4);
    backdrop-filter: blur(8px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .use-case-card:hover {
    border-color: hsl(var(--primary) / 0.3);
    background: hsl(var(--card) / 0.7);
    transform: translateY(-4px);
    box-shadow: 0 12px 32px -8px hsl(var(--primary) / 0.1);
  }
  .use-case-icon {
    background: hsl(var(--primary) / 0.08);
    color: hsl(var(--primary));
    border: 1px solid hsl(var(--primary) / 0.15);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .use-case-card:hover .use-case-icon {
    background: hsl(var(--primary) / 0.14);
    border-color: hsl(var(--primary) / 0.25);
    transform: scale(1.1);
  }

  /* ── How-it-works step card ── */
  .how-step {
    border: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--card) / 0.4);
    backdrop-filter: blur(8px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .how-step:hover {
    border-color: hsl(var(--primary) / 0.3);
    background: hsl(var(--card) / 0.7);
    transform: translateY(-4px);
    box-shadow: 0 12px 32px -8px hsl(var(--primary) / 0.1);
  }
  .step-number {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    background: linear-gradient(
      135deg,
      hsl(var(--primary)),
      hsl(var(--primary) / 0.4)
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .step-connector {
    position: absolute;
    right: -1.25rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border) / 0.5);
  }

  /* ── Dark contrast section ── */
  .dark-section {
    background: hsl(var(--card) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
    backdrop-filter: blur(16px);
    box-shadow:
      0 0 0 1px hsl(var(--primary) / 0.04),
      0 20px 60px -12px hsl(var(--background) / 0.3);
  }

  /* ── Glass card ── */
  .glass-card {
    border: 1px solid hsl(var(--border) / 0.6);
    background: hsl(var(--card) / 0.5);
    backdrop-filter: blur(8px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card:hover {
    border-color: hsl(var(--primary) / 0.35);
    transform: translateY(-4px);
    box-shadow:
      0 12px 32px -8px hsl(var(--primary) / 0.12),
      0 0 0 1px hsl(var(--primary) / 0.08);
  }

  /* ── Icon ring ── */
  .icon-ring {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    box-shadow: 0 0 0 1px hsl(var(--primary) / 0.2);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card:hover .icon-ring {
    transform: scale(1.12);
    background: hsl(var(--primary) / 0.15);
    box-shadow:
      0 0 0 1px hsl(var(--primary) / 0.3),
      0 4px 12px -2px hsl(var(--primary) / 0.15);
  }

  /* ── Tool card ── */
  .tool-card {
    border: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--card) / 0.4);
    backdrop-filter: blur(6px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .tool-card:hover {
    border-color: hsl(var(--primary) / 0.3);
    background: hsl(var(--card) / 0.7);
    box-shadow: 0 8px 24px -8px hsl(var(--primary) / 0.1);
  }

  /* ── Tool icon ── */
  .tool-icon {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .tool-card:hover .tool-icon {
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    transform: scale(1.1);
  }

  /* ── Integration pill ── */
  .integration-pill {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem 1.2rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border) / 0.6);
    background: hsl(var(--card) / 0.5);
    backdrop-filter: blur(8px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    gap: 0.125rem;
  }
  .integration-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground) / 0.9);
    line-height: 1.2;
  }
  .integration-category {
    font-size: 0.625rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground) / 0.6);
    line-height: 1.2;
  }
  .integration-pill:hover {
    border-color: hsl(var(--primary) / 0.4);
    background: hsl(var(--card) / 0.8);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px -4px hsl(var(--primary) / 0.1);
  }

  /* ── CTA card ── */
  .cta-card {
    position: relative;
    overflow: hidden;
    border: 1px solid hsl(var(--border) / 0.6);
    background: linear-gradient(
      135deg,
      hsl(var(--card)),
      hsl(var(--card) / 0.6)
    );
    backdrop-filter: blur(12px);
  }
  .cta-card::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background: linear-gradient(
      135deg,
      hsl(var(--primary) / 0.12),
      transparent 40%,
      transparent 60%,
      hsl(var(--primary) / 0.08)
    );
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
    z-index: 0;
  }
  .cta-card:hover::before {
    opacity: 1;
  }
  .cta-card > :global(*) {
    position: relative;
    z-index: 1;
  }

  /* ── Code block with shimmer ── */
  .code-block {
    position: relative;
    overflow: hidden;
    background: hsl(var(--muted) / 0.7);
    border: 1px solid hsl(var(--border) / 0.4);
  }
  .code-block::after {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: 50%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--primary) / 0.07),
      transparent
    );
    animation: shimmer 5s ease-in-out 2s infinite;
  }
  @keyframes shimmer {
    0% {
      left: -100%;
    }
    40% {
      left: 160%;
    }
    100% {
      left: 160%;
    }
  }

  /* ── Scroll-reveal ── */
  .reveal {
    opacity: 0;
    transform: translateY(32px);
    transition:
      opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .reveal:global(.revealed) {
    opacity: 1;
    transform: translateY(0);
  }

  /* ── Staggered card reveal ── */
  .reveal-card {
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  :global(.revealed) .reveal-card {
    opacity: 1;
    transform: translateY(0);
    transition-delay: var(--delay, 0ms);
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
    .orb,
    .hero-logo-wrap,
    .hero-logo,
    .hero-title,
    .hero-subtitle,
    .hero-badge,
    .hero-cta,
    .reveal,
    .reveal-card,
    .edge-glow {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }
    .code-block::after {
      animation: none !important;
    }
  }
</style>
