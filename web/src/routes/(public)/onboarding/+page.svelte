<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    ArrowRight,
    Check,
    Globe,
    Loader2,
    Sparkles,
    Zap,
  } from "@lucide/svelte";

  // ── State ─────────────────────────────────────────────────────────────
  type Step = "welcome" | "model" | "timezone" | "ready";

  const STEP_ORDER: Step[] = ["welcome", "model", "timezone", "ready"];

  let step = $state<Step>("welcome");
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const stepIndex = $derived(STEP_ORDER.indexOf(step));
  /** Progress steps shown as dots (excludes welcome) */
  const PROGRESS_STEPS = STEP_ORDER.slice(1);

  // ── Model ─────────────────────────────────────────────────────────────
  let selectedModel = $state("anthropic/claude-opus-4.6");

  const MODEL_OPTIONS = [
    // ── Flagship ──────────────────────────────────────────
    {
      id: "anthropic/claude-opus-4.6",
      label: "Claude Opus 4.6",
      provider: "Anthropic",
      badge: "Recommended",
      desc: "Top-tier reasoning, code, and agentic tasks",
    },
    {
      id: "openai/gpt-5.3",
      label: "GPT-5.3",
      provider: "OpenAI",
      badge: "",
      desc: "Highly capable general-purpose model",
    },
    {
      id: "google/gemini-3.0-pro",
      label: "Gemini 3.0 Pro",
      provider: "Google",
      badge: "",
      desc: "Advanced reasoning with 2M context window",
    },
    // ── Fast ──────────────────────────────────────────────
    {
      id: "anthropic/claude-sonnet-4.6",
      label: "Claude Sonnet 4.6",
      provider: "Anthropic",
      badge: "Fast",
      desc: "Excellent speed-to-quality for everyday tasks",
    },
    {
      id: "google/gemini-3.0-flash",
      label: "Gemini 3.0 Flash",
      provider: "Google",
      badge: "Fast",
      desc: "Blazing fast, great for real-time workflows",
    },
    {
      id: "openai/gpt-5.3-mini",
      label: "GPT-5.3 Mini",
      provider: "OpenAI",
      badge: "Fast",
      desc: "Compact, fast, and cost-efficient",
    },
    // ── Value (Chinese models) ────────────────────────────
    {
      id: "deepseek/deepseek-v3.2",
      label: "DeepSeek 3.2",
      provider: "DeepSeek",
      badge: "Value",
      desc: "Outstanding quality at very low cost",
    },
    {
      id: "zhipu/glm-4.7",
      label: "GLM-4.7",
      provider: "Zhipu AI",
      badge: "Value",
      desc: "Strong multilingual & coding, budget-friendly",
    },
    {
      id: "qwen/qwen-3.5-max",
      label: "Qwen 3.5 Max",
      provider: "Alibaba",
      badge: "Value",
      desc: "High capability, excellent Chinese & English",
    },
    // ── Reasoning ─────────────────────────────────────────
    {
      id: "deepseek/deepseek-r2",
      label: "DeepSeek R2",
      provider: "DeepSeek",
      badge: "Reasoning",
      desc: "Deep reasoning, open-source, very affordable",
    },
    {
      id: "openai/o4-pro",
      label: "o4 Pro",
      provider: "OpenAI",
      badge: "Reasoning",
      desc: "Extended thinking for complex problems",
    },
  ];

  // ── Timezone ──────────────────────────────────────────────────────────
  let selectedTimezone = $state("");
  let detectedTimezone = $state("");

  const TIMEZONES = [
    { id: "America/New_York", label: "Eastern (New York)" },
    { id: "America/Chicago", label: "Central (Chicago)" },
    { id: "America/Denver", label: "Mountain (Denver)" },
    { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
    { id: "Europe/London", label: "London (GMT/BST)" },
    { id: "Europe/Paris", label: "Central Europe (Paris)" },
    { id: "Europe/Berlin", label: "Central Europe (Berlin)" },
    { id: "Asia/Tokyo", label: "Tokyo (JST)" },
    { id: "Asia/Shanghai", label: "Shanghai (CST)" },
    { id: "Asia/Singapore", label: "Singapore (SGT)" },
    { id: "Asia/Kolkata", label: "India (IST)" },
    { id: "Asia/Dubai", label: "Dubai (GST)" },
    { id: "Australia/Sydney", label: "Sydney (AEST)" },
    { id: "Pacific/Auckland", label: "Auckland (NZST)" },
  ];

  // ── Actions ───────────────────────────────────────────────────────────
  function next() {
    const i = stepIndex;
    if (i < STEP_ORDER.length - 1) step = STEP_ORDER[i + 1];
  }

  function back() {
    const i = stepIndex;
    if (i > 0) step = STEP_ORDER[i - 1];
  }

  function badgeColor(badge: string): string {
    if (badge === "Recommended") return "bg-primary/10 text-primary";
    if (badge === "Fast")
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    if (badge === "Reasoning")
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400";
    if (badge === "Value")
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    return "bg-muted text-muted-foreground";
  }

  async function finish() {
    saving = true;
    error = null;
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatModel: selectedModel || null,
          timezone: selectedTimezone || detectedTimezone || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      goto("/");
    } catch (e) {
      error = e instanceof Error ? e.message : "Something went wrong";
    } finally {
      saving = false;
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────
  onMount(async () => {
    detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    selectedTimezone = detectedTimezone;
    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const data = await res.json();
        if (data.completed) {
          goto("/");
          return;
        }
      }
    } catch {
      /* continue */
    }
    loading = false;
  });
