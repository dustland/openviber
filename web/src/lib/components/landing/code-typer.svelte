<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    lines: string[];
  }

  let { lines = [] }: Props = $props();

  let displayedLines = $state<string[]>([]);
  let currentLine = $state("");
  let isTyping = $state(true);

  function highlightCode(code: string): string {
    // 1. Comments (handle first to avoid matching inside)
    if (code.trim().startsWith('//')) {
      return `<span class="text-gray-500 italic">${code}</span>`;
    }

    const placeholders: string[] = [];

    // 2. Extract strings and replace with placeholder
    // We match '...', "...", or `...`
    let temp = code.replace(/(['"`])(.*?)\1/g, (match) => {
      // Escape HTML entities in the match if needed, but for now assuming safe input
      placeholders.push(`<span class="text-green-400">${match}</span>`);
      return `__STR_${placeholders.length - 1}__`;
    });

    // 3. Highlight keywords
    temp = temp.replace(/\b(const|let|var|function|return|import|from|await|async|new|if|else|export|default|class|typeof|void)\b/g, '<span class="text-purple-400">$1</span>');

    // 4. Highlight numbers
    temp = temp.replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>');

    // 5. Highlight functions (method calls)
    temp = temp.replace(/\b([a-zA-Z_]\w*)(?=\()/g, '<span class="text-blue-400">$1</span>');

    // 6. Restore strings
    return temp.replace(/__STR_(\d+)__/g, (_, index) => placeholders[parseInt(index)]);
  }

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
      // Line finished, add to displayed (highlighted) and clear current
      displayedLines = [...displayedLines, highlightCode(currentLine)];
      currentLine = "";
      // Small pause between lines
      await new Promise(r => setTimeout(r, 100));
    }
    isTyping = false;
  }

  onMount(() => {
    const timer = setTimeout(typeCode, 500);
    return () => clearTimeout(timer);
  });
</script>

<div class="font-mono text-sm leading-relaxed text-blue-100/90 whitespace-pre-wrap font-medium">
  {#each displayedLines as line}
    <div class="min-h-[1.5em]">{@html line}</div>
  {/each}
  {#if isTyping}
    <div class="min-h-[1.5em]">
      {currentLine}<span class="inline-block w-2 h-4 align-middle bg-primary ml-0.5 animate-pulse"></span>
    </div>
  {/if}
</div>
