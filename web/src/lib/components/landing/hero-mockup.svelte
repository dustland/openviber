<script lang="ts">
  import { onMount } from "svelte";

  // Terminal typing animation
  let terminalLines = $state<string[]>([]);
  const terminalScript = [
    "$ npx openviber start",
    "\x1b[32m✓\x1b[0m Loading viber graph...",
    "\x1b[32m✓\x1b[0m Connected 3 vibers · 12 tools",
    "\x1b[36m◆\x1b[0m frontend-dev  \x1b[33m● active\x1b[0m  \x1b[90m↻ task-218\x1b[0m",
    "\x1b[36m◆\x1b[0m researcher    \x1b[33m● active\x1b[0m  \x1b[90m↻ task-219\x1b[0m",
    "\x1b[36m◆\x1b[0m devops        \x1b[32m● idle\x1b[0m    \x1b[90m✓ standby\x1b[0m",
    "",
    "\x1b[90m[14:32:11]\x1b[0m researcher posted API notes",
    "\x1b[90m[14:32:16]\x1b[0m frontend-dev pushed preview on :6006",
    "\x1b[90m[14:32:21]\x1b[0m Awaiting deploy approval...",
  ];

  // Web UI streaming lines
  let streamLines = $state<string[]>([]);
  const streamScript = [
    { role: "system", text: "Plan active: Dashboard + date filter + docs" },
    {
      role: "tool",
      text: "▸ read_file web/src/routes/(public)/landing/+page.svelte",
    },
    { role: "tool", text: '▸ search_files "chart" web/src/lib/components' },
    {
      role: "ai",
      text: "Found reusable chart utilities. Building responsive card grid and toolbar.",
    },
    {
      role: "tool",
      text: "▸ write_file web/src/lib/components/dashboard-grid.svelte",
    },
    {
      role: "ai",
      text: "Added loading states, empty states, and keyboard shortcuts.",
    },
    { role: "tool", text: "▸ exec pnpm --dir web check" },
    { role: "system", text: "✓ Typecheck clean · preview healthy" },
  ];

  // Chat messages
  let chatMessages = $state<
    Array<{ from: string; text: string; time: string }>
  >([]);
  const chatScript = [
    {
      from: "you",
      text: "Build a dashboard page with charts and a date filter",
      time: "2:30 PM",
    },
    {
      from: "viber",
      text: "On it. Reusing existing chart utilities and adding a compact toolbar for filters.",
      time: "2:30 PM",
    },
    {
      from: "viber",
      text: "Dashboard ready. Three charts, responsive layout, keyboard nav, and dark mode support. Preview on localhost:6006",
      time: "2:32 PM",
    },
    { from: "you", text: "Polish card spacing and run checks", time: "2:33 PM" },
    {
      from: "viber",
      text: "Done. Improved spacing scale, added 7/30/90-day presets, and checks pass.",
      time: "2:34 PM",
    },
  ];

  // Animate terminal
  function animateTerminal() {
    let i = 0;
    const interval = setInterval(() => {
      if (i < terminalScript.length) {
        terminalLines = [...terminalLines, terminalScript[i]];
        i++;
      } else {
        clearInterval(interval);
        // Loop after pause
        setTimeout(() => {
          terminalLines = [];
          animateTerminal();
        }, 4000);
      }
    }, 400);
    return interval;
  }

  // Animate stream
  function animateStream() {
    let i = 0;
    const interval = setInterval(() => {
      if (i < streamScript.length) {
        streamLines = [
          ...streamLines,
          streamScript[i].role + ":" + streamScript[i].text,
        ];
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          streamLines = [];
          animateStream();
        }, 5000);
      }
    }, 800);
    return interval;
  }

  // Animate chat
  function animateChat() {
    let i = 0;
    const interval = setInterval(() => {
      if (i < chatScript.length) {
        chatMessages = [...chatMessages, chatScript[i]];
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          chatMessages = [];
          animateChat();
        }, 5000);
      }
    }, 1200);
    return interval;
  }

  onMount(() => {
    const t1 = animateTerminal();
    const t2 = setTimeout(() => animateStream(), 300);
    const t3 = setTimeout(() => animateChat(), 600);
    return () => {
      clearInterval(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  });

  function renderAnsi(text: string) {
    return text
      .replace(/\x1b\[32m/g, '<span class="text-green-400">')
      .replace(/\x1b\[33m/g, '<span class="text-yellow-400">')
      .replace(/\x1b\[36m/g, '<span class="text-cyan-400">')
      .replace(/\x1b\[90m/g, '<span class="text-white/40">')
      .replace(/\x1b\[0m/g, "</span>");
  }

  function parseStreamLine(line: string) {
    const colonIdx = line.indexOf(":");
    const role = line.substring(0, colonIdx);
    const text = line.substring(colonIdx + 1);
    return { role, text };
  }
</script>

<div class="mockup-container">
  <div class="mockup-halo" aria-hidden="true"></div>
  <div class="mockup-grid" aria-hidden="true"></div>

  <!-- Terminal Panel — macOS terminal frame -->
  <div class="mockup-panel terminal-panel">
    <div class="panel-titlebar terminal-titlebar">
      <div class="traffic-lights">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
      </div>
      <span class="terminal-tab">bash — 80×24</span>
    </div>
    <div class="panel-body terminal-body">
      <div class="terminal-meta">
        <span class="terminal-pill">workspace: frontend-dev</span>
        <span class="terminal-pill terminal-pill-live">live stream</span>
      </div>
      {#each terminalLines as line}
        <div class="terminal-line">{@html renderAnsi(line)}</div>
      {/each}
      <div class="terminal-cursor">█</div>
    </div>
  </div>

  <!-- Web UI Panel — browser frame -->
  <div class="mockup-panel webui-panel">
    <div class="panel-titlebar browser-titlebar">
      <div class="traffic-lights">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
      </div>
      <div class="browser-nav">
        <span class="browser-nav-btn">‹</span>
        <span class="browser-nav-btn">›</span>
      </div>
      <div class="browser-address-bar">
        <span class="address-lock">🔒</span>
        <span class="address-text">localhost:6006/vibers/frontend-dev</span>
      </div>
    </div>
    <div class="panel-body webui-body">
      <div class="webui-header">
        <div class="webui-avatar">🤖</div>
        <div>
          <div class="webui-name">frontend-dev</div>
          <div class="webui-status">Working on task...</div>
        </div>
      </div>
      <div class="webui-toolbar">
        <span class="webui-pill webui-pill-primary">Plan active</span>
        <span class="webui-pill">4 tools</span>
        <span class="webui-pill">1 review gate</span>
      </div>
      <div class="webui-stream">
        {#each streamLines as line}
          {@const parsed = parseStreamLine(line)}
          <div class="stream-line stream-{parsed.role}">
            {#if parsed.role === "tool"}
              <span class="stream-tool-badge">tool</span>
              <span class="stream-tool-text">{parsed.text}</span>
            {:else if parsed.role === "system"}
              <span class="stream-system">{parsed.text}</span>
            {:else}
              <span class="stream-ai">{parsed.text}</span>
            {/if}
          </div>
        {/each}
      </div>
      <div class="webui-footer">
        <div class="webui-metric">
          <span class="metric-label">Files</span>
          <span class="metric-value">06</span>
        </div>
        <div class="webui-metric">
          <span class="metric-label">Checks</span>
          <span class="metric-value">PASS</span>
        </div>
        <div class="webui-metric">
          <span class="metric-label">ETA</span>
          <span class="metric-value">2m</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Chat Panel — mobile phone frame -->
  <div class="mockup-panel phone-panel">
    <div class="phone-notch">
      <div class="phone-speaker"></div>
    </div>
    <div class="phone-status-bar">
      <span class="phone-time">2:30</span>
      <div class="phone-status-icons">
        <span class="phone-signal">●●●○</span>
        <span class="phone-battery">🔋</span>
      </div>
    </div>
    <div class="phone-app-header">
      <span class="phone-app-name">OpenViber</span>
      <span class="phone-app-subtitle">frontend-dev</span>
    </div>
    <div class="panel-body chat-body">
      {#each chatMessages as msg}
        <div class="chat-msg chat-msg-{msg.from}">
          <div class="chat-bubble chat-bubble-{msg.from}">
            {msg.text}
          </div>
          <div class="chat-time">{msg.time}</div>
        </div>
      {/each}
      {#if chatMessages.length > 0}
        <div class="chat-typing" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .mockup-container {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.9rem;
    max-width: 72rem;
    margin: 0 auto;
    padding: 1rem;
    border-radius: 1.5rem;
    border: 1px solid hsl(var(--border) / 0.45);
    background:
      radial-gradient(
        circle at 18% 18%,
        hsl(var(--primary) / 0.14),
        transparent 42%
      ),
      radial-gradient(
        circle at 82% 12%,
        hsl(188 90% 55% / 0.1),
        transparent 35%
      ),
      linear-gradient(
        150deg,
        hsl(var(--background) / 0.86),
        hsl(var(--muted) / 0.35)
      );
    box-shadow:
      inset 0 1px 0 hsl(var(--background) / 0.5),
      0 24px 70px -40px hsl(var(--background) / 0.85);
    overflow: hidden;
  }

  .mockup-halo {
    position: absolute;
    inset: -35% -12%;
    background: radial-gradient(
      ellipse at center,
      hsl(var(--primary) / 0.14),
      transparent 62%
    );
    filter: blur(40px);
    z-index: -2;
    pointer-events: none;
  }

  .mockup-grid {
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      repeating-linear-gradient(
        90deg,
        transparent 0,
        transparent 48px,
        hsl(var(--border) / 0.14) 49px
      ),
      repeating-linear-gradient(
        0deg,
        transparent 0,
        transparent 48px,
        hsl(var(--border) / 0.14) 49px
      );
    mask-image: linear-gradient(to bottom, transparent, black 30%, black 85%, transparent);
    opacity: 0.5;
    pointer-events: none;
  }

  @media (min-width: 768px) {
    .mockup-container {
      grid-template-columns: 1fr 1.4fr 0.7fr;
      gap: 1.25rem;
      align-items: end;
      padding: 1.4rem 1.5rem;
    }
  }

  /* ── Panel base ── */
  .mockup-panel {
    position: relative;
    border-radius: 0.75rem;
    border: 1px solid hsl(var(--border) / 0.5);
    background: hsl(var(--card) / 0.6);
    backdrop-filter: blur(12px);
    overflow: hidden;
    box-shadow:
      0 8px 32px -8px hsl(var(--background) / 0.5),
      0 0 0 1px hsl(var(--primary) / 0.04);
    transition:
      transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    animation: panel-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    z-index: 1;
  }

  .mockup-panel::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--primary) / 0.5),
      transparent
    );
    opacity: 0.5;
    pointer-events: none;
  }

  .mockup-panel:hover {
    transform: translateY(-5px) scale(1.012);
    box-shadow:
      0 20px 54px -22px hsl(var(--primary) / 0.3),
      0 0 0 1px hsl(var(--primary) / 0.18);
  }

  .terminal-panel {
    animation-delay: 0.1s;
    text-align: left;
  }
  .webui-panel {
    animation-delay: 0.25s;
    text-align: left;
  }
  .phone-panel {
    animation-delay: 0.4s;
  }

  @keyframes panel-enter {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(0.999);
    }
  }

  /* ── Shared elements ── */
  .traffic-lights {
    display: flex;
    gap: 0.375rem;
  }

  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .dot-red {
    background: #ff5f56;
  }
  .dot-yellow {
    background: #ffbd2e;
  }
  .dot-green {
    background: #27c93f;
  }

  .panel-body {
    padding: 0.75rem;
    min-height: 0;
    overflow: hidden;
  }

  /* ═══════════════════════════════════
     1. TERMINAL — macOS terminal frame
     ═══════════════════════════════════ */
  .terminal-panel {
    background:
      radial-gradient(circle at 75% 15%, hsl(208 80% 52% / 0.16), transparent 40%),
      radial-gradient(circle at 18% 90%, hsl(187 82% 40% / 0.12), transparent 45%),
      hsl(223 26% 8% / 0.96);
    border-color: hsl(220 14% 24% / 0.75);
  }

  @media (min-width: 768px) {
    .terminal-panel {
      margin-bottom: 1.2rem;
    }
  }

  .terminal-titlebar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid hsl(220 10% 20% / 0.4);
    background: hsl(220 16% 12% / 0.9);
  }

  .terminal-tab {
    margin-left: auto;
    margin-right: auto;
    font-size: 0.625rem;
    font-weight: 500;
    color: hsl(210 10% 50%);
    font-family: "SF Mono", "Fira Code", monospace;
    letter-spacing: 0.02em;
  }

  .terminal-body {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.6875rem;
    line-height: 1.6;
    height: 16.5rem;
    max-height: 16.5rem;
    position: relative;
  }

  .terminal-body::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      180deg,
      transparent 0,
      transparent 1px,
      hsl(0 0% 100% / 0.015) 2px
    );
    pointer-events: none;
  }

  .terminal-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
  }

  .terminal-pill {
    padding: 0.125rem 0.375rem;
    border-radius: 999px;
    border: 1px solid hsl(215 18% 30% / 0.7);
    background: hsl(220 20% 15% / 0.65);
    color: hsl(210 18% 75%);
    font-size: 0.53rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .terminal-pill-live {
    border-color: hsl(146 62% 35% / 0.8);
    background: hsl(146 62% 28% / 0.15);
    color: hsl(146 64% 61%);
  }

  .terminal-line {
    color: hsl(210 10% 75%);
    white-space: nowrap;
    animation: line-appear 0.2s ease-out both;
  }

  .terminal-cursor {
    display: inline-block;
    color: hsl(var(--primary));
    animation: blink 1s step-end infinite;
    font-size: 0.6875rem;
    line-height: 1;
  }

  @keyframes line-appear {
    from {
      opacity: 0;
      transform: translateX(-4px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
  }

  /* ═══════════════════════════════════
     2. BROWSER — Chrome-style frame
     ═══════════════════════════════════ */
  .browser-titlebar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid hsl(var(--border) / 0.4);
    background: hsl(var(--card) / 0.88);
  }

  .browser-nav {
    display: flex;
    gap: 0.125rem;
  }

  .browser-nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground) / 0.5);
    border-radius: 0.25rem;
    line-height: 1;
    user-select: none;
  }

  .browser-address-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.625rem;
    border-radius: 1rem;
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border) / 0.3);
    min-width: 0;
  }

  .address-lock {
    font-size: 0.5rem;
    flex-shrink: 0;
  }

  .address-text {
    font-size: 0.625rem;
    color: hsl(var(--muted-foreground));
    font-family: "SF Mono", "Fira Code", monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Web UI body */
  .webui-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.625rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid hsl(var(--border) / 0.3);
  }
  .webui-avatar {
    font-size: 1.25rem;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--primary) / 0.1);
    border-radius: 0.5rem;
    flex-shrink: 0;
  }
  .webui-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }
  .webui-status {
    font-size: 0.625rem;
    color: hsl(var(--muted-foreground));
  }

  .webui-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    height: 17.5rem;
    max-height: 17.5rem;
    background: linear-gradient(
      180deg,
      hsl(var(--card) / 0.7) 0%,
      hsl(var(--card) / 0.42) 100%
    );
  }

  .webui-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .webui-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.42rem;
    border-radius: 999px;
    border: 1px solid hsl(var(--border) / 0.55);
    background: hsl(var(--muted) / 0.55);
    color: hsl(var(--muted-foreground));
    font-size: 0.54rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .webui-pill-primary {
    border-color: hsl(var(--primary) / 0.45);
    background: hsl(var(--primary) / 0.14);
    color: hsl(var(--primary));
  }

  .webui-stream {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    overflow: hidden;
    mask-image: linear-gradient(
      to bottom,
      transparent 0%,
      black 6%,
      black 92%,
      transparent 100%
    );
    padding-top: 0.125rem;
  }

  .stream-line {
    animation: line-appear 0.3s ease-out both;
    font-size: 0.6875rem;
    line-height: 1.5;
  }

  .stream-tool-badge {
    display: inline-block;
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.25rem;
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--primary));
    margin-right: 0.375rem;
    vertical-align: middle;
  }
  .stream-tool-text {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.625rem;
    color: hsl(var(--muted-foreground));
  }
  .stream-system {
    color: hsl(142 71% 45%);
    font-weight: 500;
    font-size: 0.6875rem;
  }
  .stream-ai {
    color: hsl(var(--foreground) / 0.85);
    font-size: 0.6875rem;
  }

  .webui-footer {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    margin-top: 0.125rem;
  }

  .webui-metric {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-radius: 0.45rem;
    border: 1px solid hsl(var(--border) / 0.45);
    background: hsl(var(--muted) / 0.4);
    padding: 0.25rem 0.375rem;
  }

  .metric-label {
    font-size: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground) / 0.7);
  }

  .metric-value {
    font-size: 0.625rem;
    font-weight: 700;
    color: hsl(var(--foreground));
  }

  /* ═══════════════════════════════════
     3. PHONE — Mobile app frame
     ═══════════════════════════════════ */
  .phone-panel {
    border-radius: 1.65rem;
    border: 2px solid hsl(var(--border) / 0.62);
    background:
      radial-gradient(circle at 25% 0%, hsl(var(--primary) / 0.12), transparent 35%),
      hsl(var(--card) / 0.78);
    position: relative;
    padding-top: 0;
    max-width: 21rem;
    margin: 0 auto;
  }

  @media (min-width: 768px) {
    .phone-panel {
      margin-bottom: 0.4rem;
      max-width: none;
    }
  }

  .phone-notch {
    display: flex;
    justify-content: center;
    padding-top: 0.375rem;
    background: hsl(var(--card) / 0.9);
  }

  .phone-speaker {
    width: 3rem;
    height: 0.1875rem;
    border-radius: 1rem;
    background: hsl(var(--muted-foreground) / 0.2);
  }

  .phone-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0.875rem 0.25rem;
    background: hsl(var(--card) / 0.9);
  }

  .phone-time {
    font-size: 0.625rem;
    font-weight: 700;
    color: hsl(var(--foreground));
  }

  .phone-status-icons {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.5rem;
    color: hsl(var(--muted-foreground));
  }

  .phone-signal {
    letter-spacing: -0.05em;
    font-size: 0.5rem;
  }
  .phone-battery {
    font-size: 0.625rem;
  }

  .phone-app-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.75rem 0.5rem;
    border-bottom: 1px solid hsl(var(--border) / 0.3);
    background: hsl(var(--card) / 0.9);
  }

  .phone-app-name {
    font-size: 0.6875rem;
    font-weight: 700;
    color: hsl(var(--foreground));
  }

  .phone-app-subtitle {
    font-size: 0.5625rem;
    color: hsl(var(--muted-foreground));
  }

  /* Chat body */
  .chat-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    height: 18rem;
    max-height: 18rem;
    background: linear-gradient(
      180deg,
      hsl(var(--background) / 0.18) 0%,
      hsl(var(--background) / 0.32) 100%
    );
  }

  .chat-msg {
    display: flex;
    flex-direction: column;
    animation: msg-appear 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .chat-msg-you {
    align-items: flex-end;
  }
  .chat-msg-viber {
    align-items: flex-start;
  }

  .chat-bubble {
    max-width: 88%;
    padding: 0.4375rem 0.625rem;
    border-radius: 0.875rem;
    font-size: 0.6875rem;
    line-height: 1.45;
    box-shadow: 0 6px 14px -12px hsl(var(--background) / 0.7);
  }

  .chat-bubble-you {
    background: linear-gradient(
      135deg,
      hsl(var(--primary)),
      hsl(var(--primary) / 0.85)
    );
    color: hsl(var(--primary-foreground));
    border-bottom-right-radius: 0.25rem;
  }

  .chat-bubble-viber {
    background: linear-gradient(
      180deg,
      hsl(var(--accent)),
      hsl(var(--accent) / 0.82)
    );
    color: hsl(var(--accent-foreground));
    border-bottom-left-radius: 0.25rem;
  }

  .chat-time {
    font-size: 0.5625rem;
    color: hsl(var(--muted-foreground) / 0.6);
    margin-top: 0.125rem;
    padding: 0 0.25rem;
  }

  .chat-typing {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    width: fit-content;
    padding: 0.3rem 0.45rem;
    border-radius: 999px;
    border: 1px solid hsl(var(--border) / 0.55);
    background: hsl(var(--muted) / 0.7);
    margin-top: 0.2rem;
  }

  .chat-typing span {
    width: 0.25rem;
    height: 0.25rem;
    border-radius: 50%;
    background: hsl(var(--muted-foreground) / 0.7);
    animation: typing-bounce 0.9s ease-in-out infinite;
  }

  .chat-typing span:nth-child(2) {
    animation-delay: 0.15s;
  }

  .chat-typing span:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes msg-appear {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes typing-bounce {
    0%,
    80%,
    100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    40% {
      transform: translateY(-0.15rem);
      opacity: 1;
    }
  }
</style>