</script>

<svelte:head>
  <title>Welcome — OpenViber</title>
</svelte:head>

{#if loading}
  <div class="min-h-screen flex items-center justify-center bg-background">
    <Loader2 class="size-8 text-muted-foreground/50 animate-spin" />
  </div>
{:else}
  <div
    class="min-h-screen bg-linear-to-b from-background to-muted/20 flex flex-col items-center justify-center p-4"
  >
    <!-- ── Welcome ─────────────────────────────────────────────────────── -->
    {#if step === "welcome"}
      <div class="w-full max-w-md text-center animate-in fade-in">
        <div
          class="size-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-8"
        >
          <img src="/favicon.png" alt="OpenViber" class="size-12" />
        </div>

        <h1 class="text-3xl font-bold text-foreground mb-3">
          Welcome to OpenViber
        </h1>
        <p class="text-lg text-muted-foreground mb-10 leading-relaxed">
          Let's get your AI agent platform ready.<br />
          This takes about 30 seconds.
        </p>

        <button
          type="button"
          onclick={next}
          class="inline-flex items-center gap-2.5 rounded-xl bg-primary px-8 py-3.5 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:shadow-primary/30"
        >
          Get Started
          <ArrowRight class="size-5" />
        </button>

        <p class="text-xs text-muted-foreground/50 mt-8">
          No credit card or API key required
        </p>
      </div>

      <!-- ── Model / Timezone / Ready ────────────────────────────────────── -->
    {:else}
      <div class="w-full max-w-lg">
        <!-- Progress dots -->
        <div class="flex items-center justify-center gap-2 mb-8">
          {#each PROGRESS_STEPS as s, i}
            {@const isActive = s === step}
            {@const isDone = STEP_ORDER.indexOf(s) < STEP_ORDER.indexOf(step)}
            <div
              class="h-1.5 rounded-full transition-all duration-300
                {isActive
                ? 'w-8 bg-primary'
                : isDone
                  ? 'w-8 bg-primary/40'
                  : 'w-8 bg-muted'}"
            ></div>
          {/each}
        </div>

        <!-- Card -->
        <div
          class="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
        >
          <!-- ── Step: Model ─────────────────────────────────────────── -->
          {#if step === "model"}
            <div class="p-6 sm:p-8">
              <h2 class="text-xl font-semibold text-foreground mb-1">
                Choose your AI model
              </h2>
              <p class="text-sm text-muted-foreground mb-2">
                All models work out of the box — no API key needed.
              </p>
              <div
                class="inline-flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mb-6"
              >
                <Zap class="size-3" />
                Powered by OpenRouter · add your own keys later in Settings
              </div>

              <div class="space-y-1.5 max-h-[340px] overflow-y-auto -mx-1 px-1">
                {#each MODEL_OPTIONS as opt (opt.id)}
                  {@const selected = selectedModel === opt.id}
                  <button
                    type="button"
                    onclick={() => (selectedModel = opt.id)}
                    class="w-full flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all
                      {selected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-transparent hover:bg-muted/40'}"
                  >
                    <!-- Radio dot -->
                    <div
                      class="size-4 rounded-full border-2 flex items-center justify-center shrink-0
                        {selected
                        ? 'border-primary'
                        : 'border-muted-foreground/25'}"
                    >
                      {#if selected}
                        <div class="size-2 rounded-full bg-primary"></div>
                      {/if}
                    </div>

                    <!-- Label -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-foreground"
                          >{opt.label}</span
                        >
                        {#if opt.badge}
                          <span
                            class="rounded-full px-1.5 py-px text-[10px] font-medium {badgeColor(
                              opt.badge,
                            )}"
                          >
                            {opt.badge}
                          </span>
                        {/if}
                      </div>
                      <p
                        class="text-xs text-muted-foreground mt-0.5 leading-snug"
                      >
                        {opt.desc}
                      </p>
                    </div>

                    <!-- Provider tag -->
                    <span
                      class="text-[10px] text-muted-foreground/50 shrink-0 hidden sm:block"
                      >{opt.provider}</span
                    >
                  </button>
                {/each}
              </div>
            </div>

            <!-- Footer -->
            <div
              class="border-t border-border px-6 sm:px-8 py-4 flex items-center justify-end"
            >
              <button
                type="button"
                onclick={next}
                class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Continue
                <ArrowRight class="size-4" />
              </button>
            </div>
          {/if}

          <!-- ── Step: Timezone ──────────────────────────────────────── -->
          {#if step === "timezone"}
            <div class="p-6 sm:p-8">
              <h2 class="text-xl font-semibold text-foreground mb-1">
                Your timezone
              </h2>
              <p class="text-sm text-muted-foreground mb-6">
                For scheduling, heartbeats, and time-aware agent behavior.
              </p>

              {#if detectedTimezone}
                <div
                  class="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 mb-5"
                >
                  <div
                    class="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0"
                  >
                    <Globe
                      class="size-5 text-emerald-600 dark:text-emerald-400"
                    />
                  </div>
                  <div>
                    <p class="text-xs text-muted-foreground">Detected</p>
                    <p class="text-base font-semibold text-foreground">
                      {detectedTimezone}
                    </p>
                  </div>
                  <div class="ml-auto">
                    <Check
                      class="size-5 text-emerald-600 dark:text-emerald-400"
                    />
                  </div>
                </div>
              {/if}

              <label
                for="tz"
                class="block text-xs font-medium text-muted-foreground mb-2"
              >
                Change timezone
              </label>
              <select
                id="tz"
                bind:value={selectedTimezone}
                class="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
              >
                {#if detectedTimezone}
                  <option value={detectedTimezone}
                    >{detectedTimezone} (detected)</option
                  >
                {/if}
                {#each TIMEZONES.filter((tz) => tz.id !== detectedTimezone) as tz (tz.id)}
                  <option value={tz.id}>{tz.label}</option>
                {/each}
              </select>
            </div>

            <!-- Footer -->
            <div
              class="border-t border-border px-6 sm:px-8 py-4 flex items-center justify-between"
            >
              <button
                type="button"
                onclick={back}
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onclick={next}
                class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Continue
                <ArrowRight class="size-4" />
              </button>
            </div>
          {/if}

          <!-- ── Step: Ready ─────────────────────────────────────────── -->
          {#if step === "ready"}
            <div class="p-6 sm:p-8 text-center">
              <div
                class="size-14 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5"
              >
                <Sparkles
                  class="size-7 text-emerald-600 dark:text-emerald-400"
                />
              </div>

              <h2 class="text-xl font-semibold text-foreground mb-2">
                You're all set
              </h2>
              <p class="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Your instance is ready. Connect a viber next — run the daemon on
                any machine and onboard it from the Vibers page.
              </p>

              {#if error}
                <div
                  class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 mb-4 text-sm text-destructive text-left"
                >
                  {error}
                </div>
              {/if}

              <div
                class="rounded-xl bg-muted/40 p-4 text-left text-sm space-y-2.5 mb-6"
              >
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Model</span>
                  <span class="font-medium text-foreground">
                    {MODEL_OPTIONS.find((o) => o.id === selectedModel)?.label ??
                      selectedModel}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Timezone</span>
                  <span class="font-medium text-foreground">
                    {selectedTimezone || detectedTimezone}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">AI routing</span>
                  <span class="font-medium text-foreground"
                    >OpenRouter (built-in)</span
                  >
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div
              class="border-t border-border px-6 sm:px-8 py-4 flex items-center justify-between"
            >
              <button
                type="button"
                onclick={back}
                class="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onclick={finish}
                disabled={saving}
                class="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shadow-md shadow-primary/20"
              >
                {#if saving}
                  <Loader2 class="size-4 animate-spin" />
                  Saving…
                {:else}
                  Launch Dashboard
                  <ArrowRight class="size-4" />
                {/if}
              </button>
            </div>
          {/if}
        </div>

        <!-- Sub-text -->
        <p class="text-center text-[11px] text-muted-foreground/40 mt-4">
          You can change all of this later in Settings
        </p>
      </div>
    {/if}
  </div>
{/if}
