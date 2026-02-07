<script lang="ts">
  import { onMount } from "svelte";
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
  <title>OpenViber · You Imagine. Vibers Build.</title>
</svelte:head>

<div class="homepage relative h-full overflow-x-hidden overflow-y-auto">
  <!-- Edge glow frame (Antigravity-inspired) -->
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
    <section class="mx-auto max-w-5xl text-center">
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
        You Imagine. Vibers Build.
      </h1>
      <p
        class="hero-subtitle mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl"
      >
        Turn your machine into an AI coworker. OpenViber runs vibers locally —
        autonomous agents that write code, research the web, manage files, and
        run scheduled tasks while you sleep. Fully private, fully yours.
      </p>

      <div
        class="hero-cta mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <a
          href="/vibers"
          class="cta-primary group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:-translate-y-1"
        >
          Open Control Board
          <ArrowRight
            class="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
          />
        </a>
        <a
          href="/docs"
          class="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/80"
        >
          Read the Docs
        </a>
      </div>
    </section>

    <!-- Divider with gradient line -->
    <div class="section-divider mx-auto mt-20 md:mt-28"></div>

    <!-- Why OpenViber — dark contrast section -->
    <section
      class="reveal dark-section mx-auto mt-12 max-w-6xl rounded-3xl px-6 py-14 md:px-10 md:py-16"
    >
      <h2 class="section-label mb-3 text-center">Why OpenViber</h2>
      <p
        class="mx-auto mb-12 max-w-2xl text-center text-base text-[hsl(var(--muted-foreground)/0.8)]"
      >
        A local-first AI platform designed for people who want their agents to
        actually do things — not just chat.
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
        Every viber comes loaded with tools to get real work done — from file
        ops to browser automation.
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
      <h2 class="section-label mb-3 text-center">Works With</h2>
      <p
        class="mx-auto mb-10 max-w-xl text-center text-base text-muted-foreground"
      >
        Vibers drive your favorite dev tools through skills and MCP
        integrations.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-3">
        {#each integrations as name, i}
          <span
            class="reveal-card integration-pill"
            style="--delay: {i * 70}ms"
          >
            {name}
          </span>
        {/each}
      </div>
    </section>

    <!-- Get Started CTA -->
    <section class="reveal mx-auto mt-20 max-w-3xl text-center md:mt-28">
      <div class="cta-card rounded-2xl px-8 py-10 md:px-12 md:py-14">
        <Wrench class="mx-auto mb-4 size-8 text-primary" />
        <h2 class="text-2xl font-semibold text-card-foreground">
          Get your first viber running in 5 minutes
        </h2>
        <p class="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Install OpenViber, run the onboarding command, and start your first
          viber — all from your terminal.
        </p>

        <div class="code-block mx-auto mt-6 max-w-sm rounded-lg px-4 py-3">
          <code class="text-sm text-foreground">npx openviber onboard</code>
        </div>

        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/docs/getting-started/quick-start"
            class="cta-primary group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all duration-300 hover:-translate-y-1"
          >
            Quick Start Guide
            <ArrowRight
              class="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
            />
          </a>
          <a
            href="https://github.com/dustland/openviber"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background/60 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/80"
          >
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

<style>
  /* ── Edge glow frame (Antigravity-inspired) ── */
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
  .hero-cta {
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.55s;
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
    display: inline-block;
    padding: 0.5rem 1.1rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border) / 0.6);
    background: hsl(var(--card) / 0.5);
    backdrop-filter: blur(8px);
    font-size: 0.875rem;
    font-weight: 500;
    color: hsl(var(--foreground) / 0.9);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
