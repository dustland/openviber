<script lang="ts">
  import { onMount } from "svelte";
  import { playgroundStore } from "$lib/stores/playground-store";
  import ChatZone from "./chat-zone.svelte";
  import SpacePanel from "./space-panel.svelte";
  import { Trash2, FolderOpen } from "lucide-svelte";

  let isLoading = $state(false);

  onMount(() => {
    // Initialize store from localStorage
    playgroundStore.init();

    // Check for initial prompt from URL
    const params = new URLSearchParams(window.location.search);
    const initialPrompt = params.get("prompt");
    if (initialPrompt) {
      handleSendMessage(initialPrompt);
      window.history.replaceState({}, "", "/playground");
    }
  });

  async function handleSendMessage(content: string) {
    if (!content.trim() || isLoading) return;

    isLoading = true;

    // Add user message
    playgroundStore.addMessage("user", content);

    try {
      // Build conversation history for context
      const state = playgroundStore.getState();
      const conversationHistory = state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4",
          messages: conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;

      // Handle tool calls from the LLM
      if (message?.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.function?.name === "create_artifact") {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              playgroundStore.addArtifact(
                args.filename,
                args.content,
                args.file_type || "text",
              );
            } catch (e) {
              console.error("Failed to parse tool call:", e);
            }
          }
        }

        // If there's also text content, show it
        if (message.content) {
          playgroundStore.addMessage("assistant", message.content);
        } else {
          // Acknowledge the artifact creation
          const artifactNames = message.tool_calls
            .filter((tc: any) => tc.function?.name === "create_artifact")
            .map((tc: any) => {
              try {
                return JSON.parse(tc.function.arguments).filename;
              } catch {
                return "file";
              }
            });
          playgroundStore.addMessage(
            "assistant",
            `I've created ${artifactNames.join(", ")} in your workspace. You can view and edit the files in the panel on the right.`,
          );
        }
      } else {
        // Regular text response
        const aiContent = message?.content || "No response received.";
        playgroundStore.addMessage("assistant", aiContent);
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      playgroundStore.addMessage(
        "assistant",
        `Sorry, I encountered an error: ${error.message}`,
      );
    } finally {
      isLoading = false;
    }
  }

  function handleClearSpace() {
    if (confirm("Clear all messages and artifacts?")) {
      playgroundStore.clearSpace();
    }
  }
</script>

<div class="playground-layout">
  <!-- Chat Zone -->
  <div class="main-area">
    <div class="toolbar">
      <div class="toolbar-title">
        <FolderOpen size={16} />
        <span>Playground Space</span>
      </div>
      <button
        class="clear-btn"
        onclick={handleClearSpace}
        title="Clear workspace"
      >
        <Trash2 size={14} />
        Clear
      </button>
    </div>
    <ChatZone onSendMessage={handleSendMessage} {isLoading} />
  </div>

  <!-- Space Panel -->
  <SpacePanel />
</div>

<style>
  .playground-layout {
    display: flex;
    height: 100%;
    background: var(--sl-color-bg);
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--sl-color-gray-5);
    background: var(--sl-color-bg-nav);
  }

  .toolbar-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--sl-color-text);
  }

  .clear-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--sl-color-gray-2);
    background: transparent;
    border: 1px solid var(--sl-color-gray-5);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-btn:hover {
    color: oklch(0.577 0.245 27.325);
    border-color: oklch(0.577 0.245 27.325 / 0.5);
    background: oklch(0.577 0.245 27.325 / 0.1);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .playground-layout {
      flex-direction: column;
    }

    .playground-layout :global(.space-panel) {
      width: 100%;
      min-width: 100%;
      height: 40%;
      border-left: none;
      border-top: 1px solid var(--sl-color-gray-5);
    }
  }
</style>
