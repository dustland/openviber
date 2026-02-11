<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
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
    CheckCircle2,
    ChevronRight,
    CornerDownLeft,
    Cpu,
    LoaderCircle,
    MessageSquare,
    RefreshCw,
    Sparkles,
    TerminalSquare,
    X,
  } from "@lucide/svelte";
  import { marked } from "marked";
  import ChatComposer from "$lib/components/chat-composer.svelte";
  import * as Resizable from "$lib/components/ui/resizable";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as Dialog from "$lib/components/ui/dialog";
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";

  // Markdown → HTML for message content (GFM, line breaks)
  marked.setOptions({ gfm: true, breaks: true });
  function sanitizeRenderedHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "")
      .replace(/href="javascript:[^"]*"/gi, 'href="#"')
      .replace(/href='javascript:[^']*'/gi, "href='#'");
  }

  function renderMarkdown(text: string): string {
    if (!text) return "";
    const rendered = marked.parse(text) as string;
    return sanitizeRenderedHtml(rendered);
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
    const raw: string | undefined =
      input.command ||
      input.path ||
      input.query ||
      input.url ||
      input.goal ||
      input.prompt ||
      undefined;
    if (!raw) return undefined;
    // Collapse whitespace and cap length for display
    const cleaned = raw.replace(/\s+/g, " ").trim();
    return cleaned.length > 120 ? cleaned.slice(0, 117) + "…" : cleaned;
  }

  type ToolOutputScenario = "terminal" | "structured" | "text";

  interface ToolOutputSection {
    label: string;
    content: string;
    tone?: "default" | "muted" | "error";
  }

  interface ToolOutputDisplay {
    scenario: ToolOutputScenario;
    sections: ToolOutputSection[];
    command?: string;
    exitCode?: string;
  }

  function stringifyToolOutputValue(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "string") {
      return value.trim().length > 0 ? value : null;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function normalizeToolOutputLabel(label: string): string {
    return label
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  function formatToolOutputValue(
    label: string,
    value: unknown,
    tone: ToolOutputSection["tone"] = "default",
  ): ToolOutputSection | null {
    const content = stringifyToolOutputValue(value);
    if (!content) {
      return null;
    }
    return {
      label: normalizeToolOutputLabel(label),
      content,
      tone,
    };
  }

  function isTerminalToolOutput(toolName: string, part: any): boolean {
    const output = part?.output;
    const input = part?.input;

    if (typeof input?.command === "string" && input.command.trim().length > 0) {
      return true;
    }

    if (output && typeof output === "object" && !Array.isArray(output)) {
      const obj = output as Record<string, unknown>;
      const terminalKeys = new Set([
        "command",
        "exitCode",
        "stdout",
        "stderr",
        "stdoutTail",
        "stderrTail",
        "outputTail",
        "timedOut",
        "sessionName",
      ]);
      if (Object.keys(obj).some((key) => terminalKeys.has(key))) {
        return true;
      }
    }

    return /(shell|terminal|tmux|codex|cursor[_-]?agent|gemini|railway)/i.test(
      toolName,
    );
  }

  function buildTerminalToolOutputDisplay(part: any): ToolOutputDisplay {
    const sections: ToolOutputSection[] = [];
    const output = part?.output;
    const input = part?.input;

    let command: string | undefined =
      typeof input?.command === "string" ? input.command : undefined;
    let exitCode: string | undefined;

    if (output && typeof output === "object" && !Array.isArray(output)) {
      const obj = output as Record<string, unknown>;

      if (typeof obj.command === "string" && obj.command.trim().length > 0) {
        command = obj.command;
      }

      if (typeof obj.exitCode === "number" || typeof obj.exitCode === "string") {
        exitCode = String(obj.exitCode);
      }
      if (obj.timedOut === true) {
        exitCode = exitCode ? `${exitCode} (timed out)` : "timed out";
      }

      const summary = formatToolOutputValue("summary", obj.summary, "muted");
      if (summary) sections.push(summary);

      const stdoutSection =
        formatToolOutputValue("stdoutTail", obj.stdoutTail) ||
        formatToolOutputValue("stdout", obj.stdout) ||
        formatToolOutputValue("outputTail", obj.outputTail);
      if (stdoutSection) sections.push(stdoutSection);

      const stderrSection =
        formatToolOutputValue("stderrTail", obj.stderrTail, "error") ||
        formatToolOutputValue("stderr", obj.stderr, "error");
      if (stderrSection) sections.push(stderrSection);

      const outputSection = formatToolOutputValue("output", obj.output);
      if (outputSection && !stdoutSection) {
        sections.push(outputSection);
      }

      const errorSection = formatToolOutputValue("error", obj.error, "error");
      if (errorSection) sections.push(errorSection);

      const hintSection = formatToolOutputValue("hint", obj.hint, "muted");
      if (hintSection) sections.push(hintSection);

      if (sections.length === 0) {
        const fallback = formatToolOutputValue("result", output);
        if (fallback) sections.push(fallback);
      }
    } else if (typeof output === "string") {
      const section = formatToolOutputValue("output", output);
      if (section) sections.push(section);
    } else if (output !== undefined) {
      const section = formatToolOutputValue("output", output);
      if (section) sections.push(section);
    }

    if (part?.errorText) {
      const section = formatToolOutputValue("error", part.errorText, "error");
      if (section) sections.push(section);
    }

    return {
      scenario: "terminal",
      sections,
      command,
      exitCode,
    };
  }

  function buildStructuredToolOutputDisplay(part: any): ToolOutputDisplay {
    const sections: ToolOutputSection[] = [];
    const inputSummary = getToolInputSummary(part);
    if (inputSummary) {
      sections.push({
        label: "Input",
        content: inputSummary,
        tone: "muted",
      });
    }

    if (part?.errorText) {
      const errorSection = formatToolOutputValue("error", part.errorText, "error");
      if (errorSection) {
        sections.push(errorSection);
      }
    }

    const output = part?.output;
    if (typeof output === "string") {
      const outputSection = formatToolOutputValue("output", output);
      if (outputSection) {
        sections.push(outputSection);
      }
      return {
        scenario: "text",
        sections,
      };
    }

    if (output && typeof output === "object" && !Array.isArray(output)) {
      const obj = output as Record<string, unknown>;
      const preferred = [
        "summary",
        "result",
        "text",
        "output",
        "items",
        "data",
        "stderr",
        "error",
      ];

      let outputSections = 0;
      for (const key of preferred) {
        const section = formatToolOutputValue(
          key,
          obj[key],
          key === "stderr" || key === "error" ? "error" : "default",
        );
        if (!section) continue;
        sections.push(section);
        outputSections++;
      }

      if (outputSections === 0) {
        const fallback = formatToolOutputValue("output", output);
        if (fallback) {
          sections.push(fallback);
        }
      }

      return {
        scenario: "structured",
        sections,
      };
    }

    if (output !== undefined) {
      const outputSection = formatToolOutputValue("output", output);
      if (outputSection) {
        sections.push(outputSection);
      }
    }

    return {
      scenario: "text",
      sections,
    };
  }

  function buildToolOutputDisplay(part: any, toolName: string): ToolOutputDisplay {
    if (isTerminalToolOutput(toolName, part)) {
      return buildTerminalToolOutputDisplay(part);
    }
    return buildStructuredToolOutputDisplay(part);
  }

  function flattenToolOutputDisplay(display: ToolOutputDisplay): string {
    return display.sections
      .map((section) => `${section.label}\n${section.content}`)
      .join("\n\n")
      .trim();
  }

  function extractToolOutputText(part: any, toolName?: string): string {
    const resolvedToolName = toolName || getPartToolName(part) || "";
    const display = buildToolOutputDisplay(part, resolvedToolName);
    return flattenToolOutputDisplay(display);
  }

  interface ViberSkill {
    id: string;
    name: string;
    description: string;
    available?: boolean;
    healthSummary?: string;
  }

  interface Viber {
    id: string;
    name: string;
    nodeId?: string | null;
    nodeName?: string | null;
    platform: string | null;
    version: string | null;
    capabilities: string[] | null;
    /** All skills available in the account */
    skills?: ViberSkill[] | null;
    /** Skills currently enabled for this viber (persisted in DB) */
    enabledSkills?: string[] | null;
    /** Connection status of the node hosting this viber; null if no node */
    nodeConnected: boolean | null;
    runningTasks: string[];
    status?: {
      uptime: number;
      runningTasks: number;
    };
    environmentId?: string | null;
  }

  interface ComposerEnvInfo {
    id: string;
    name: string;
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
    scenario: ToolOutputScenario;
    sections: ToolOutputSection[];
    command?: string;
    exitCode?: string;
    summary?: string;
    createdAt?: Date;
  }

  function getToolOutputContainerClass(entry: ToolOutputEntry): string {
    if (entry.scenario === "terminal") {
      return "ml-3 mr-1 mb-1 max-h-56 min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-zinc-800 bg-zinc-950";
    }
    return "ml-3 mr-1 mb-1 max-h-48 min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/50 bg-black/[0.03] dark:bg-white/[0.03]";
  }

  function getToolOutputSectionLabelClass(
    entry: ToolOutputEntry,
    section: ToolOutputSection,
  ): string {
    if (entry.scenario === "terminal") {
      if (section.tone === "error") {
        return "text-[10px] font-semibold uppercase tracking-wide text-rose-300";
      }
      if (section.tone === "muted") {
        return "text-[10px] font-semibold uppercase tracking-wide text-zinc-500";
      }
      return "text-[10px] font-semibold uppercase tracking-wide text-zinc-400";
    }
    if (section.tone === "error") {
      return "text-[10px] font-semibold uppercase tracking-wide text-red-500";
    }
    return "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
  }

  function getToolOutputSectionContentClass(
    entry: ToolOutputEntry,
    section: ToolOutputSection,
  ): string {
    if (entry.scenario === "terminal") {
      if (section.tone === "error") {
        return "whitespace-pre-wrap break-all p-0 font-mono text-[11px] leading-relaxed text-rose-200";
      }
      if (section.tone === "muted") {
        return "whitespace-pre-wrap break-all p-0 font-mono text-[11px] leading-relaxed text-zinc-300";
      }
      return "whitespace-pre-wrap break-all p-0 font-mono text-[11px] leading-relaxed text-zinc-100";
    }
    if (section.tone === "error") {
      return "whitespace-pre-wrap break-all p-0 font-mono text-[11px] leading-relaxed text-red-500/90";
    }
    return "whitespace-pre-wrap break-all p-0 font-mono text-[11px] leading-relaxed text-foreground/85";
  }

  let viber = $state<Viber | null>(null);
  let dbMessages = $state<Message[]>([]);
  let loading = $state(true);
  let inputValue = $state("");
  let selectedModelId = $state("");
  let selectedSkillIds = $state<string[]>([]);
  let composerEnvironments = $state<ComposerEnvInfo[]>([]);
  let selectedEnvironmentId = $state<string | null>(null);
  let sending = $state(false);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);
  // Error feedback for failed tasks / API errors
  let chatError = $state<string | null>(null);
  let showSkillSetupDialog = $state(false);
  let setupSkill = $state<ViberSkill | null>(null);
  let setupSkillError = $state<string | null>(null);
  let settingUpSkill = $state(false);
  let setupAuthAction = $state<"copy" | "start">("copy");
  let setupAuthCommand = $state<string | null>(null);

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
  let highlightedToolOutputId = $state<string | null>(null);
  let showMobileToolOutput = $state(false);
  let toolOutputHighlightTimeout: ReturnType<typeof setTimeout> | null = null;
  const toolOutputEntryElements = new Map<string, HTMLDivElement>();

  function getToolOutputEntryId(messageId: string, partIndex: number, toolName: string): string {
    return `${messageId}:${partIndex}:${toolName}`;
  }

  function trackToolOutputEntry(node: HTMLDivElement, id: string) {
    toolOutputEntryElements.set(id, node);

    return {
      update(nextId: string) {
        if (nextId === id) return;
        toolOutputEntryElements.delete(id);
        id = nextId;
        toolOutputEntryElements.set(id, node);
      },
      destroy() {
        toolOutputEntryElements.delete(id);
      },
    };
  }

  function triggerToolOutputHighlight(id: string): void {
    highlightedToolOutputId = id;
    if (toolOutputHighlightTimeout) {
      clearTimeout(toolOutputHighlightTimeout);
    }
    toolOutputHighlightTimeout = setTimeout(() => {
      if (highlightedToolOutputId === id) {
        highlightedToolOutputId = null;
      }
      toolOutputHighlightTimeout = null;
    }, 1400);
  }

  async function focusToolOutputEntry(id: string): Promise<void> {
    selectedToolOutputId = id;

    await tick();
    const entryElement = toolOutputEntryElements.get(id);
    const containerElement = toolOutputContainer;
    if (entryElement && containerElement) {
      entryElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      triggerToolOutputHighlight(id);
    }
  }


  onDestroy(() => {
    if (toolOutputHighlightTimeout) {
      clearTimeout(toolOutputHighlightTimeout);
      toolOutputHighlightTimeout = null;
    }
    highlightedToolOutputId = null;
  });

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

  // Track message count so we only auto-scroll when there is a new message, not on every reactive tick
  let prevMessageCount = $state(0);

  // Scroll only when message count actually increased (new message), not when user has scrolled up and conversation is done
  $effect(() => {
    const chatLen = chat?.messages?.length ?? 0;
    const dbLen = dbMessages.length;
    const total = Math.max(chatLen, dbLen);
    const hasNewMessage = total > prevMessageCount;
    prevMessageCount = total;
    if (hasNewMessage && messagesContainer) {
      userScrolledUp = false;
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
        const data = await response.json();
        viber = data;
        // Initialize selected skills from persisted enabled skills (only on first load)
        if (data.enabledSkills && selectedSkillIds.length === 0) {
          selectedSkillIds = data.enabledSkills;
        }
        // Sync environment selection from viber data (first load)
        if (data.environmentId && !selectedEnvironmentId) {
          selectedEnvironmentId = data.environmentId;
        }
        // Surface task-level errors from the hub/daemon
        if (data.status === "error" && data.error) {
          chatError = data.error;
        } else if (data.status !== "error") {
          // Clear stale error when status recovers (e.g. retry)
          if (chatError) chatError = null;
        }
        // Only reload messages when NOT actively sending (prevents duplicates)
        if (id && !sending) await fetchMessages(id);
      } else {
        goto("/");
      }
    } catch (error) {
      console.error("Failed to fetch viber:", error);
      goto("/");
    } finally {
      loading = false;
    }
  }

  async function sendMessage(overrideContent?: string) {
    const content = (overrideContent ?? inputValue).trim();
    if (!content || sending || viber?.nodeConnected !== true) return;

    const unavailableSelected = (viber?.skills ?? []).filter(
      (skill) =>
        selectedSkillIds.includes(skill.id) && skill.available === false,
    );
    if (unavailableSelected.length > 0) {
      handleSkillSetupRequest(unavailableSelected[0]);
      return;
    }

    chatError = null; // Clear previous error on retry
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

    // (Re-)create Chat each send so the transport picks up the latest model selection
    {
      chat = new Chat({
        transport: new DefaultChatTransport({
          api: `/api/vibers/${viber.id}/chat`,
          body: {
            ...(selectedModelId ? { model: selectedModelId } : {}),
            ...(selectedSkillIds.length > 0 ? { skills: selectedSkillIds } : {}),
            ...(selectedEnvironmentId
              ? { environmentId: selectedEnvironmentId }
              : {}),
          },
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
          chatError =
            error.message || "An error occurred during the chat session.";
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
      chatError =
        error instanceof Error ? error.message : "Failed to send message.";
      sending = false;
      sessionStartedAt = null;
    }
  }

  function handleSkillSetupRequest(skill: ViberSkill) {
    setupSkill = skill;
    setupSkillError = null;
    setupAuthAction = "copy";
    setupAuthCommand = null;
    showSkillSetupDialog = true;
  }

  async function runSkillProvision(install: boolean) {
    if (!setupSkill || !viber?.nodeId) {
      setupSkillError = "Node is unavailable for this viber.";
      return;
    }
    const targetSkill = setupSkill;

    settingUpSkill = true;
    setupSkillError = null;
    try {
      const response = await fetch("/api/skills/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId: targetSkill.id,
          nodeId: viber.nodeId,
          install,
          authAction: install ? setupAuthAction : "none",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to start skill setup.");
      }

      if (payload.ready) {
        if (!selectedSkillIds.includes(targetSkill.id)) {
          selectedSkillIds = [...selectedSkillIds, targetSkill.id];
        }
        showSkillSetupDialog = false;
        setupAuthCommand = null;
        await fetchViber();
        return;
      }

      await fetchViber();
      const latestSkill =
        (viber?.skills ?? []).find((skill) => skill.id === targetSkill.id) ||
        targetSkill;
      const auth = payload?.auth as
        | { required?: boolean; ready?: boolean; command?: string; message?: string }
        | undefined;
      if (auth?.required && !auth?.ready) {
        setupAuthCommand = auth.command || null;
        setupSkillError =
          auth.message ||
          `${latestSkill.name} still needs authentication before it can run.`;
        return;
      }

      setupSkillError =
        payload?.error ||
        latestSkill.healthSummary ||
        `${latestSkill.name} is still not ready.`;
    } catch (error) {
      setupSkillError =
        error instanceof Error ? error.message : "Failed to start skill setup.";
    } finally {
      settingUpSkill = false;
    }
  }

  async function startSkillSetup() {
    await runSkillProvision(true);
  }

  async function recheckSkillSetup() {
    await runSkillProvision(false);
  }

  async function copySetupAuthCommand() {
    if (!setupAuthCommand) return;
    try {
      await navigator.clipboard.writeText(setupAuthCommand);
    } catch {
      setupSkillError = "Failed to copy command. Please copy it manually.";
    }
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
        const display = buildToolOutputDisplay(part, toolName);
        entries.push({
          id: `${message.id}:${index}:${toolName}`,
          messageId: message.id,
          toolName,
          state: part.state || "input-available",
          output: flattenToolOutputDisplay(display),
          scenario: display.scenario,
          sections: display.sections,
          command: display.command,
          exitCode: display.exitCode,
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
    if (loading || sending || viber?.nodeConnected !== true) return;
    if (bootstrapTaskHandledViberId === viber.id) return;

    const storageKey = `openviber:new-viber-task:${viber.id}`;
    const pendingTask = window.sessionStorage.getItem(storageKey);
    if (!pendingTask) return;

    window.sessionStorage.removeItem(storageKey);
    bootstrapTaskHandledViberId = viber.id;
    void sendMessage(pendingTask);
  });

  async function fetchComposerContext() {
    try {
      const [envsRes, settingsRes] = await Promise.all([
        fetch("/api/environments"),
        fetch("/api/settings"),
      ]);

      if (envsRes.ok) {
        const data = await envsRes.json();
        composerEnvironments = (data.environments ?? []).map((e: any) => ({
          id: e.id,
          name: e.name,
        }));
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data?.chatModel && !selectedModelId) {
          selectedModelId = data.chatModel;
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  onMount(() => {
    fetchViber();
    fetchComposerContext();
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

<div
  class="chat-shell flex-1 flex w-full min-w-0 flex-col min-h-0 overflow-hidden"
>
  {#key toolOutputEntries.length > 0}
  <Resizable.PaneGroup
    direction="horizontal"
    class="flex-1 min-h-0 min-w-0 w-full overflow-hidden"
  >
    <Resizable.Pane
      defaultSize={toolOutputEntries.length > 0 ? 55 : 100}
      minSize={35}
      class="min-h-0 min-w-0 overflow-hidden flex flex-col"
    >
      <!-- Messages -->
      <div
        bind:this={messagesContainer}
        class="chat-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
        onscroll={handleScroll}
      >
        {#if loading}
          <div
            class="h-full flex items-center justify-center text-center text-muted-foreground"
          >
            Loading...
          </div>
        {:else if viber?.nodeConnected !== true}
          <div
            class="h-full flex items-center justify-center text-center text-muted-foreground p-4"
          >
            <div>
              <Cpu class="size-12 mx-auto mb-4 opacity-50" />
              <p class="text-lg font-medium">Node is offline</p>
              <p class="text-sm mt-2 max-w-sm">
                The node that hosts this viber is not connected. Start the viber
                daemon on that node to chat.
              </p>
              <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <a
                  href="/nodes"
                  class="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                >
                  Open Nodes
                </a>
                <a
                  href="/vibers/new"
                  class="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                >
                  Start New Chat
                </a>
                <button
                  type="button"
                  class="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-accent"
                  onclick={() => void fetchViber()}
                >
                  Retry
                </button>
              </div>
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

            </div>
          </div>
        {:else}
          <div class="px-3 py-6 sm:px-5">
            <div class="w-full space-y-5">
              {#each displayMessages as message (message.id)}
                {#if message.role === "user"}
                  <!-- User message: right-aligned bubble with subtle background -->
                  <div class="flex justify-end items-end gap-1.5 group/msg">
                    <button
                      type="button"
                      class="mb-1 shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover/msg:opacity-100"
                      title="Resend message"
                      disabled={sending}
                      onclick={() => {
                        const text = message.parts
                          ?.filter((p: any) => p.type === "text" && p.text)
                          .map((p: any) => p.text)
                          .join("\n") || "";
                        if (text.trim()) sendMessage(text.trim());
                      }}
                    >
                      <RefreshCw class="size-3.5" />
                    </button>
                    <div
                      class="user-bubble min-w-0 max-w-[95%] sm:max-w-[90%] rounded-2xl px-4 py-3 text-foreground"
                    >
                      {#each message.parts as part}
                        {#if part.type === "text" && (part as any).text}
                          <div class="message-markdown">
                            {@html renderMarkdown((part as any).text)}
                          </div>
                        {/if}
                      {/each}
                      <p class="text-[11px] mt-1.5 opacity-40 tracking-wide">
                        {new Date(
                          (message as any).createdAt || Date.now(),
                        ).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                {:else}
                  <!-- Assistant message: full-width, transparent background -->
                  <div class="min-w-0 w-full">
                    {#each message.parts as part, i}
                      {#if part.type === "text" && (part as any).text}
                        <div class="message-markdown text-foreground">
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
                          <div
                            class="rounded-lg transition-shadow focus-within:ring-2 focus-within:ring-ring"
                            role="button"
                            tabindex="0"
                            aria-label={`Focus ${toolName} output`}
                            onclick={() =>
                              void focusToolOutputEntry(
                                getToolOutputEntryId(message.id, i, toolName),
                              )}
                            onkeydown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void focusToolOutputEntry(
                                  getToolOutputEntryId(message.id, i, toolName),
                                );
                              }
                            }}
                          >
                            <ToolCall
                              {toolName}
                              toolState={toolPart.state || "input-available"}
                              input={toolPart.input}
                              output={toolPart.output}
                              errorText={toolPart.errorText}
                            />
                          </div>
                        {/if}
                      {/if}
                    {/each}
                    <p class="text-[11px] mt-1.5 opacity-30 tracking-wide">
                      {new Date(
                        (message as any).createdAt || Date.now(),
                      ).toLocaleTimeString()}
                    </p>
                  </div>
                {/if}
              {/each}

              {#if sending && (!chat?.messages || chat.messages.length === 0 || chat.messages[chat.messages.length - 1]?.role === "user")}
                <div class="min-w-0 w-full">
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
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="chat-composer-wrap p-3 shrink-0 sm:p-4">
        <!-- Mobile tool output toggle (visible < lg only) -->
        {#if toolOutputEntries.length > 0}
          <div class="flex lg:hidden mb-2">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onclick={() => (showMobileToolOutput = true)}
            >
              <TerminalSquare class="size-3.5" />
              Tool Output
              <span
                class="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold"
              >
                {toolOutputEntries.length}
              </span>
              {#if sending}
                <span
                  class="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500"
                  >Live</span
                >
              {/if}
            </button>
          </div>
        {/if}
        <ChatComposer
          bind:value={inputValue}
          bind:inputElement={inputEl}
          bind:selectedModelId
          bind:selectedEnvironmentId
          placeholder={viber?.nodeConnected === true
            ? "Send a task or command..."
            : "Node is offline"}
          disabled={viber?.nodeConnected !== true}
          {sending}
          nodes={[]}
          environments={composerEnvironments}
          skills={viber?.skills ?? []}
          bind:selectedSkillIds
          onsetupskill={handleSkillSetupRequest}
          onsubmit={() => sendMessage()}
        >
          {#snippet beforeInput()}
            <!-- Error banner -->
            {#if chatError}
              <div
                class="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 animate-in fade-in slide-in-from-bottom-1 duration-200"
              >
                <AlertCircle class="size-4 text-destructive shrink-0 mt-0.5" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-destructive">
                    Task failed
                  </p>
                  <p class="text-xs text-destructive/80 mt-0.5 wrap-break-word">
                    {chatError}
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 p-0.5 text-destructive/60 hover:text-destructive transition-colors"
                  onclick={() => (chatError = null)}
                  aria-label="Dismiss error"
                >
                  <X class="size-3.5" />
                </button>
              </div>
            {/if}

            <!-- Persistent session activity bar for long-running tasks -->
            {#if sending && sessionStartedAt}
              <SessionIndicator
                startedAt={sessionStartedAt}
                steps={activitySteps}
              />
            {/if}

          {/snippet}
        </ChatComposer>
        <p
          class="flex items-center gap-1.5 px-1 mt-2 text-[11px] text-muted-foreground"
        >
          <CornerDownLeft class="size-3" />
          Press Enter to send, Shift + Enter for a new line.
        </p>
      </div>
    </Resizable.Pane>

    {#if toolOutputEntries.length > 0}
    <Resizable.Handle class="hidden lg:flex" />

    <Resizable.Pane
      defaultSize={45}
      minSize={20}
      maxSize={60}
      class="hidden min-h-0 min-w-0 w-full overflow-hidden lg:block"
    >
      <aside
        class="tool-pane flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background/70"
      >
        {@render toolOutputContent()}
      </aside>
    </Resizable.Pane>
    {/if}
  </Resizable.PaneGroup>
  {/key}
</div>

<!-- Mobile Tool Output Sheet (< lg only) -->
<Sheet.Root bind:open={showMobileToolOutput}>
  <Sheet.Content side="right" class="w-[85%] sm:max-w-md p-0 flex flex-col">
    <Sheet.Header class="sr-only">
      <Sheet.Title>Tool Output</Sheet.Title>
      <Sheet.Description
        >View tool call outputs from the current session.</Sheet.Description
      >
    </Sheet.Header>
    <div class="flex flex-1 flex-col min-h-0 overflow-hidden">
      {@render toolOutputContent()}
    </div>
  </Sheet.Content>
</Sheet.Root>

<Dialog.Root bind:open={showSkillSetupDialog}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Set up {setupSkill?.name || "skill"}?</Dialog.Title>
      <Dialog.Description>
        {setupSkill?.name || "This skill"} is not ready on this node yet.
        Should I start guided setup now?
      </Dialog.Description>
    </Dialog.Header>

    {#if setupSkill?.healthSummary}
      <p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {setupSkill.healthSummary}
      </p>
    {/if}

    <div class="space-y-2 rounded-md border border-border bg-muted/20 px-3 py-2">
      <p class="text-xs font-medium text-foreground">If auth is needed</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs transition-colors {setupAuthAction === 'copy'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
          onclick={() => (setupAuthAction = "copy")}
        >
          Show command to copy
        </button>
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 text-xs transition-colors {setupAuthAction === 'start'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
          onclick={() => (setupAuthAction = "start")}
        >
          Try start auth now
        </button>
      </div>
    </div>

    {#if setupAuthCommand}
      <div class="space-y-2 rounded-md border border-border bg-background px-3 py-2">
        <p class="text-xs text-muted-foreground">Run this auth command:</p>
        <code class="block rounded-md bg-muted px-2 py-1 text-[11px] text-foreground">
          {setupAuthCommand}
        </code>
        <button
          type="button"
          class="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
          onclick={() => void copySetupAuthCommand()}
        >
          Copy command
        </button>
      </div>
    {/if}

    {#if setupSkillError}
      <p class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {setupSkillError}
      </p>
    {/if}

    <Dialog.Footer class="mt-2">
      <button
        type="button"
        class="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        onclick={() => {
          showSkillSetupDialog = false;
          setupSkillError = null;
          setupAuthCommand = null;
        }}
      >
        Not now
      </button>
      {#if setupSkillError}
        <button
          type="button"
          class="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-60"
          disabled={settingUpSkill}
          onclick={() => void recheckSkillSetup()}
        >
          Re-check
        </button>
      {/if}
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        disabled={settingUpSkill}
        onclick={() => void startSkillSetup()}
      >
        {#if settingUpSkill}
          Running setup...
        {:else}
          Yes, set it up
        {/if}
      </button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

{#snippet toolOutputContent()}
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
      class="flex-1 min-h-0 min-w-0 w-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] p-1.5"
      onscroll={handleToolOutputScroll}
    >
      <div class="space-y-1 min-w-0 w-full">
        {#each toolOutputEntries as entry (entry.id)}
          <div
            use:trackToolOutputEntry={entry.id}
            class="min-w-0 w-full rounded-lg transition-colors duration-300 {highlightedToolOutputId ===
            entry.id
              ? 'bg-primary/10'
              : ''}"
          >
            <Collapsible
              open={selectedToolOutputId === entry.id}
              class="min-w-0 w-full box-border overflow-hidden"
            >
              <CollapsibleTrigger
                class="box-border flex w-full min-w-0 overflow-hidden items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 {selectedToolOutputId ===
                entry.id
                  ? 'bg-muted/50'
                  : ''}"
                onclick={() => {
                  selectedToolOutputId =
                    selectedToolOutputId === entry.id ? null : entry.id;
                }}
              >
                <div
                  class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
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
                    <CheckCircle2 class="size-3.5 shrink-0 text-emerald-500" />
                  {/if}
                  <div class="min-w-0 w-0 flex-1 overflow-hidden">
                    <p
                      class="truncate text-[12px] font-medium text-foreground"
                    >
                      {entry.toolName}
                    </p>
                    {#if entry.summary}
                      <p
                        class="truncate text-[10px] text-muted-foreground"
                        title={entry.summary}
                      >
                        {entry.summary}
                      </p>
                    {/if}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent
                class="min-w-0 w-full max-w-full overflow-hidden"
              >
                <div
                  class="mx-2 mb-1 box-border max-h-48 min-w-0 w-[calc(100%-1rem)] max-w-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] rounded-md border border-border/50 bg-black/[0.03] dark:bg-white/[0.03]"
                >
                  {#if entry.output}
                    <pre
                      class="block box-border w-full min-w-0 max-w-full whitespace-pre-wrap wrap-anywhere p-3 font-mono text-[11px] leading-relaxed text-foreground/85">{entry.output}</pre>
                  {:else}
                    <p
                      class="p-3 text-[11px] text-muted-foreground"
                    >
                      Waiting for output...
                    </p>
                  {/if}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

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

  /* Force paneforge-rendered pane divs to constrain width.
     Paneforge sets width via flex-basis but never overflow:hidden
     or min-width:0, so flex children keep their intrinsic min-width
     (min-width:auto) and content like long tool names / output text
     can push the pane wider than its allocated size. */
  :global([data-pane]) {
    overflow: hidden;
    min-width: 0;
  }

  .chat-composer-wrap {
    background: linear-gradient(
      to top,
      hsl(var(--background)) 58%,
      hsl(var(--background) / 0.78)
    );
  }

  .user-bubble {
    background: hsl(var(--muted));
    border: 1px solid hsl(var(--border) / 0.6);
    border-top-right-radius: 0.55rem;
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
