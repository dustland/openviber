<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    lines: string[];
  }

  let { lines = [] }: Props = $props();

  let displayedLines = $state<string[]>([]);
  let currentLine = $state("");
  let isTyping = $state(true);

  async function typeCode() {
    displayedLines = [];
    currentLine = "";
    isTyping = true;

    for (const line of lines) {
      // Type the line character by character
      for (let i = 0; i < line.length; i++) {
        currentLine += line[i];
        // Random typing delay for realism
        await new Promise(r => setTimeout(r, Math.random() * 30 + 10));
      }
      // Line finished, add to displayed and clear current
      displayedLines = [...displayedLines, currentLine];
      currentLine = "";
      // Small pause between lines
      await new Promise(r => setTimeout(r, 100));
    }
    isTyping = false;
  }

  onMount(() => {
    // Start typing when visible? Or just on mount.
    // For now, on mount with a small delay.
    const timer = setTimeout(typeCode, 500);
    return () => clearTimeout(timer);
  });
</script>

<div class="font-mono text-sm leading-relaxed text-blue-100/90 whitespace-pre-wrap font-medium">
  {#each displayedLines as line}
    <div class="min-h-[1.5em]">{line}</div>
  {/each}
  {#if isTyping}
    <div class="min-h-[1.5em]">
      {currentLine}<span class="inline-block w-2 h-4 align-middle bg-primary ml-0.5 animate-pulse"></span>
    </div>
  {/if}
</div>
