<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { Send, Cpu, MessageSquare, Sparkles } from "@lucide/svelte";
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

  let viber = $state<Viber | null>(null);
  let messages = $state<Message[]>([]);
  let loading = $state(true);
  let inputValue = $state("");
  let sending = $state(false);
  let currentTaskId = $state<string | null>(null);
  let messagesContainer = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);

  $effect(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        })
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

    // Persist user message at Viber Board level
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
            const streamingText =
              (task.partialText as string | undefined)?.trim() ||
              (task.events as Array<{ event?: { message?: string } }> | undefined)
                ?.slice(-1)
                ?.map((e) => e?.event?.message)
                ?.filter(Boolean)
                ?.join("\n") ||
              "Processing task...";

            messages = messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: streamingText } : m
            );
          }
          if (task.status === "completed") {
            const text =
              (task.result?.text as string)?.trim() ||
              task.result?.summary ||
              "(No response text)";
            messages = messages.map((m) =>
              m.id === assistantMessageId ? { ...m, content: text } : m
            );
            // Persist assistant message at Viber Board level
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
              m.id === assistantMessageId ? { ...m, content: errText } : m
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
                  : m
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
    const interval = setInterval(fetchViber, 5000);
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>{viber?.name || "Viber"} - Viber Board</title>
</svelte:head>

<div class="flex-1 flex flex-col min-h-0 overflow-hidden">
  <!-- Messages -->
  <div
      bind:this={messagesContainer}
      class="flex-1 min-h-0 overflow-y-auto"
    >
      {#if loading}
        <div class="h-full flex items-center justify-center text-center text-muted-foreground">
          Loading...
        </div>
      {:else if !viber?.isConnected}
        <div class="h-full flex items-center justify-center text-center text-muted-foreground p-4">
          <div>
            <Cpu class="size-12 mx-auto mb-4 opacity-50" />
            <p class="text-lg font-medium">Viber is Offline</p>
            <p class="text-sm mt-2 max-w-sm">
              This viber is not currently connected. Start the viber daemon to chat.
            </p>
          </div>
        </div>
        {:else if messages.length === 0}
          <div class="h-full flex flex-col items-center justify-center py-12 px-4">
            <div class="text-center mb-8">
              <div class="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary mb-4">
                <Sparkles class="size-6" />
              </div>
              <h2 class="text-xl font-semibold text-foreground mb-2">
                What can I help you with?
              </h2>
              <p class="text-sm text-muted-foreground max-w-md">
                Start a conversation with your viber. Try one of the suggestions below or type your own message.
              </p>
            </div>

            <div class="grid gap-2 w-full max-w-lg">
              <button
                type="button"
                class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors group"
                onclick={() => sendMessage("What can you do? List your capabilities.")}
              >
                <MessageSquare class="size-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-foreground">What can you do?</p>
                  <p class="text-xs text-muted-foreground">List your capabilities and available skills</p>
                </div>
              </button>

              <button
                type="button"
                class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors group"
                onclick={() => sendMessage("Help me understand the current project structure.")}
              >
                <MessageSquare class="size-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-foreground">Explore the project</p>
                  <p class="text-xs text-muted-foreground">Understand the current project structure</p>
                </div>
              </button>

              <button
                type="button"
                class="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 text-left transition-colors group"
                onclick={() => sendMessage("Run the dev server and show me the output.")}
              >
                <MessageSquare class="size-5 text-muted-foreground group-hover:text-foreground shrink-0 mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-foreground">Run dev server</p>
                  <p class="text-xs text-muted-foreground">Start the development server and monitor output</p>
                </div>
              </button>

              {#if viber.skills && viber.skills.length > 0}
                <div class="mt-2 pt-2 border-t border-border/50">
                  <p class="text-xs text-muted-foreground mb-2 px-1">Available skills:</p>
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
        <div class="p-3">
          <div class="mx-auto w-full max-w-3xl space-y-3">
            {#each messages as message (message.id)}
              <div
                class="flex {message.role === 'user'
                  ? 'justify-end'
                  : 'justify-start'}"
              >
                <div
                  class="max-w-[85%] rounded-lg px-4 py-2 {message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'}"
                >
                  <div class="message-markdown">
                    {@html renderMarkdown(message.content)}
                  </div>
                  <p class="text-xs mt-1 opacity-70">
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Input: single row only -->
    <div class="border-t border-border p-3 shrink-0">
      <div class="mx-auto w-full max-w-3xl space-y-2">
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

        <div class="flex gap-2 items-end">
          <textarea
            bind:this={inputEl}
            bind:value={inputValue}
            onkeydown={handleKeydown}
            placeholder={viber?.isConnected
              ? "Send a task or command..."
              : "Viber is offline"}
            class="flex-1 min-h-[40px] max-h-28 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            rows="1"
            disabled={sending || !viber?.isConnected}
          ></textarea>
          <Button
            onclick={() => sendMessage()}
            disabled={sending || !inputValue.trim() || !viber?.isConnected}
            class="size-10 shrink-0"
          >
            <Send class="size-4" />
          </Button>
        </div>
      </div>
    </div>
</div>

<style>
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
