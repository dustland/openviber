<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import TypewriterEffect from "$lib/components/landing/typewriter-effect.svelte";
  import InfiniteMarquee from "$lib/components/landing/infinite-marquee.svelte";
  import HeroMockup from "$lib/components/landing/hero-mockup.svelte";
  import CodeTyper from "$lib/components/landing/code-typer.svelte";
  import SpotlightCard from "$lib/components/landing/spotlight-card.svelte";

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
    MessageCircle,
    Monitor,
    Moon,
    Puzzle,
    Search,
    Shield,
    Sparkles,
    Terminal,
    Wrench,
    Zap,
    GitMerge,
    Download,
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
      span: "md:col-span-2",
    },
    {
      icon: Search,
      label: "Research",
      example: '"Analyze competitors and write a market report"',
      color: "primary",
      span: "md:col-span-1",
    },
    {
      icon: Clock,
      label: "Automation",
      example: '"Check GitHub issues every morning and summarize"',
      color: "primary",
      span: "md:col-span-1",
    },
    {
      icon: Eye,
      label: "Monitoring",
      example: '"Watch CI pipelines and alert me on failures"',
      color: "primary",
      span: "md:col-span-2",
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

    return () => {
      observer.disconnect();
    };
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
  <!-- Subtle Background Gradient -->
  <div class="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.1),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.2),rgba(0,0,0,0))] pointer-events-none"></div>
  <div class="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.05),transparent_40%)] pointer-events-none"></div>

  <!-- Grain texture overlay -->
  <div class="grain"></div>

  <!-- Dot grid pattern -->
  <div class="dot-grid"></div>

  <main class="container relative mx-auto px-6 py-12 md:px-8 md:py-20 lg:py-24">
    <!-- Hero -->
    <section class="mx-auto max-w-7xl pt-8 text-center md:pt-16 lg:pt-20">
      <div class="hero-logo-wrap mx-auto mb-8 w-fit">
        <img
          src="/favicon.png"
          alt="OpenViber"
          class="hero-logo size-16 md:size-20 lg:size-24"
        />
      </div>

      <div
        class="hero-badge inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-xs font-medium text-primary/80 mb-10 backdrop-blur-sm"
      >
        <Sparkles class="mr-1.5 size-3" />
        v1.0 Public Beta
      </div>

      <h1
        class="hero-title pb-6 text-6xl font-black leading-[0.95] tracking-tighter sm:text-7xl md:text-8xl lg:text-9xl"
      >
        You Imagine It.<br class="hidden sm:block" />
        <span
          class="bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent"
          >Vibers</span
        >
        <TypewriterEffect
          words={["Build It.", "Research It.", "Automate It."]}
        />
      </h1>
      <p
        class="hero-subtitle mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl lg:max-w-3xl"
      >
        Turn your machine into an AI workforce. Deploy role-scoped agents that
        write code, research the web, manage files, and run scheduled jobs — all
        locally, all private, all yours.
      </p>

      <!-- Open source badge -->
      <div
        class="hero-badge mx-auto mt-10 flex items-center justify-center gap-3"
      >
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm shadow-sm"
        >
          <Code class="size-3.5 text-primary/80" />
          100% Open Source
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm shadow-sm"
        >
          <Shield class="size-3.5 text-primary/80" />
          Local-First
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm shadow-sm"
        >
          <Puzzle class="size-3.5 text-primary/80" />
          MCP Native
        </span>
      </div>

      <div
        class="hero-cta mt-12 flex flex-wrap items-center justify-center gap-4 md:gap-6"
      >
        {#if data.user}
          <a
            href="/"
            class="cta-primary group inline-flex items-center gap-3 rounded-full bg-primary px-10 py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/30"
          >
            Go to Viberboard
            <ArrowRight
              class="size-5 transition-transform duration-300 group-hover:translate-x-1"
            />
          </a>
        {:else if data.supabaseAuthEnabled}
          <a
            href={githubAuthUrl}
            class="cta-primary group inline-flex items-center gap-3 rounded-full bg-primary px-10 py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/30"
          >
            <svg
              class="size-5"
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
              class="size-5 transition-transform duration-300 group-hover:translate-x-1"
            />
          </a>
        {/if}
        <a
          href="/docs"
          class="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/50 px-8 py-3.5 text-base font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/50"
        >
          Read the Docs
        </a>
      </div>

      <!-- Hero Mockup -->
      <div class="hero-cta mt-20 md:mt-28 relative z-10">
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/5 blur-[100px] -z-10 rounded-full pointer-events-none"
        ></div>
        <HeroMockup />
      </div>
    </section>

    <!-- Divider -->
    <div class="section-divider mx-auto mt-32 md:mt-40">
      <div class="divider-glow"></div>
    </div>

    <!-- What Vibers Can Do -->
    <section class="reveal mx-auto mt-20 max-w-6xl md:mt-32">
      <h2 class="section-label mb-4 text-center">What Vibers Can Do</h2>
      <p
        class="mx-auto mb-16 max-w-2xl text-center text-lg text-muted-foreground"
      >
        Give a viber a goal in plain language. It plans, executes, verifies, and
        reports back — with evidence.
      </p>

      <div class="grid gap-6 md:grid-cols-3">
        {#each useCases as useCase, i}
          <div class="reveal-card {useCase.span}" style="--delay: {i * 100}ms">
             <SpotlightCard class="h-full flex flex-col justify-between">
                <div>
                  <div
                    class="mb-6 inline-flex size-12 items-center justify-center rounded-xl bg-primary/5 text-primary border border-primary/10"
                  >
                    <useCase.icon class="size-6" />
                  </div>
                  <div class="mb-3 text-xl font-bold text-foreground tracking-tight">
                    {useCase.label}
                  </div>
                </div>
                <p class="text-sm font-medium leading-relaxed text-muted-foreground/90">
                  {useCase.example}
                </p>
             </SpotlightCard>
          </div>
        {/each}
      </div>
    </section>

    <!-- See it in Action -->
    <section class="reveal mx-auto mt-32 max-w-5xl md:mt-40">
      <div class="grid gap-16 lg:grid-cols-2 items-center">
        <div>
          <h2 class="section-label mb-4">See it in Action</h2>
          <h3 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl mb-6">
            It writes code, not just text.
          </h3>
          <p class="text-lg text-muted-foreground leading-relaxed mb-10">
            Vibers generate valid code, run it in a sandboxed environment, read the errors, and fix them automatically. It's like pair programming with a tireless senior engineer.
          </p>

          <div class="flex flex-col gap-6">
             <div class="flex items-start gap-4">
               <div class="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                 <Terminal class="size-4" />
               </div>
               <div>
                 <div class="font-bold text-foreground text-lg">Real Execution</div>
                 <div class="text-sm text-muted-foreground mt-1">Runs commands and scripts on your machine.</div>
               </div>
             </div>
             <div class="flex items-start gap-4">
               <div class="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                 <Zap class="size-4" />
               </div>
               <div>
                 <div class="font-bold text-foreground text-lg">Self-Correction</div>
                 <div class="text-sm text-muted-foreground mt-1">Reads stderr and fixes bugs without asking you.</div>
               </div>
             </div>
          </div>
        </div>

        <div class="relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-2 shadow-2xl">
           <div class="rounded-xl bg-[#0d1117] p-5 font-mono text-sm shadow-inner min-h-[340px]">
             <div class="flex gap-2 mb-6 opacity-70">
               <div class="size-3 rounded-full bg-red-500"></div>
               <div class="size-3 rounded-full bg-yellow-500"></div>
               <div class="size-3 rounded-full bg-green-500"></div>
             </div>
             <CodeTyper lines={[
                "// defining a new task...",
                "import { Task } from '@openviber/core';",
                "",
                "const deployTask = new Task({",
                "  name: 'deploy-web',",
                "  tools: ['git', 'ssh', 'docker'],",
                "  model: 'claude-3-5-sonnet',",
                "  system: 'You are a DevOps engineer.'",
                "});",
                "",
                "await deployTask.start();",
                "// > Task started: deploy-web",
                "// > Cloning repository...",
                "// > Building Docker image...",
                "// > Deploying to production...",
                "// > Success! App is live."
             ]} />
           </div>

           <!-- Decorative elements behind -->
           <div class="absolute -inset-1 -z-10 bg-gradient-to-br from-primary/30 to-purple-600/30 opacity-20 blur-2xl rounded-2xl"></div>
        </div>
      </div>
    </section>

    <!-- How it Works -->
    <section class="reveal mx-auto mt-32 max-w-6xl md:mt-40">
      <h2 class="section-label mb-4 text-center">How it Works</h2>
      <p
        class="mx-auto mb-16 max-w-2xl text-center text-lg text-muted-foreground"
      >
        From YAML config to autonomous execution in three steps.
      </p>

      <div class="grid gap-8 md:grid-cols-3">
        {#each howItWorks as step, i}
          <div
            class="reveal-card how-step group relative rounded-2xl p-8 bg-card/30 border border-border/40 backdrop-blur-sm hover:bg-card/50 transition-all duration-300"
            style="--delay: {i * 120}ms"
          >
            <div class="step-number mb-6 text-4xl font-black text-primary/20 group-hover:text-primary/40 transition-colors">{step.step}</div>
            <h3 class="mb-3 text-xl font-bold text-foreground">
              {step.title}
            </h3>
            <p class="text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
            {#if i < howItWorks.length - 1}
              <div class="step-connector hidden md:flex items-center justify-center absolute -right-4 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full bg-background border border-border text-muted-foreground">
                <ArrowRight class="size-4" />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Why OpenViber — dark contrast section -->
    <section
      class="reveal dark-section mx-auto mt-32 max-w-7xl rounded-[2.5rem] px-8 py-16 md:mt-40 md:px-12 md:py-24 border border-border/40 bg-card/30 backdrop-blur-3xl overflow-hidden relative"
    >
      <div class="hex-pattern"></div>
      <div class="relative z-10">
        <h2 class="section-label mb-4 text-center">Why OpenViber</h2>
        <p
          class="mx-auto mb-16 max-w-2xl text-center text-lg text-muted-foreground/80"
        >
          A local-first AI platform for people who want their agents to actually
          do things — not just chat.
        </p>

        <div class="grid gap-8 md:grid-cols-3">
          {#each valueProps as prop, i}
            <div
              class="reveal-card glass-card group relative overflow-hidden rounded-3xl p-8 hover:bg-white/5 transition-colors {i ===
              0
                ? 'md:col-span-2'
                : ''}"
              style="--delay: {i * 100}ms"
            >
              <div class="relative z-10 flex flex-col h-full justify-between gap-8">
                <div>
                  <div
                    class="mb-6 inline-flex size-14 items-center justify-center rounded-2xl bg-white/5 text-foreground border border-white/10 shadow-inner"
                  >
                    <prop.icon class="size-7" />
                  </div>
                  <h3 class="text-2xl font-bold text-foreground">
                    {prop.title}
                  </h3>
                </div>
                <p
                  class="text-base leading-relaxed text-muted-foreground"
                >
                  {prop.description}
                </p>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Built-in Tools -->
    <section class="reveal mx-auto mt-32 max-w-6xl md:mt-40">
      <h2 class="section-label mb-4 text-center">Built-in Tools</h2>
      <p
        class="mx-auto mb-16 max-w-2xl text-center text-lg text-muted-foreground"
      >
        Every viber ships with real tools — file ops, web search, browser
        automation, terminal sessions, and more.
      </p>

      <div class="grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {#each builtinTools as tool, i}
          <SpotlightCard
            class="flex flex-col items-center justify-center gap-4 p-8 text-center hover:bg-card/60 transition-colors"
          >
            <div
              class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary border border-primary/10 group-hover:scale-110 transition-transform duration-300"
            >
              <tool.icon class="size-7" />
            </div>
            <div>
              <div class="text-base font-bold text-foreground mb-1">
                {tool.name}
              </div>
              <p class="text-xs text-muted-foreground leading-relaxed">
                {tool.desc}
              </p>
            </div>
          </SpotlightCard>
        {/each}
      </div>
    </section>

    <!-- Works With -->
    <section class="reveal mx-auto mt-32 max-w-6xl md:mt-40 overflow-hidden">
      <h2 class="section-label mb-4 text-center">Integrations</h2>
      <p
        class="mx-auto mb-12 max-w-xl text-center text-lg text-muted-foreground"
      >
        Vibers drive your favorite dev tools through skills and MCP servers.
      </p>

      <div class="py-8">
        <InfiniteMarquee items={integrations} />
      </div>
    </section>

    <!-- Community -->
    <section class="reveal mx-auto mt-32 max-w-6xl md:mt-40">
       <div class="rounded-[2.5rem] border border-primary/10 bg-primary/5 px-8 py-16 md:px-16 md:py-24 text-center relative overflow-hidden">
          <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
          <div class="relative z-10">
             <h2 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl mb-6">Join the Community</h2>
             <p class="mx-auto max-w-2xl text-xl text-muted-foreground mb-12">
               OpenViber is open source and community-driven. Join thousands of developers building the future of local AI.
             </p>

             <div class="grid grid-cols-2 md:grid-cols-4 gap-10 max-w-4xl mx-auto mb-16">
                <div class="flex flex-col items-center gap-2">
                   <div class="text-4xl font-black text-foreground tracking-tight">2.5k+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                      <Github class="size-4" /> Stars
                   </div>
                </div>
                <div class="flex flex-col items-center gap-2">
                   <div class="text-4xl font-black text-foreground tracking-tight">1.2k+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                      <MessageCircle class="size-4" /> Discord
                   </div>
                </div>
                 <div class="flex flex-col items-center gap-2">
                   <div class="text-4xl font-black text-foreground tracking-tight">50+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                      <GitMerge class="size-4" /> Contributors
                   </div>
                </div>
                 <div class="flex flex-col items-center gap-2">
                   <div class="text-4xl font-black text-foreground tracking-tight">10k+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                      <Download class="size-4" /> Downloads
                   </div>
                </div>
             </div>

             <div class="flex justify-center gap-4 flex-wrap">
                <a href="https://discord.gg/openviber" target="_blank" class="inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-8 py-4 text-base font-medium text-white shadow-lg shadow-[#5865F2]/20 hover:bg-[#4752C4] hover:-translate-y-1 transition-all">
                   <MessageCircle class="size-5" /> Join Discord
                </a>
                <a href="https://github.com/dustland/openviber" target="_blank" class="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-base font-medium text-background shadow-lg hover:bg-foreground/90 hover:-translate-y-1 transition-all">
                   <Github class="size-5" /> Star on GitHub
                </a>
             </div>
          </div>
       </div>
    </section>

    <!-- Get Started CTA -->
    <section class="reveal mx-auto mt-32 max-w-3xl text-center md:mt-40 mb-20">
      <div class="cta-card rounded-3xl px-8 py-16 md:px-16 md:py-20 border border-border/60 bg-card/40 backdrop-blur-xl">
        <div class="cta-cross-hatch"></div>
        <Bot class="mx-auto mb-6 size-10 text-primary" />
        <h2 class="text-3xl font-bold text-foreground md:text-4xl tracking-tight">
          Your first viber, running in 5 minutes
        </h2>
        <p
          class="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground"
        >
          Install OpenViber, run the onboarding wizard, and deploy your first
          viber — all from the terminal.
        </p>

        <div class="code-block mx-auto mt-10 max-w-sm rounded-xl px-6 py-4 shadow-inner bg-muted/50 border border-border/50">
          <code class="text-base font-mono text-foreground font-semibold">npx openviber onboard</code>
        </div>

        <div
          class="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          {#if !data.user && data.supabaseAuthEnabled}
            <a
              href={githubAuthUrl}
              class="cta-primary group inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground transition-all duration-300 hover:-translate-y-1"
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
              class="cta-primary group inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-3.5 text-sm font-bold text-primary-foreground transition-all duration-300 hover:-translate-y-1"
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
            class="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/50 px-6 py-3.5 text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/80"
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
    class="relative border-t border-border/40 bg-card/30 backdrop-blur-md"
  >
    <div class="container mx-auto px-6 py-20 md:px-8">
      <div class="grid grid-cols-2 gap-12 md:grid-cols-4 lg:grid-cols-5">
        <div class="col-span-2 lg:col-span-2">
          <div class="flex items-center gap-2 mb-6">
            <img src="/favicon.png" alt="OpenViber" class="size-8" />
            <span class="text-xl font-bold text-foreground tracking-tight">OpenViber</span>
          </div>
          <p
            class="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8"
          >
            The local-first AI workforce for developers. Private, autonomous,
            and capable.
          </p>
          <p class="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} Dustland. All rights reserved.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-foreground mb-6 text-sm uppercase tracking-wider">Product</h3>
          <ul class="space-y-4 text-sm text-muted-foreground">
            <li>
              <a
                href="/docs/getting-started/quick-start"
                class="hover:text-foreground transition-colors">Quick Start</a
              >
            </li>
            <li>
              <a href="/hub" class="hover:text-foreground transition-colors"
                >Skill Hub</a
              >
            </li>
            <li>
              <a href="/docs" class="hover:text-foreground transition-colors"
                >Documentation</a
              >
            </li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold text-foreground mb-6 text-sm uppercase tracking-wider">Community</h3>
          <ul class="space-y-4 text-sm text-muted-foreground">
            <li>
              <a
                href="https://github.com/dustland/openviber"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground transition-colors">GitHub</a
              >
            </li>
            <li>
              <a
                href="https://discord.gg/openviber"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground transition-colors">Discord</a
              >
            </li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold text-foreground mb-6 text-sm uppercase tracking-wider">Legal</h3>
          <ul class="space-y-4 text-sm text-muted-foreground">
            <li>
              <a href="/privacy" class="hover:text-foreground transition-colors"
                >Privacy</a
              >
            </li>
            <li>
              <a href="/terms" class="hover:text-foreground transition-colors"
                >Terms</a
              >
            </li>
          </ul>
        </div>
      </div>
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
      hsl(var(--foreground) / 0.7)
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.25s;
    text-shadow: 0 0 40px hsl(var(--primary) / 0.05);
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
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ── Section divider gradient ── */
  .section-divider {
    position: relative;
    height: 1px;
    max-width: 24rem;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--border)),
      transparent
    );
  }
  .divider-glow {
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 16rem;
    height: 17px;
    background: radial-gradient(
      ellipse at center,
      hsl(var(--primary) / 0.08),
      transparent 70%
    );
    pointer-events: none;
  }

  /* ── Section label ── */
  .section-label {
    font-size: 0.875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: hsl(var(--primary));
  }

  /* ── Glass card ── */
  .glass-card {
    border: 1px solid hsl(var(--border) / 0.3);
    background: hsl(var(--card) / 0.2);
    backdrop-filter: blur(8px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card:hover {
    border-color: hsl(var(--primary) / 0.3);
    background: hsl(var(--card) / 0.4);
    transform: translateY(-4px);
  }

  /* ── CTA card ── */
  .cta-card {
    position: relative;
    overflow: hidden;
  }
  .cta-card::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background: linear-gradient(
      135deg,
      hsl(var(--primary) / 0.1),
      transparent 40%,
      transparent 60%,
      hsl(var(--primary) / 0.05)
    );
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
  }
  .cta-card > :global(*) {
    position: relative;
    z-index: 1;
  }

  /* ── Code block with shimmer ── */
  .code-block {
    position: relative;
    overflow: hidden;
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
      hsl(var(--primary) / 0.05),
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

  /* ── Dot grid pattern ── */
  .dot-grid {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    opacity: 0.3;
    background-image: radial-gradient(
      circle,
      hsl(var(--foreground) / 0.1) 1px,
      transparent 1px
    );
    background-size: 32px 32px;
    mask-image: radial-gradient(
      ellipse 80% 60% at 50% 30%,
      black 20%,
      transparent 70%
    );
    -webkit-mask-image: radial-gradient(
      ellipse 80% 60% at 50% 30%,
      black 20%,
      transparent 70%
    );
  }

  /* ── Hex pattern (for dark section) ── */
  .hex-pattern {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    overflow: hidden;
    opacity: 0.3;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.06'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    mask-image: radial-gradient(
      ellipse 80% 70% at 50% 50%,
      black 20%,
      transparent 70%
    );
    -webkit-mask-image: radial-gradient(
      ellipse 80% 70% at 50% 50%,
      black 20%,
      transparent 70%
    );
  }

  /* ── CTA cross-hatch pattern ── */
  .cta-cross-hatch {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    overflow: hidden;
    opacity: 0.3;
    background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40L40 0M-10 10L10-10M30 50L50 30' stroke='%239C92AC' stroke-opacity='0.05' stroke-width='0.5'/%3E%3C/svg%3E");
    mask-image: radial-gradient(
      ellipse 90% 80% at 50% 50%,
      black 20%,
      transparent 70%
    );
    -webkit-mask-image: radial-gradient(
      ellipse 90% 80% at 50% 50%,
      black 20%,
      transparent 70%
    );
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
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
