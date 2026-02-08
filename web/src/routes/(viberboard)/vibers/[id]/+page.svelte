<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { Chat } from "@ai-sdk/svelte";
  import { DefaultChatTransport } from "ai";
  import { ToolCall } from "$lib/components/ai-elements";
  import { Reasoning } from "$lib/components/ai-elements";
  import {
    SessionIndicator,
    type ActivityStep,
  } from "$lib/components/ai-elements";
  import {
    AlertCircle,
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CornerDownLeft,
    Cpu,
    LoaderCircle,
    MessageSquare,
    Send,
    Settings2,
    Sparkles,
    TerminalSquare,
    User,
    X,
  } from "@lucide/svelte";
  import { marked } from "marked";
  import { Button } from "$lib/components/ui/button";
  import * as Resizable from "$lib/components/ui/resizable";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";

  // Markdown → HTML for message content (GFM, line breaks)
  marked.setOptions({ gfm: true, breaks: true });
  function renderMarkdown(text: string): string {
    if (!text) return "";
    return marked.parse(text) as string;
  }

  /**
   * AI SDK v6 tool parts use `type: "tool-${NAME}"` (e.g., "tool-list_files").
   * Dynamic tools use `type: "dynamic-tool"` with a `toolName` field.
   * This helper extracts the tool name from either format.
   */
  function getPartToolName(part: any): string | null {
    // Dynamic tool parts have an explicit toolName
    if (part.toolName) return part.toolName;
    // Static tool parts use type "tool-${NAME}" format
    if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      return part.type.slice(5); // Strip "tool-" prefix
    }
    return null;
  }

  /** Check if a message part represents a tool invocation */
  function isToolPart(part: any): boolean {
    return getPartToolName(part) !== null;
  }

  const toolStateLabels: Record<string, string> = {
    "approval-requested": "Awaiting approval",
    "approval-responded": "Approved",
    "input-available": "Running",
    "input-streaming": "Running",
    "output-available": "Completed",
    "output-denied": "Denied",
    "output-error": "Error",
  };

  function getToolStateLabel(state: string): string {
    return toolStateLabels[state] || state || "Unknown";
  }

  function isToolStateRunning(state: string): boolean {
    return (
      state === "approval-requested" ||
      state === "input-available" ||
      state === "input-streaming"
    );
  }

  function isToolStateError(state: string): boolean {
    return state === "output-error" || state === "output-denied";
  }

  function getToolInputSummary(part: any): string | undefined {
    const input = part?.input;
    if (!input || typeof input !== "object") return undefined;
    return (
      input.command ||
      input.path ||
      input.query ||
      input.url ||
      input.goal ||
      input.prompt ||
      undefined
    );
  }

  function formatToolOutputValue(label: string, value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "string") {
      return value.trim().length > 0 ? `${label}\n${value}` : null;
    }
    try {
      return `${label}\n${JSON.stringify(value, null, 2)}`;
    } catch {
      return `${label}\n${String(value)}`;
    }
  }

  function extractToolOutputText(part: any): string {
    const sections: string[] = [];
    const inputSummary = getToolInputSummary(part);
    if (inputSummary) {
      sections.push(`Input\n${inputSummary}`);
    }

    if (part?.errorText) {
      sections.push(`Error\n${String(part.errorText)}`);
    }

    const output = part?.output;
    if (typeof output === "string") {
      if (output.trim().length > 0) {
        sections.push(`Output\n${output}`);
      }
    } else if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      const preferred = [
        "summary",
        "stdoutTail",
        "stderrTail",
        "output",
        "stderr",
        "text",
        "result",
      ];

      for (const key of preferred) {
        const section = formatToolOutputValue(key, obj[key]);
        if (section) {
          sections.push(section);
        }
      }

      if (sections.length === 0) {
        const section = formatToolOutputValue("Output", output);
        if (section) {
          sections.push(section);
        }
      }
    } else if (output !== undefined) {
      const section = formatToolOutputValue("Output", output);
      if (section) {
        sections.push(section);
      }
    }

    return sections.join("\n\n").trim();
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
    environmentId?: string | null;
  }

  interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    parts?: any[] | null;
    createdAt: Date;
  }

  interface ToolOutputEntry {
    id: string;
    messageId: string;
    toolName: string;
    state: string;
    output: string;
    summary?: string;
    createdAt?: Date;
  }

  let viber = $state<Viber | null>(null);
  let dbMessages = $state<Message[]>([]);
  let loading = $state(true);
  let inputValue = $state("");
  let sending = $state(false);
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
  let showConfigDialog = $state(false);

  // Session activity tracking for long-running AI tasks
  let sessionStartedAt = $state<number | null>(null);
  let bootstrapTaskHandledViberId = $state<string | null>(null);

  // AI SDK Chat instance — created reactively when viberId is known
  let chat = $state<any>(null);
  let chatInitialized = $state(false);

  // Whether auto-scroll is active (disabled when user scrolls up manually)
  let userScrolledUp = $state(false);
  let lastScrollHeight = $state(0);
  let toolOutputContainer = $state<HTMLDivElement | null>(null);
  let toolOutputUserScrolledUp = $state(false);
  let selectedToolOutputId = $state<string | null>(null);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    if (!messagesContainer || userScrolledUp) return;
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior,
    });
  }

  // Detect when user manually scrolls away from bottom
  function handleScroll() {
    if (!messagesContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
    // Consider "at bottom" if within 80px of the bottom edge
    const atBottom = scrollHeight - scrollTop - clientHeight < 80;
    userScrolledUp = !atBottom;
  }

  function scrollToolOutputToBottom(behavior: ScrollBehavior = "smooth") {
    if (!toolOutputContainer || toolOutputUserScrolledUp) return;
    toolOutputContainer.scrollTo({
      top: toolOutputContainer.scrollHeight,
      behavior,
    });
  }

  function handleToolOutputScroll() {
    if (!toolOutputContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = toolOutputContainer;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    toolOutputUserScrolledUp = !atBottom;
  }

  // no longer needed - accordion toggle is handled inline

  // Scroll on new messages (count change) — always re-engage
  $effect(() => {
    const _chatLen = chat?.messages?.length ?? 0;
    const _dbLen = dbMessages.length;
    // New message added → re-engage auto-scroll
    userScrolledUp = false;
    if (messagesContainer) {
      tick().then(() => scrollToBottom("smooth"));
    }
  });

  // Scroll during streaming — react to content growth within existing messages
  $effect(() => {
    if (!sending || !messagesContainer) return;
    // Track the text length of the last assistant message to detect streaming growth
    const msgs = chat?.messages;
    if (!msgs || msgs.length === 0) return;
    const lastMsg = msgs[msgs.length - 1];
    const _contentLen =
      lastMsg?.parts
        ?.map(
          (p: any) =>
            (p.text?.length ?? 0) +
            (p.reasoning?.length ?? 0) +
            (isToolPart(p) ? extractToolOutputText(p).length : 0),
        )
        .reduce((a: number, b: number) => a + b, 0) ?? 0;
    // This effect re-runs whenever _contentLen changes during streaming
    tick().then(() => scrollToBottom("instant"));
  });

  // MutationObserver: catch DOM expansions not covered by reactive state
  // (e.g., markdown rendering, images loading, tool card expansion)
  $effect(() => {
    if (!messagesContainer) return;
    const observer = new MutationObserver(() => {
      if (!messagesContainer) return;
      const newHeight = messagesContainer.scrollHeight;
      if (newHeight !== lastScrollHeight) {
        lastScrollHeight = newHeight;
        scrollToBottom("instant");
      }
    });
    observer.observe(messagesContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  });

  async function fetchMessages(viberId: string) {
    try {
      const res = await fetch(`/api/vibers/${viberId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      dbMessages = (data.messages || []).map(
        (m: {
          id: string;
          role: string;
          content: string;
          parts?: unknown[];
          createdAt: string | number;
        }) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
          parts: Array.isArray(m.parts) ? (m.parts as any[]) : null,
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
        // Only reload messages when NOT actively sending (prevents duplicates)
        if (id && !sending) await fetchMessages(id);
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
      configError =
        error instanceof Error ? error.message : "Failed to save agent config.";
    } finally {
      configSaving = false;
    }
  }

  async function sendMessage(overrideContent?: string) {
    const content = (overrideContent ?? inputValue).trim();
    if (!content || sending || !viber?.isConnected) return;

    inputValue = "";
    sending = true;
    sessionStartedAt = Date.now();

    // Persist user message to DB
    try {
      await fetch(`/api/vibers/${viber.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
    } catch (_) {
      /* ignore */
    }

    // Initialize Chat if needed
    if (!chat || !chatInitialized) {
      chat = new Chat({
        transport: new DefaultChatTransport({
          api: `/api/vibers/${viber.id}/chat`,
        }),
        // Seed with existing DB messages as initial messages
        messages: dbMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "system",
          parts:
            Array.isArray(m.parts) && m.parts.length > 0
              ? m.parts
              : [{ type: "text" as const, text: m.content }],
        })) as any[],
        onFinish: async ({ message, isAbort, isDisconnect, isError }: any) => {
          // Don't save if the response was aborted, disconnected, or errored
          if (isAbort || isDisconnect || isError) {
            sending = false;
            sessionStartedAt = null;
            return;
          }
          // Persist assistant's response to DB once streaming completes
          const textParts =
            message?.parts
              ?.filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join("\n") || "";
          const messageParts = Array.isArray(message?.parts)
            ? message.parts
            : [];
          if (textParts || messageParts.length > 0) {
            try {
              await fetch(`/api/vibers/${viber!.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  role: "assistant",
                  content: textParts,
                  parts: messageParts,
                }),
              });
            } catch (_) {
              /* ignore */
            }
          }
          sending = false;
          sessionStartedAt = null;
        },
        onError: (error: Error) => {
          console.error("Chat error:", error);
          sending = false;
          sessionStartedAt = null;
        },
      } as any);
      chatInitialized = true;
    }

    // Send via AI SDK Chat class (handles streaming automatically)
    try {
      if (chat) {
        await chat.sendMessage({ text: content });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      sending = false;
      sessionStartedAt = null;
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

  // Derived: build activity steps from tool calls in the message stream
  let activitySteps = $derived.by((): ActivityStep[] => {
    if (!sending || !chat?.messages) return [];
    const steps: ActivityStep[] = [];
    for (const msg of chat.messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts || []) {
        const p = part as any;
        const toolName = getPartToolName(p);
        if (toolName) {
          const isComplete =
            p.state === "output-available" || p.state === "result";
          const isError =
            p.state === "output-error" || p.state === "output-denied";
          steps.push({
            name: toolName,
            status: isError ? "error" : isComplete ? "complete" : "running",
            summary:
              p.input?.path || p.input?.query || p.input?.url || undefined,
          });
        }
      }
    }
    return steps;
  });

  // Computed: messages to display. Uses Chat messages if available, else DB messages.
  let displayMessages = $derived.by(() => {
    if (chatInitialized && chat?.messages && chat.messages.length > 0) {
      return chat.messages;
    }
    // Convert DB messages to a compatible shape
    return dbMessages.map((m) => ({
      id: m.id,
      role: m.role,
      parts:
        Array.isArray(m.parts) && m.parts.length > 0
          ? m.parts
          : [{ type: "text" as const, text: m.content }],
      createdAt: m.createdAt,
    }));
  });

  let toolOutputEntries = $derived.by((): ToolOutputEntry[] => {
    const entries: ToolOutputEntry[] = [];
    for (const message of displayMessages as any[]) {
      if (message.role !== "assistant") continue;
      const parts = Array.isArray(message.parts) ? message.parts : [];
      parts.forEach((part: any, index: number) => {
        const toolName = getPartToolName(part);
        if (!toolName) return;
        entries.push({
          id: `${message.id}:${index}:${toolName}`,
          messageId: message.id,
          toolName,
          state: part.state || "input-available",
          output: extractToolOutputText(part),
          summary: getToolInputSummary(part),
          createdAt:
            (message.createdAt && new Date(message.createdAt)) || undefined,
        });
      });
    }
    return entries;
  });

  // Auto-open the latest running tool during streaming
  $effect(() => {
    if (!sending) return;
    if (toolOutputEntries.length === 0) return;
    const running = [...toolOutputEntries]
      .reverse()
      .find((entry) => isToolStateRunning(entry.state));
    if (running) {
      selectedToolOutputId = running.id;
    }
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    if (loading || sending || !viber?.isConnected) return;
    if (bootstrapTaskHandledViberId === viber.id) return;

    const storageKey = `openviber:new-viber-task:${viber.id}`;
    const pendingTask = window.sessionStorage.getItem(storageKey);
    if (!pendingTask) return;

    window.sessionStorage.removeItem(storageKey);
    bootstrapTaskHandledViberId = viber.id;
    void sendMessage(pendingTask);
  });

  onMount(() => {
    fetchViber();
    if ($page.params.id) {
      fetchAgentConfig($page.params.id);
    }
    const interval = setInterval(fetchViber, 5000);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    const viberId = $page.params.id;
    if (!viberId) return;
    window.localStorage.setItem("openviber:last-active-viber", viberId);
  });

  $effect(() => {
    const viberId = $page.params.id;
    chat = null;
    chatInitialized = false;
    if (viberId) {
      void fetchMessages(viberId);
    }
  });
</script>

<svelte:head>
  <title>{viber?.name || "Viber"} - OpenViber</title>
</svelte:head>

<div class="chat-shell flex-1 flex flex-col min-h-0 overflow-hidden">
  <Resizable.PaneGroup direction="horizontal" class="flex-1 min-h-0">
    <Resizable.Pane defaultSize={65} minSize={35} class="min-h-0 flex flex-col">
      <!-- Messages -->
      <div
        bind:this={messagesContainer}
        class="chat-scroll flex-1 min-h-0 overflow-y-auto"
        onscroll={handleScroll}
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
        {:else if displayMessages.length === 0}
          <div
            class="h-full flex flex-col items-center justify-center py-12 px-4"
          >
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
                  sendMessage(
                    "Help me understand the current project structure.",
                  )}
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
                  <p class="text-sm font-medium text-foreground">
                    Run dev server
                  </p>
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
              {#each displayMessages as message (message.id)}
                <div
                  class="message-row flex {message.role === 'user'
                    ? 'justify-end user-row'
                    : 'justify-start assistant-row'}"
                >
                  {#if message.role !== "user"}
                    <div
                      class="message-avatar assistant-avatar"
                      aria-hidden="true"
                    >
                      <Bot class="size-4" />
                    </div>
                  {/if}

                  <div
                    class="message-bubble max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 {message.role ===
                    'user'
                      ? 'user-bubble bg-primary text-primary-foreground'
                      : 'assistant-bubble bg-card text-foreground'}"
                  >
                    {#each message.parts as part, i}
                      {#if part.type === "text" && (part as any).text}
                        <div class="message-markdown">
                          {@html renderMarkdown((part as any).text)}
                        </div>
                      {:else if part.type === "reasoning"}
                        <Reasoning
                          content={(part as any).reasoning ||
                            (part as any).text ||
                            ""}
                          isStreaming={false}
                        />
                      {:else if isToolPart(part)}
                        {@const toolName = getPartToolName(part)}
                        {@const toolPart = part as any}
                        {#if toolName}
                          <ToolCall
                            {toolName}
                            toolState={toolPart.state || "input-available"}
                            input={toolPart.input}
                            output={toolPart.output}
                            errorText={toolPart.errorText}
                          />
                        {/if}
                      {/if}
                    {/each}
                    <p class="text-[11px] mt-2 opacity-60 tracking-wide">
                      {new Date(
                        (message as any).createdAt || Date.now(),
                      ).toLocaleTimeString()}
                    </p>
                  </div>

                  {#if message.role === "user"}
                    <div class="message-avatar user-avatar" aria-hidden="true">
                      <User class="size-4" />
                    </div>
                  {/if}
                </div>
              {/each}

              {#if sending && (!chat?.messages || chat.messages.length === 0 || chat.messages[chat.messages.length - 1]?.role === "user")}
                <div class="message-row flex justify-start assistant-row">
                  <div
                    class="message-avatar assistant-avatar"
                    aria-hidden="true"
                  >
                    <Bot class="size-4" />
                  </div>
                  <div
                    class="message-bubble max-w-[90%] sm:max-w-[82%] rounded-2xl px-4 py-3 assistant-bubble bg-card text-foreground"
                  >
                    {#if sessionStartedAt}
                      <SessionIndicator
                        startedAt={sessionStartedAt}
                        steps={activitySteps}
                      />
                    {:else}
                      <div
                        class="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <Sparkles class="size-4 animate-pulse" />
                        <span>Starting...</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="chat-composer-wrap p-3 shrink-0 sm:p-4">
        <div class="mx-auto w-full max-w-4xl space-y-3">
          <!-- Persistent session activity bar for long-running tasks -->
          {#if sending && sessionStartedAt}
            <SessionIndicator
              startedAt={sessionStartedAt}
              steps={activitySteps}
            />
          {/if}

          {#if viber?.skills && viber.skills.length > 0 && displayMessages.length > 0}
            <div class="overflow-x-auto pb-0.5">
              <div class="flex items-center gap-1.5 flex-wrap">
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
            <button
              type="button"
              class="size-10 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors {configError
                ? 'text-amber-500'
                : ''}"
              onclick={() => (showConfigDialog = true)}
              title="Agent config"
            >
              <Settings2 class="size-4" />
            </button>
            <textarea
              bind:this={inputEl}
              bind:value={inputValue}
              onkeydown={handleKeydown}
              placeholder={configError
                ? "Agent config missing — run openviber onboard first"
                : viber?.isConnected
                  ? "Send a task or command..."
                  : "Viber is offline"}
              class="composer-input flex-1 min-h-[40px] max-h-36 resize-none rounded-xl border border-transparent bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              rows="1"
              disabled={sending || !viber?.isConnected || !!configError}
            ></textarea>
            <Button
              onclick={() => sendMessage()}
              disabled={sending ||
                !inputValue.trim() ||
                !viber?.isConnected ||
                !!configError}
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
    </Resizable.Pane>

    <Resizable.Handle withHandle class="hidden lg:flex" />

    <Resizable.Pane
      defaultSize={35}
      minSize={20}
      maxSize={55}
      class="hidden min-h-0 lg:block"
    >
      <aside class="tool-pane flex h-full min-h-0 flex-col bg-background/70">
        <div class="border-b border-border/60 px-3 py-2.5 shrink-0">
          <div class="flex items-center gap-2">
            <TerminalSquare class="size-4 text-muted-foreground" />
            <p class="text-sm font-medium text-foreground">Tool Output</p>
            {#if sending}
              <span
                class="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500"
              >
                Live
              </span>
            {/if}
          </div>
        </div>

        {#if toolOutputEntries.length === 0}
          <div class="flex flex-1 items-center justify-center px-4 text-center">
            <p class="text-xs text-muted-foreground">
              No tool output yet. Run a tool call to see live logs here.
            </p>
          </div>
        {:else}
          <div
            bind:this={toolOutputContainer}
            class="flex-1 min-h-0 overflow-y-auto p-1.5"
            onscroll={handleToolOutputScroll}
          >
            <div class="space-y-1">
              {#each toolOutputEntries as entry (entry.id)}
                <Collapsible open={selectedToolOutputId === entry.id}>
                  <CollapsibleTrigger
                    class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 {selectedToolOutputId ===
                    entry.id
                      ? 'bg-muted/50'
                      : ''}"
                    onclick={() => {
                      selectedToolOutputId =
                        selectedToolOutputId === entry.id ? null : entry.id;
                    }}
                  >
                    <ChevronRight
                      class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 {selectedToolOutputId ===
                      entry.id
                        ? 'rotate-90'
                        : ''}"
                    />
                    {#if isToolStateRunning(entry.state)}
                      <LoaderCircle
                        class="size-3.5 shrink-0 animate-spin text-amber-500"
                      />
                    {:else if isToolStateError(entry.state)}
                      <AlertCircle class="size-3.5 shrink-0 text-red-500" />
                    {:else}
                      <CheckCircle2
                        class="size-3.5 shrink-0 text-emerald-500"
                      />
                    {/if}
                    <div class="min-w-0 flex-1">
                      <p
                        class="truncate text-[12px] font-medium text-foreground"
                      >
                        {entry.toolName}
                      </p>
                      {#if entry.summary}
                        <p class="truncate text-[10px] text-muted-foreground">
                          {entry.summary}
                        </p>
                      {/if}
                    </div>
                    <span class="shrink-0 text-[10px] text-muted-foreground">
                      {getToolStateLabel(entry.state)}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div
                      class="ml-3 mr-1 mb-1 rounded-md border border-border/50 bg-black/[0.03] dark:bg-white/[0.03]"
                    >
                      {#if entry.output}
                        <pre
                          class="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-foreground/85">{entry.output}</pre>
                      {:else}
                        <p class="p-3 text-[11px] text-muted-foreground">
                          Waiting for output...
                        </p>
                      {/if}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              {/each}
            </div>
          </div>
        {/if}
      </aside>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>

<!-- Agent Config Dialog -->
{#if showConfigDialog}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) showConfigDialog = false;
    }}
    onkeydown={(e) => {
      if (e.key === "Escape") showConfigDialog = false;
    }}
  >
    <div
      class="bg-background rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-border"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 pb-3">
        <div class="flex items-center gap-2">
          <Settings2 class="size-4 text-muted-foreground" />
          <h2 class="text-sm font-semibold">Agent Config</h2>
          {#if configFile}
            <span class="text-[11px] text-muted-foreground">{configFile}</span>
          {/if}
        </div>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onclick={() => (showConfigDialog = false)}
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="px-4 pb-4 space-y-4">
        {#if configLoading}
          <p class="text-xs text-muted-foreground">Loading tools and skills…</p>
        {:else if configError}
          <div
            class="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          >
            <p class="text-sm font-medium text-destructive">
              {configError}
            </p>
            <p class="mt-1.5 text-xs text-muted-foreground">
              Run <code class="px-1 py-0.5 rounded bg-muted text-foreground"
                >openviber onboard</code
              >
              to create
              <code class="px-1 py-0.5 rounded bg-muted text-foreground"
                >~/.openviber/vibers/default.yaml</code
              >. Chat is disabled until config is available.
            </p>
          </div>
        {:else}
          <div class="space-y-3">
            <div>
              <p
                class="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"
              >
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

            <div>
              <label
                class="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5"
                for="dialog-skill-input"
              >
                Skills (comma-separated)
              </label>
              <input
                id="dialog-skill-input"
                type="text"
                bind:value={skillsInput}
                placeholder="tmux, cursor-agent"
                class="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      {#if !configLoading && !configError}
        <div
          class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30"
        >
          <Button
            variant="outline"
            size="sm"
            onclick={() => (showConfigDialog = false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onclick={() => {
              saveAgentConfig();
              showConfigDialog = false;
            }}
            disabled={configSaving}
          >
            {configSaving ? "Saving..." : "Save config"}
          </Button>
        </div>
      {/if}
    </div>
  </div>
{/if}

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
    font-size: 0.875rem;
    line-height: 1.65;
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
