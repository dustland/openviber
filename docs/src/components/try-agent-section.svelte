<script lang="ts">
  import ChatInput from "./playground/chat-input.svelte";

  function handleSendMessage(prompt: string) {
    if (!prompt.trim()) return;
    window.location.href = `/playground?prompt=${encodeURIComponent(prompt)}`;
  }

  const samples = [
    "Market Research Agent",
    "Documentation Generator",
    "Customer Support Bot",
    "Data Extraction Assistant",
  ];
</script>

<div class="w-full max-w-3xl mx-auto px-4 py-8">
  <div
    class="bg-muted/30 border border-border/50 rounded-2xl p-1 shadow-sm hover:border-primary/20 transition-colors"
  >
    <ChatInput
      onSendMessage={handleSendMessage}
      placeholder="Describe an agent to build..."
    />
  </div>

  <div class="flex flex-wrap items-center justify-center gap-2 mt-4 text-sm">
    <span class="text-muted-foreground mr-2">Try:</span>
    {#each samples as sample}
      <button
        onclick={() => handleSendMessage(sample)}
        class="px-3 py-1 bg-secondary/50 hover:bg-secondary text-secondary-foreground rounded-full text-xs transition-colors"
      >
        {sample}
      </button>
    {/each}
  </div>
</div>
