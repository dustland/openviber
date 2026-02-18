<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import TypewriterEffect from "$lib/components/landing/typewriter-effect.svelte";
  import InfiniteMarquee from "$lib/components/landing/infinite-marquee.svelte";
  import HeroMockup from "$lib/components/landing/hero-mockup.svelte";
  import CodeTyper from "$lib/components/landing/code-typer.svelte";

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

  // Mouse position for parallax
  let mouseX = $state(0);
  let mouseY = $state(0);

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

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      observer.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
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
  <!-- Edge glow frame -->
  <div class="edge-glow"></div>

  <!-- Grain texture overlay -->
  <div class="grain"></div>

  <!-- Dot grid pattern -->
  <div class="dot-grid"></div>

  <!-- Hero radial grid rings -->
  <div class="hero-grid-rings"></div>

  <!-- Diagonal light beams -->
  <div class="light-beams"></div>

  <!-- Topographic contour lines -->
  <div class="topo-lines"></div>

  <!-- Animated background orbs with parallax -->
  <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    <div class="orb-container orb-1-container">
      <div
        class="orb orb-1"
        style="transform: translate({mouseX * -20}px, {mouseY * -20}px)"
      ></div>
    </div>
    <div class="orb-container orb-2-container">
      <div
        class="orb orb-2"
        style="transform: translate({mouseX * 30}px, {mouseY * 30}px)"
      ></div>
    </div>
    <div class="orb-container orb-3-container">
      <div
        class="orb orb-3"
        style="transform: translate({mouseX * -40}px, {mouseY * -10}px)"
      ></div>
    </div>
  </div>

  <main class="container relative mx-auto px-6 py-10 md:px-8 md:py-16 lg:py-20">
    <!-- Hero -->
    <section class="mx-auto max-w-6xl pt-6 text-center md:pt-10 lg:pt-14">
      <div class="hero-logo-wrap mx-auto mb-6 w-fit">
        <img
          src="/favicon.png"
          alt="OpenViber"
          class="hero-logo size-16 md:size-20 lg:size-24"
        />
      </div>

      <div
        class="hero-badge inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-8"
      >
        <Sparkles class="mr-1.5 size-3" />
        v1.0 Public Beta
      </div>

      <h1
        class="hero-title pb-4 text-6xl font-black leading-[1.05] tracking-tighter sm:text-7xl md:text-8xl lg:text-9xl"
      >
        You Imagine It.<br class="hidden sm:block" />
        <span
          class="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent"
          >Vibers</span
        >
        <TypewriterEffect
          words={["Build It.", "Research It.", "Automate It."]}
        />
      </h1>
      <p
        class="hero-subtitle mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl lg:max-w-4xl"
      >
        Turn your machine into an AI workforce. Deploy role-scoped agents that
        write code, research the web, manage files, and run scheduled jobs — all
        locally, all private, all yours.
      </p>

      <!-- Open source badge -->
      <div
        class="hero-badge mx-auto mt-8 flex items-center justify-center gap-3"
      >
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Code class="size-3.5 text-primary" />
          100% Open Source
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Shield class="size-3.5 text-primary" />
          Local-First
        </span>
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm"
        >
          <Puzzle class="size-3.5 text-primary" />
          MCP Native
        </span>
      </div>

      <div
        class="hero-cta mt-10 flex flex-wrap items-center justify-center gap-4 md:gap-6"
      >
        {#if data.user}
          <a
            href="/"
            class="cta-primary group inline-flex items-center gap-3 rounded-full bg-primary px-12 py-5 text-lg font-bold text-primary-foreground shadow-[0_0_40px_hsl(var(--primary)/0.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_60px_hsl(var(--primary)/0.5)]"
          >
            Go to Viberboard
            <ArrowRight
              class="size-5 transition-transform duration-300 group-hover:translate-x-1"
            />
          </a>
        {:else if data.supabaseAuthEnabled}
          <a
            href={githubAuthUrl}
            class="cta-primary group inline-flex items-center gap-3 rounded-full bg-primary px-12 py-5 text-lg font-bold text-primary-foreground shadow-[0_0_40px_hsl(var(--primary)/0.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_60px_hsl(var(--primary)/0.5)]"
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
          class="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/60 px-8 py-4 text-base font-medium text-foreground backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/80"
        >
          Read the Docs
        </a>
      </div>

      <!-- Hero Mockup -->
      <div class="hero-cta mt-16 md:mt-24 relative z-10">
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-primary/10 blur-[120px] -z-10 rounded-full pointer-events-none"
        ></div>
        <HeroMockup />
      </div>
    </section>

    <!-- Divider -->
    <div class="section-divider mx-auto mt-24 md:mt-32">
      <div class="divider-glow"></div>
    </div>

    <!-- What Vibers Can Do -->
    <section class="reveal mx-auto mt-16 max-w-6xl md:mt-20">
      <h2 class="section-label mb-3 text-center">What Vibers Can Do</h2>
      <p
        class="mx-auto mb-14 max-w-2xl text-center text-base text-muted-foreground md:text-lg"
      >
        Give a viber a goal in plain language. It plans, executes, verifies, and
        reports back — with evidence.
      </p>

      <div class="grid gap-4 md:grid-cols-3">
        {#each useCases as useCase, i}
          <div
            class="reveal-card use-case-card group rounded-2xl p-6 md:p-8 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40 flex flex-col justify-between {useCase.span}"
            style="--delay: {i * 100}ms"
          >
            <div>
              <div
                class="use-case-icon mb-4 inline-flex size-12 items-center justify-center rounded-xl group-hover:bg-primary group-hover:text-primary-foreground"
              >
                <useCase.icon class="size-6" />
              </div>
              <div class="mb-3 text-lg font-semibold text-card-foreground">
                {useCase.label}
              </div>
            </div>
            <p class="text-sm italic leading-relaxed text-muted-foreground/80">
              {useCase.example}
            </p>
          </div>
        {/each}
      </div>
    </section>

    <!-- See it in Action -->
    <section class="reveal mx-auto mt-24 max-w-5xl md:mt-32">
      <div class="grid gap-12 lg:grid-cols-2 items-center">
        <div>
          <h2 class="section-label mb-3">See it in Action</h2>
          <h3 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
            It writes code, not just text.
          </h3>
          <p class="text-base text-muted-foreground leading-relaxed mb-8">
            Vibers generate valid code, run it in a sandboxed environment, read the errors, and fix them automatically. It's like pair programming with a tireless senior engineer.
          </p>

          <div class="flex flex-col gap-4">
             <div class="flex items-start gap-3">
               <div class="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                 <Terminal class="size-3.5" />
               </div>
               <div>
                 <div class="font-medium text-foreground">Real Execution</div>
                 <div class="text-sm text-muted-foreground">Runs commands and scripts on your machine.</div>
               </div>
             </div>
             <div class="flex items-start gap-3">
               <div class="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                 <Zap class="size-3.5" />
               </div>
               <div>
                 <div class="font-medium text-foreground">Self-Correction</div>
                 <div class="text-sm text-muted-foreground">Reads stderr and fixes bugs without asking you.</div>
               </div>
             </div>
          </div>
        </div>

        <div class="relative rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-2 shadow-2xl">
           <div class="rounded-lg bg-[#0d1117] p-4 font-mono text-sm shadow-inner min-h-[300px]">
             <div class="flex gap-1.5 mb-4">
               <div class="size-3 rounded-full bg-red-500/80"></div>
               <div class="size-3 rounded-full bg-yellow-500/80"></div>
               <div class="size-3 rounded-full bg-green-500/80"></div>
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
           <div class="absolute -inset-0.5 -z-10 bg-gradient-to-br from-primary/30 to-purple-600/30 opacity-20 blur-xl rounded-xl"></div>
        </div>
      </div>
    </section>

    <!-- How it Works -->
    <section class="reveal mx-auto mt-24 max-w-6xl md:mt-32">
      <h2 class="section-label mb-3 text-center">How it Works</h2>
      <p
        class="mx-auto mb-14 max-w-2xl text-center text-base text-muted-foreground md:text-lg"
      >
        From YAML config to autonomous execution in three steps.
      </p>

      <div class="grid gap-6 md:grid-cols-3">
        {#each howItWorks as step, i}
          <div
            class="reveal-card how-step group relative rounded-2xl p-6"
            style="--delay: {i * 120}ms"
          >
            <div class="step-number mb-4 drop-shadow-md">{step.step}</div>
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
      class="reveal dark-section mx-auto mt-24 max-w-6xl rounded-3xl px-6 py-14 md:mt-32 md:px-10 md:py-20 lg:px-14 border-primary/20"
    >
      <div class="hex-pattern"></div>
      <h2 class="section-label mb-3 text-center">Why OpenViber</h2>
      <p
        class="mx-auto mb-14 max-w-2xl text-center text-base text-[hsl(var(--muted-foreground)/0.8)] md:text-lg"
      >
        A local-first AI platform for people who want their agents to actually
        do things — not just chat.
      </p>

      <div class="grid gap-6 md:grid-cols-3">
        {#each valueProps as prop, i}
          <div
            class="reveal-card glass-card group relative overflow-hidden rounded-3xl p-6 md:p-8 hover:shadow-2xl hover:shadow-primary/20 {i ===
            0
              ? 'md:col-span-2'
              : ''}"
            style="--delay: {i * 100}ms"
          >
            <!-- Card gradient background -->
            <div
              class="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            ></div>

            <div class="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div
                  class="icon-ring mb-5 inline-flex size-12 items-center justify-center rounded-xl"
                >
                  <prop.icon class="size-6" />
                </div>
                <h3 class="text-xl font-semibold text-card-foreground">
                  {prop.title}
                </h3>
              </div>
              <p
                class="mt-4 text-sm leading-relaxed text-muted-foreground/90 md:text-base"
              >
                {prop.description}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Built-in Tools -->
    <section class="reveal mx-auto mt-24 max-w-6xl md:mt-32">
      <h2 class="section-label mb-3 text-center">Built-in Tools</h2>
      <p
        class="mx-auto mb-14 max-w-2xl text-center text-base text-muted-foreground md:text-lg"
      >
        Every viber ships with real tools — file ops, web search, browser
        automation, terminal sessions, and more.
      </p>

      <div class="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {#each builtinTools as tool, i}
          <div
            class="reveal-card tool-card group flex flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center hover:bg-card/90 hover:scale-[1.02]"
            style="--delay: {i * 60}ms"
          >
            <div
              class="tool-icon flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary group-hover:bg-primary/10 group-hover:scale-110 transition-all duration-300"
            >
              <tool.icon class="size-6" />
            </div>
            <div>
              <div class="text-sm font-semibold text-card-foreground">
                {tool.name}
              </div>
              <p class="mt-1 text-xs text-muted-foreground leading-relaxed">
                {tool.desc}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Works With -->
    <section class="reveal mx-auto mt-24 max-w-6xl md:mt-32 overflow-hidden">
      <h2 class="section-label mb-3 text-center">Integrations</h2>
      <p
        class="mx-auto mb-12 max-w-xl text-center text-base text-muted-foreground md:text-lg"
      >
        Vibers drive your favorite dev tools through skills and MCP servers.
      </p>

      <InfiniteMarquee items={integrations} />
    </section>

    <!-- Community -->
    <section class="reveal mx-auto mt-24 max-w-6xl md:mt-32">
       <div class="rounded-3xl border border-primary/20 bg-primary/5 px-6 py-12 md:px-12 md:py-16 text-center relative overflow-hidden">
          <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay"></div>
          <div class="relative z-10">
             <h2 class="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-6">Join the Community</h2>
             <p class="mx-auto max-w-2xl text-lg text-muted-foreground mb-10">
               OpenViber is open source and community-driven. Join thousands of developers building the future of local AI.
             </p>

             <div class="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
                <div class="flex flex-col items-center gap-2">
                   <div class="text-3xl font-black text-foreground">2.5k+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Github class="size-4" /> Stars
                   </div>
                </div>
                <div class="flex flex-col items-center gap-2">
                   <div class="text-3xl font-black text-foreground">1.2k+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <MessageCircle class="size-4" /> Discord
                   </div>
                </div>
                 <div class="flex flex-col items-center gap-2">
                   <div class="text-3xl font-black text-foreground">50+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <GitMerge class="size-4" /> Contributors
                   </div>
                </div>
                 <div class="flex flex-col items-center gap-2">
                   <div class="text-3xl font-black text-foreground">10k+</div>
                   <div class="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Download class="size-4" /> Downloads
                   </div>
                </div>
             </div>

             <div class="mt-12 flex justify-center gap-4 flex-wrap">
                <a href="https://discord.gg/openviber" target="_blank" class="inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-6 py-3 text-sm font-medium text-white shadow-lg shadow-[#5865F2]/20 hover:bg-[#4752C4] hover:-translate-y-0.5 transition-all">
                   <MessageCircle class="size-4" /> Join Discord
                </a>
                <a href="https://github.com/dustland/openviber" target="_blank" class="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background shadow-lg hover:bg-foreground/90 hover:-translate-y-0.5 transition-all">
                   <Github class="size-4" /> Star on GitHub
                </a>
             </div>
          </div>
       </div>
    </section>

    <!-- Get Started CTA -->
    <section class="reveal mx-auto mt-24 max-w-3xl text-center md:mt-32">
      <div class="cta-card rounded-2xl px-8 py-12 md:px-14 md:py-16">
        <div class="cta-cross-hatch"></div>
        <Bot class="mx-auto mb-4 size-8 text-primary" />
        <h2 class="text-2xl font-semibold text-card-foreground md:text-3xl">
          Your first viber, running in 5 minutes
        </h2>
        <p
          class="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground"
        >
          Install OpenViber, run the onboarding wizard, and deploy your first
          viber — all from the terminal.
        </p>

        <div class="code-block mx-auto mt-8 max-w-sm rounded-lg px-5 py-3.5">
          <code class="text-sm text-foreground">npx openviber onboard</code>
        </div>

        <div
          class="mt-8 flex flex-wrap items-center justify-center gap-3 md:gap-4"
        >
          {#if !data.user && data.supabaseAuthEnabled}
            <a
              href={githubAuthUrl}
              class="cta-primary group inline-flex items-center gap-2.5 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-all duration-300 hover:-translate-y-1"
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
              class="cta-primary group inline-flex items-center gap-2.5 rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-all duration-300 hover:-translate-y-1"
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
    class="relative border-t border-border/40 bg-card/20 backdrop-blur-sm mt-24"
  >
    <div class="container mx-auto px-6 py-16 md:px-8">
      <div class="grid grid-cols-2 gap-10 md:grid-cols-4 lg:grid-cols-5">
        <div class="col-span-2 lg:col-span-2">
          <div class="flex items-center gap-2 mb-4">
            <img src="/favicon.png" alt="OpenViber" class="size-6" />
            <span class="text-base font-bold text-foreground">OpenViber</span>
          </div>
          <p
            class="text-sm text-muted-foreground max-w-xs leading-relaxed mb-6"
          >
            The local-first AI workforce for developers. Private, autonomous,
            and capable.
          </p>
          <p class="text-xs text-muted-foreground mt-6">
            &copy; {new Date().getFullYear()} Dustland. All rights reserved.
          </p>
        </div>

        <div>
          <h3 class="font-semibold text-foreground mb-4 text-sm">Product</h3>
          <ul class="space-y-3 text-sm text-muted-foreground">
            <li>
              <a
                href="/docs/getting-started/quick-start"
                class="hover:text-primary transition-colors">Quick Start</a
              >
            </li>
            <li>
              <a href="/hub" class="hover:text-primary transition-colors"
                >Skill Hub</a
              >
            </li>
            <li>
              <a href="/docs" class="hover:text-primary transition-colors"
                >Documentation</a
              >
            </li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold text-foreground mb-4 text-sm">Community</h3>
          <ul class="space-y-3 text-sm text-muted-foreground">
            <li>
              <a
                href="https://github.com/dustland/openviber"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-primary transition-colors">GitHub</a
              >
            </li>
            <li>
              <a
                href="https://discord.gg/openviber"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-primary transition-colors">Discord</a
              >
            </li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold text-foreground mb-4 text-sm">Legal</h3>
          <ul class="space-y-3 text-sm text-muted-foreground">
            <li>
              <a href="/privacy" class="hover:text-primary transition-colors"
                >Privacy</a
              >
            </li>
            <li>
              <a href="/terms" class="hover:text-primary transition-colors"
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

  /* ── Animated background orbs ── */
  .orb-container {
    position: absolute;
    will-change: transform;
    /* Animation happens on the container */
  }

  .orb-1-container {
    width: 40rem;
    height: 40rem;
    top: -12rem;
    left: 50%;
    margin-left: -20rem; /* Center horizontally */
    animation: float-1 20s ease-in-out infinite;
  }

  .orb-2-container {
    width: 26rem;
    height: 26rem;
    top: 22rem;
    right: -10rem;
    animation: float-2 25s ease-in-out infinite;
  }

  .orb-3-container {
    width: 22rem;
    height: 22rem;
    top: 64rem;
    left: -8rem;
    animation: float-3 22s ease-in-out infinite;
  }

  .orb {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.3;
    mix-blend-mode: screen;
    will-change: transform;
    /* Parallax transform is applied inline */
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .orb-1 {
    background: radial-gradient(
      circle,
      hsl(var(--primary) / 0.3),
      transparent 65%
    );
  }

  .orb-2 {
    background: radial-gradient(
      circle,
      hsl(var(--ring) / 0.22),
      transparent 65%
    );
  }

  .orb-3 {
    background: radial-gradient(
      circle,
      hsl(var(--primary) / 0.18),
      transparent 65%
    );
  }

  @keyframes float-1 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    33% {
      transform: translate(20px, 40px);
    }
    66% {
      transform: translate(-20px, -20px);
    }
  }

  @keyframes float-2 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(-40px, -20px);
    }
  }

  @keyframes float-3 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(30px, 25px);
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
      hsl(var(--foreground) / 0.7)
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hero-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: 0.25s;
    text-shadow: 0 0 40px hsl(var(--primary) / 0.15);
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
      0 4px 20px -4px hsl(var(--primary) / 0.35),
      0 0 0 0 hsl(var(--primary) / 0);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .cta-primary:hover {
    box-shadow:
      0 10px 28px -4px hsl(var(--primary) / 0.45),
      0 0 0 1px hsl(var(--primary) / 0.18);
  }

  /* ── Section divider gradient ── */
  .section-divider {
    position: relative;
    height: 1px;
    max-width: 20rem;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--primary) / 0.4),
      transparent
    );
  }
  .divider-glow {
    position: absolute;
    top: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 12rem;
    height: 17px;
    background: radial-gradient(
      ellipse at center,
      hsl(var(--primary) / 0.12),
      transparent 70%
    );
    pointer-events: none;
  }

  /* ── Section label ── */
  .section-label {
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
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
    border-color: hsl(var(--primary) / 0.5);
    background: hsl(var(--card) / 0.8);
    transform: translateY(-8px) scale(1.03);
    box-shadow: 0 20px 40px -8px hsl(var(--primary) / 0.25);
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
    border-color: hsl(var(--primary) / 0.4);
    background: hsl(var(--card) / 0.7);
    transform: translateY(-4px) scale(1.02);
    box-shadow: 0 12px 32px -8px hsl(var(--primary) / 0.15);
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
    position: relative;
    overflow: hidden;
    background: hsl(var(--card) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
    backdrop-filter: blur(16px);
    box-shadow:
      0 0 0 1px hsl(var(--primary) / 0.04),
      0 20px 60px -12px hsl(var(--background) / 0.3);
  }
  .dark-section > :not(.hex-pattern) {
    position: relative;
    z-index: 1;
  }

  /* ── Glass card ── */
  .glass-card {
    border: 1px solid hsl(var(--border) / 0.6);
    background: hsl(var(--card) / 0.5);
    backdrop-filter: blur(8px);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card:hover {
    border-color: hsl(var(--primary) / 0.45);
    transform: translateY(-4px) scale(1.02);
    box-shadow:
      0 12px 32px -8px hsl(var(--primary) / 0.15),
      0 0 0 1px hsl(var(--primary) / 0.1);
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

  /* ── Dot grid pattern ── */
  .dot-grid {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    opacity: 0.35;
    background-image: radial-gradient(
      circle,
      hsl(var(--foreground) / 0.12) 1px,
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

  /* ── Hero radial grid rings ── */
  .hero-grid-rings {
    position: absolute;
    top: -20rem;
    left: 50%;
    transform: translateX(-50%);
    width: 60rem;
    height: 60rem;
    pointer-events: none;
    z-index: -1;
    opacity: 0;
    animation: rings-fade-in 2s ease-out 0.3s forwards;
    background: radial-gradient(
        circle,
        transparent 8rem,
        hsl(var(--primary) / 0.04) 8.5rem,
        transparent 9rem
      ),
      radial-gradient(
        circle,
        transparent 14rem,
        hsl(var(--primary) / 0.035) 14.5rem,
        transparent 15rem
      ),
      radial-gradient(
        circle,
        transparent 20rem,
        hsl(var(--primary) / 0.03) 20.5rem,
        transparent 21rem
      ),
      radial-gradient(
        circle,
        transparent 26rem,
        hsl(var(--primary) / 0.02) 26.5rem,
        transparent 27rem
      );
    mask-image: radial-gradient(circle at 50% 50%, black 30%, transparent 65%);
    -webkit-mask-image: radial-gradient(
      circle at 50% 50%,
      black 30%,
      transparent 65%
    );
  }
  @keyframes rings-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ── Diagonal light beams ── */
  .light-beams {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: -1;
    opacity: 0.4;
    overflow: hidden;
  }
  .light-beams::before,
  .light-beams::after {
    content: "";
    position: absolute;
    width: 1px;
    height: 200%;
    top: -50%;
    background: linear-gradient(
      to bottom,
      transparent,
      hsl(var(--primary) / 0.06),
      hsl(var(--primary) / 0.1),
      hsl(var(--primary) / 0.06),
      transparent
    );
    animation: beam-drift 30s ease-in-out infinite;
  }
  .light-beams::before {
    left: 20%;
    transform: rotate(15deg);
    animation-delay: 0s;
  }
  .light-beams::after {
    right: 25%;
    transform: rotate(-12deg);
    animation-delay: -15s;
  }
  @keyframes beam-drift {
    0%,
    100% {
      transform: rotate(15deg) translateX(0);
    }
    50% {
      transform: rotate(15deg) translateX(40px);
    }
  }

  /* ── Topographic contour lines ── */
  .topo-lines {
    position: absolute;
    top: 50rem;
    left: 50%;
    transform: translateX(-50%);
    width: 80rem;
    height: 50rem;
    pointer-events: none;
    z-index: -1;
    opacity: 0.25;
    background-image: url("data:image/svg+xml,%3Csvg width='800' height='500' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M-50 250 Q100 180 200 220 Q350 280 450 200 Q550 140 650 210 Q750 260 850 190' fill='none' stroke='%239ca3af' stroke-width='0.5' opacity='0.5'/%3E%3Cpath d='M-50 290 Q120 220 230 260 Q360 310 470 240 Q580 170 670 250 Q770 300 870 230' fill='none' stroke='%239ca3af' stroke-width='0.5' opacity='0.4'/%3E%3Cpath d='M-50 330 Q80 270 190 300 Q330 350 440 270 Q560 200 660 280 Q780 340 880 260' fill='none' stroke='%239ca3af' stroke-width='0.5' opacity='0.3'/%3E%3Cpath d='M-50 210 Q140 150 240 180 Q370 240 480 160 Q590 100 700 170 Q800 230 880 150' fill='none' stroke='%239ca3af' stroke-width='0.5' opacity='0.3'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    animation: topo-float 40s ease-in-out infinite;
  }
  @keyframes topo-float {
    0%,
    100% {
      transform: translateX(-50%) translateY(0);
    }
    50% {
      transform: translateX(-50%) translateY(20px);
    }
  }

  /* ── Hex pattern (for dark section) ── */
  .hex-pattern {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    border-radius: inherit;
    overflow: hidden;
    opacity: 0.5;
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
    opacity: 0.5;
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

  /* ── Floating connection nodes (constellation) ── */
  .homepage::after {
    content: "";
    position: fixed;
    top: 0;
    right: 5%;
    width: 40rem;
    height: 100%;
    pointer-events: none;
    z-index: -1;
    opacity: 0.15;
    background-image: url("data:image/svg+xml,%3Csvg width='400' height='800' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='80' cy='120' r='1.5' fill='%239ca3af' opacity='0.6'/%3E%3Ccircle cx='250' cy='200' r='1' fill='%239ca3af' opacity='0.4'/%3E%3Ccircle cx='150' cy='350' r='1.5' fill='%239ca3af' opacity='0.5'/%3E%3Ccircle cx='320' cy='450' r='1' fill='%239ca3af' opacity='0.3'/%3E%3Ccircle cx='60' cy='550' r='1.5' fill='%239ca3af' opacity='0.4'/%3E%3Ccircle cx='280' cy='650' r='1' fill='%239ca3af' opacity='0.5'/%3E%3Ccircle cx='180' cy='750' r='1.5' fill='%239ca3af' opacity='0.3'/%3E%3Cline x1='80' y1='120' x2='250' y2='200' stroke='%239ca3af' stroke-width='0.3' opacity='0.25'/%3E%3Cline x1='250' y1='200' x2='150' y2='350' stroke='%239ca3af' stroke-width='0.3' opacity='0.2'/%3E%3Cline x1='150' y1='350' x2='320' y2='450' stroke='%239ca3af' stroke-width='0.3' opacity='0.15'/%3E%3Cline x1='320' y1='450' x2='60' y2='550' stroke='%239ca3af' stroke-width='0.3' opacity='0.2'/%3E%3Cline x1='60' y1='550' x2='280' y2='650' stroke='%239ca3af' stroke-width='0.3' opacity='0.15'/%3E%3Cline x1='280' y1='650' x2='180' y2='750' stroke='%239ca3af' stroke-width='0.3' opacity='0.1'/%3E%3C/svg%3E");
    background-repeat: repeat-y;
    background-size: 400px 800px;
    animation: constellation-drift 50s linear infinite;
  }
  @keyframes constellation-drift {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 0 800px;
    }
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
    .edge-glow,
    .hero-grid-rings,
    .topo-lines,
    .light-beams::before,
    .light-beams::after,
    .homepage::after {
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
