<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import {
    Bot,
    CornerDownLeft,
    Cpu,
    MessageSquare,
    Send,
    Settings2,
    Sparkles,
    User,
  } from "@lucide/svelte";
  import { marked } from "marked";
  import { Button } from "$lib/components/ui/button";

  // Markdown → HTML for message content (GFM, line breaks)
  marked.setOptions({ gfm: true, breaks: true });
  function renderMarkdown(text: string): string {
    if (!text) return "";
    return marked.parse(text) as string;
  }

  interface ViberSkill {
    id: string;
    name: string;
    description: string;
  }

  interface Viber {
    id: string;
    name: string;
    platform: string | null;
    version: string | null;
    capabilities: string[] | null;
    skills?: ViberSkill[] | null;
    isConnected: boolean;
    runningTasks: string[];
    status?: {
      uptime: number;
      runningTasks: number;
    };
  }

  interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: Date;
  }

  interface TaskProgressEnvelope {
    event?: Record<string, unknown>;
  }

  interface TaskEventEntry {
    event?: TaskProgressEnvelope;
  }

  function toToolLabel(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) return "tool";
    return value.trim();
  }

  function stringifyToolDetails(value: unknown): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function buildProgressText(task: {
    partialText?: string;
    events?: TaskEventEntry[];
  }): string {
    const progressLines: string[] = [];

    for (const entry of task.events ?? []) {
      const payload = entry?.event?.event;
      if (!payload || typeof payload !== "object") continue;
      const data = payload as Record<string, unknown>;

      const kind = data.kind;
      if (kind === "tool-call") {
        const toolName = toToolLabel(data.toolName);
        progressLines.push(`🛠️ Calling ${toolName}...`);
        continue;
      }

      if (kind === "tool-result") {
        const toolName = toToolLabel(data.toolName);
        progressLines.push(`✅ ${toolName} finished`);

        const result = stringifyToolDetails(data.result);
        if (result) {
          const preview = result.length > 400 ? `${result.slice(0, 400)}…` : result;
          progressLines.push(`Result: ${preview}`);
        }
      }
    }

    const text = typeof task.partialText === "string" ? task.partialText.trim() : "";
    if (text) {
      progressLines.push(text);
    }

    return progressLines.length > 0 ? progressLines.join("\n") : "Processing task...";
  }

  let viber = $state<Viber | null>(null);
  let messages = $state<Message[]>([]);
  let loading = $state(true);
  let inputValue = $state("");
  let sending = $state(false);
  let currentTaskId = $state<string | null>(null);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);
  let configLoading = $state(true);
  let configSaving = $state(false);
  let configError = $state<string | null>(null);
  let configFile = $state<string | null>(null);
  let configuredTools = $state<string[]>([]);
  let configuredSkills = $state<string[]>([]);
  let toolOptions = $state<string[]>([]);
  let skillsInput = $state("");

  $effect(() => {
    // Track messages length to trigger on new messages
    const _len = messages.length;
    if (messagesContainer) {
      // Use tick to ensure DOM is updated before scrolling
      tick().then(() => {
        messagesContainer?.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  });

  async function fetchMessages(viberId: string) {
    try {
      const res = await fetch(`/api/vibers/${viberId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      messages = (data.messages || []).map(
        (m: {
          id: string;
          role: string;
          content: string;
          createdAt: string | number;
        }) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          createdAt:
            typeof m.createdAt === "number"
              ? new Date(m.createdAt)
              : new Date(m.createdAt),
        }),
      );
    } catch (_) {
      /* ignore */
    }
  }

  async function fetchViber() {
    const id = $page.params.id;
    try {
      const response = await fetch(`/api/vibers/${id}`);
      if (response.ok) {
        viber = await response.json();
        if (id) await fetchMessages(id);
      } else {
        goto("/vibers");
      }
    } catch (error) {
      console.error("Failed to fetch viber:", error);
      goto("/vibers");
    } finally {
      loading = false;
    }
  }

  async function fetchAgentConfig(viberId: string) {
    configLoading = true;
    configError = null;
    try {
      const response = await fetch(`/api/vibers/${viberId}/config`);
      const payload = await response.json();
      if (!response.ok) {
        configError = payload.error || "Failed to load agent config.";
        return;
      }
      configFile = payload.configFile ?? null;
      configuredTools = payload.tools ?? [];
      configuredSkills = payload.skills ?? [];
      toolOptions = payload.toolOptions ?? [];
      skillsInput = configuredSkills.join(", ");
    } catch (error) {
      console.error("Failed to fetch agent config:", error);
      configError = "Failed to load agent config.";
    } finally {
      configLoading = false;
    }
  }

  function toggleConfiguredTool(toolId: string) {
    if (configuredTools.includes(toolId)) {
      configuredTools = configuredTools.filter((tool) => tool !== toolId);
      return;
    }
    configuredTools = [...configuredTools, toolId];
  }

  async function saveAgentConfig() {
    if (!viber) return;
    configSaving = true;
    configError = null;
    try {
      const skills = skillsInput
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);

      const response = await fetch(`/api/vibers/${viber.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tools: configuredTools,
          skills,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to save agent config.");
      }

      configuredSkills = payload.skills ?? skills;
      skillsInput = configuredSkills.join(", ");
    } catch (error) {
      configError = error instanceof Error ? error.message : "Failed to save agent config.";
    } finally {
      configSaving = false;
    }
  }

  async function sendMessage(overrideContent?: string) {
    const content = (overrideContent ?? inputValue).trim();
    if (!content || sending || !viber?.isConnected) return;

    inputValue = "";
    sending = true;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date(),
    };
    messages = [...messages, userMessage];

    // Persist user message at OpenViber level
    try {
      await fetch(`/api/vibers/${viber.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
    } catch (_) {
      /* ignore */
    }

    let pollingStarted = false;

    try {
      // Send full chat history so viber has context (orchestration only; no viber-side persistence)
      const response = await fetch(`/api/vibers/${viber.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: content,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit task");
      }

      const { taskId } = await response.json();
      currentTaskId = taskId;

      const assistantMessageId = `msg-${Date.now()}-assistant`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "Processing task...",
        createdAt: new Date(),
      };
      messages = [...messages, assistantMessage];

      const pollInterval = 1200;
      const maxAttempts = 120;
      let attempts = 0;

      const poll = async (): Promise<boolean> => {
        try {
          const taskRes = await fetch(`/api/tasks/${taskId}`);
          if (!taskRes.ok) return false;
          const task = await taskRes.json();
          if (task.status === "running" || task.status === "pending") {
            const streamingText = buildProgressText(task as {
              partialText?: string;
              events?: TaskEventEntry[];
            });

            messages = messages.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: streamingText }
                : m,
            );
          }
          if (task.status === "completed") {
            const text =
              (task.result?.text as string)?.trim() ||
              task.result?.summary ||
              "(No response text)";
            messages = messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: text } : m,
            );
            // Persist assistant message at OpenViber level
            try {
              await fetch(`/api/vibers/${viber!.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  role: "assistant",
                  content: text,
                  taskId,
                }),
              });
            } catch (_) {
              /* ignore */
            }
            return true;
          }
          if (task.status === "error") {
            const errText = `Error: ${task.error || "Task failed"}`;
            messages = messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: errText } : m,
            );
            try {
              await fetch(`/api/vibers/${viber!.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  role: "assistant",
                  content: errText,
                  taskId,
                }),
              });
            } catch (_) {
              /* ignore */
            }
            return true;
          }
        } catch (_) {
          /* ignore */
        }
        return false;
      };

      pollingStarted = true;
      const intervalId = setInterval(async () => {
        attempts++;
        const done = await poll();
        if (done || attempts >= maxAttempts) {
          clearInterval(intervalId);
          if (attempts >= maxAttempts) {
            const last = await poll();
            if (!last) {
              messages = messages.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: "Task timed out. No response received." }
                  : m,
              );
            }
          }
          sending = false;
        }
      }, pollInterval);

      const done = await poll();
      if (done) {
        clearInterval(intervalId);
        sending = false;
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to submit task"}`,
        createdAt: new Date(),
      };
      messages = [...messages, errorMessage];
    } finally {
      if (!pollingStarted) {
        sending = false;
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function insertSkillTemplate(skill: ViberSkill) {
    inputValue = `Use ${skill.name} to `;
    inputEl?.focus();
  }

  onMount(() => {
    fetchViber();
    if ($page.params.id) {
      fetchAgentConfig($page.params.id);
    }
    const interval = setInterval(fetchViber, 5000);
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>{viber?.name || "Viber"} - OpenViber</title>
</svelte:head>

<div class="chat-shell flex-1 flex flex-col min-h-0 overflow-hidden">
  <!-- Messages -->
  <div
    bind:this={messagesContainer}
    class="chat-scroll flex-1 min-h-0 overflow-y-auto"
  >
    {#if loading}
      <div
        class="h-full flex items-center justify-center text-center text-muted-foreground"
      >
        Loading...
      </div>
    {:else if !viber?.isConnected}
      <div
        class="h-full flex items-center justify-center text-center text-muted-foreground p-4"
      >
        <div>
          <Cpu class="size-12 mx-auto mb-4 opacity-50" />
          <p class="text-lg font-medium">Viber is Offline</p>
          <p class="text-sm mt-2 max-w-sm">
            This viber is not currently connected. Start the viber daemon to
            chat.
          </p>
        </div>
      </div>
    {:else if messages.length === 0}
      <div class="h-full flex flex-col items-center justify-center py-12 px-4">
        <div class="text-center mb-8">
          <div
            class="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary mb-4"
          >
            <Sparkles class="size-6" />
          </div>
          <h2 class="text-xl font-semibold text-foreground mb-2">
            What can I help you with?
          </h2>
          <p class="text-sm text-muted-foreground max-w-md">
            Start a conversation with your viber. Try one of the suggestions
            below or type your own message.
          </p>
        </div>

        <div class="grid gap-2 w-full max-w-lg">
          <button
            type="button"
            class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors group"
            onclick={() =>
              sendMessage("What can you do? List your capabilities.")}
          >
            <MessageSquare
              class="size-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5"
            />
            <div>
              <p class="text-sm font-medium text-foreground">
                What can you do?
              </p>
              <p class="text-xs text-muted-foreground">
                List your capabilities and available skills
              </p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors group"
            onclick={() =>
              sendMessage("Help me understand the current project structure.")}
          >
            <MessageSquare
              class="size-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5"
            />
            <div>
              <p class="text-sm font-medium text-foreground">
                Explore the project
              </p>
              <p class="text-xs text-muted-foreground">
                Understand the current project structure
              </p>
            </div>
          </button>

          <button
            type="button"
            class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors group"
            onclick={() =>
              sendMessage("Run the dev server and show me the output.")}
          >
            <MessageSquare
              class="size-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5"
            />
            <div>
              <p class="text-sm font-medium text-foreground">Run dev server</p>
              <p class="text-xs text-muted-foreground">
                Start the development server and monitor output
              </p>
            </div>
          </button>

          {#if viber.skills && viber.skills.length > 0}
            <div class="mt-2 pt-2 border-t border-border/50">
              <p class="text-xs text-muted-foreground mb-2 px-1">
                Available skills:
              </p>
              <div class="flex flex-wrap gap-1.5">
                {#each viber.skills as skill}
                  <button
                    type="button"
                    class="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    onclick={() => insertSkillTemplate(skill)}
                    title={skill.description}
                  >
                    {skill.name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="px-3 py-6 sm:px-5">
        <div class="mx-auto w-full max-w-4xl space-y-5">
          {#each messages as message (message.id)}
            <div
              class="message-row flex {message.role === 'user'
                ? 'justify-end user-row'
                : 'justify-start assistant-row'}"
            >
              {#if message.role !== "user"}
                <div class="message-avatar assistant-avatar" aria-hidden="true">
                  <Bot class="size-4" />
                </div>
              {/if}

              <div
                class="message-bubble max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 {message.role ===
                'user'
                  ? 'user-bubble bg-primary text-primary-foreground'
                  : 'assistant-bubble bg-card text-foreground'}"
              >
                <div class="message-markdown">
                  {@html renderMarkdown(message.content)}
                </div>
                <p class="text-[11px] mt-2 opacity-60 tracking-wide">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>

              {#if message.role === "user"}
                <div class="message-avatar user-avatar" aria-hidden="true">
                  <User class="size-4" />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="chat-composer-wrap border-t border-border/70 p-3 shrink-0 sm:p-4">
    <div class="mx-auto w-full max-w-4xl space-y-3">
      <div class="rounded-xl border border-border bg-card/80 p-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <p class="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Settings2 class="size-3.5" />
            Agent config
          </p>
          {#if configFile}
            <p class="text-[11px] text-muted-foreground">{configFile}</p>
          {/if}
        </div>

        {#if configLoading}
          <p class="text-xs text-muted-foreground">Loading tools and skills…</p>
        {:else if configError}
          <p class="text-xs text-amber-600 dark:text-amber-400">{configError}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            If this is a first-time setup, run <code>openviber onboard</code> to create
            <code>~/.openviber/agents/default.yaml</code>.
          </p>
        {:else}
          <div class="space-y-2.5">
            <div>
              <p class="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Tools
              </p>
              <div class="flex flex-wrap gap-1.5">
                {#each toolOptions as tool}
                  <button
                    type="button"
                    class="rounded-full border px-2.5 py-1 text-[11px] transition-colors {configuredTools.includes(
                      tool,
                    )
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'}"
                    onclick={() => toggleConfiguredTool(tool)}
                  >
                    {tool}
                  </button>
                {/each}
              </div>
            </div>

            <label class="block text-[11px] uppercase tracking-wide text-muted-foreground" for="skill-input">
              Skills (comma-separated)
            </label>
            <input
              id="skill-input"
              type="text"
              bind:value={skillsInput}
              placeholder="tmux, cursor-agent"
              class="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground"
            />

            <div class="flex justify-end">
              <Button
                size="sm"
                onclick={saveAgentConfig}
                disabled={configSaving}
              >
                {configSaving ? "Saving..." : "Save config"}
              </Button>
            </div>
          </div>
        {/if}
      </div>

      {#if viber?.skills && viber.skills.length > 0 && messages.length > 0}
        <div class="overflow-x-auto pb-0.5">
          <div class="flex items-center gap-1.5 min-w-max">
            {#each viber.skills as skill}
              <button
                type="button"
                class="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                onclick={() => insertSkillTemplate(skill)}
                title={skill.description}
              >
                Use {skill.name}...
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div
        class="composer-card flex gap-2.5 items-end rounded-2xl border border-border bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur"
      >
        <textarea
          bind:this={inputEl}
          bind:value={inputValue}
          onkeydown={handleKeydown}
          placeholder={viber?.isConnected
            ? "Send a task or command..."
            : "Viber is offline"}
          class="composer-input flex-1 min-h-[40px] max-h-36 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          rows="1"
          disabled={sending || !viber?.isConnected}
        ></textarea>
        <Button
          onclick={() => sendMessage()}
          disabled={sending || !inputValue.trim() || !viber?.isConnected}
          class="size-10 shrink-0 rounded-xl"
        >
          <Send class="size-4" />
        </Button>
      </div>
      <p
        class="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"
      >
        <CornerDownLeft class="size-3" />
        Press Enter to send, Shift + Enter for a new line.
      </p>
    </div>
  </div>
</div>

<style>
  .chat-shell {
    background: radial-gradient(
      circle at top,
      hsl(var(--muted) / 0.35),
      transparent 40%
    );
  }

  .chat-scroll {
    scrollbar-width: thin;
  }

  .chat-composer-wrap {
    background: linear-gradient(
      to top,
      hsl(var(--background)) 58%,
      hsl(var(--background) / 0.78)
    );
  }

  .message-row {
    align-items: flex-end;
    gap: 0.625rem;
  }

  .message-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 9999px;
    border: 1px solid hsl(var(--border));
    color: hsl(var(--muted-foreground));
    background: hsl(var(--background));
    flex-shrink: 0;
  }

  .assistant-avatar {
    box-shadow: 0 4px 20px hsl(var(--foreground) / 0.04);
  }

  .user-avatar {
    color: hsl(var(--primary));
    border-color: hsl(var(--primary) / 0.25);
    background: hsl(var(--primary) / 0.08);
  }

  .message-bubble {
    border: 1px solid hsl(var(--border) / 0.8);
    box-shadow: 0 10px 35px hsl(var(--foreground) / 0.04);
  }

  .assistant-bubble {
    border-top-left-radius: 0.55rem;
  }

  .user-bubble {
    border-top-right-radius: 0.55rem;
    box-shadow: 0 10px 30px hsl(var(--primary) / 0.22);
    border-color: hsl(var(--primary) / 0.45);
  }

  .composer-card:focus-within {
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
  }

  :global(.message-markdown) {
    line-height: 1.6;
  }
  :global(.message-markdown p) {
    margin-bottom: 0.5rem;
  }
  :global(.message-markdown p:last-child) {
    margin-bottom: 0;
  }
  :global(.message-markdown code) {
    background: hsl(var(--muted));
    padding: 0.15em 0.35em;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
  :global(.message-markdown pre) {
    background: hsl(var(--muted));
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }
  :global(.message-markdown pre code) {
    background: none;
    padding: 0;
  }
  :global(.message-markdown ul) {
    list-style-type: disc;
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }
  :global(.message-markdown ol) {
    list-style-type: decimal;
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }
  :global(.message-markdown li) {
    margin-bottom: 0.25rem;
  }
  :global(.message-markdown a) {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  :global(.message-markdown blockquote) {
    border-left: 4px solid hsl(var(--border));
    padding-left: 0.75rem;
    margin: 0.5rem 0;
    font-style: italic;
    color: hsl(var(--muted-foreground));
  }
  :global(.message-markdown h1),
  :global(.message-markdown h2),
  :global(.message-markdown h3) {
    font-weight: 600;
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
  }
</style>
