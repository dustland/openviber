<script lang="ts">
  import { playgroundStore, type Message } from "$lib/stores/playground-store";
  import ChatInput from "../chat-input.svelte";
  import { Bot, User, Sparkles } from "lucide-svelte";

  interface Props {
    onSendMessage: (content: string) => void;
    isLoading?: boolean;
  }

  let { onSendMessage, isLoading = false }: Props = $props();

  const space = $derived($playgroundStore);
  const hasMessages = $derived(space.messages.length > 0);

  const samplePrompts = [
    "Write a product requirements document for a task management app",
    "Analyze the pros and cons of microservices architecture",
    "Create a weekly meal plan with shopping list",
    "Draft a cold outreach email for potential investors",
  ];
</script>

<div class="chat-zone">
  {#if !hasMessages}
    <!-- Welcome State -->
    <div class="welcome-state">
      <div class="welcome-content">
        <div class="welcome-icon">
          <Sparkles size={48} />
        </div>
        <h1 class="welcome-title">What can I help you build?</h1>
        <p class="welcome-subtitle">
          Start a conversation to explore Viber's multi-agent capabilities
        </p>

        <div class="sample-prompts">
          {#each samplePrompts as prompt}
            <button class="sample-prompt" onclick={() => onSendMessage(prompt)}>
              {prompt}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- Messages -->
    <div class="messages-container">
      {#each space.messages as message (message.id)}
        <div
          class="message"
          class:user={message.role === "user"}
          class:assistant={message.role === "assistant"}
        >
          <div class="message-avatar">
            {#if message.role === "user"}
              <User size={16} />
            {:else}
              <Bot size={16} />
            {/if}
          </div>
          <div class="message-content">
            <div class="message-role">
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            <div class="message-text">{message.content}</div>
          </div>
        </div>
      {/each}

      {#if isLoading}
        <div class="message assistant">
          <div class="message-avatar">
            <Bot size={16} />
          </div>
          <div class="message-content">
            <div class="message-role">Assistant</div>
            <div class="message-text typing">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Input -->
  <div class="input-container">
    <ChatInput
      {onSendMessage}
      {isLoading}
      placeholder={hasMessages
        ? "Continue the conversation..."
        : "Describe what you want to build..."}
    />
  </div>
</div>

<style>
  .chat-zone {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    overflow: hidden;
  }

  /* Welcome State */
  .welcome-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .welcome-content {
    max-width: 640px;
    text-align: center;
  }

  .welcome-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      oklch(0.7 0.15 200) 0%,
      oklch(0.6 0.2 280) 100%
    );
    color: white;
    margin-bottom: 1.5rem;
  }

  .welcome-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--sl-color-text);
    margin: 0 0 0.5rem;
  }

  .welcome-subtitle {
    font-size: 1.125rem;
    color: var(--sl-color-gray-2);
    margin: 0 0 2rem;
  }

  .sample-prompts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }

  .sample-prompt {
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
    color: var(--sl-color-text);
    background: var(--sl-color-gray-6);
    border: 1px solid var(--sl-color-gray-5);
    border-radius: 2rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sample-prompt:hover {
    background: var(--sl-color-gray-5);
    border-color: var(--sl-color-accent);
  }

  /* Messages */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    display: flex;
    gap: 0.75rem;
    max-width: 85%;
  }

  .message.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .message-avatar {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--sl-color-gray-5);
    color: var(--sl-color-text);
  }

  .message.assistant .message-avatar {
    background: linear-gradient(
      135deg,
      oklch(0.7 0.15 200) 0%,
      oklch(0.6 0.2 280) 100%
    );
    color: white;
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .message-role {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--sl-color-gray-2);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .message.user .message-role {
    text-align: right;
  }

  .message-text {
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    font-size: 0.9375rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .message.user .message-text {
    background: var(--sl-color-accent);
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .message.assistant .message-text {
    background: var(--sl-color-gray-6);
    color: var(--sl-color-text);
    border-bottom-left-radius: 0.25rem;
  }

  /* Typing indicator */
  .typing {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.875rem 1rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sl-color-gray-3);
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(1) {
    animation-delay: 0s;
  }
  .dot:nth-child(2) {
    animation-delay: 0.16s;
  }
  .dot:nth-child(3) {
    animation-delay: 0.32s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0.6);
      opacity: 0.4;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Input Container */
  .input-container {
    padding: 1rem 1.5rem 1.5rem;
    border-top: 1px solid var(--sl-color-gray-5);
    background: var(--sl-color-bg);
  }
</style>
