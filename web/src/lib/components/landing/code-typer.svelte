<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    lines: string[];
  }

  let { lines = [] }: Props = $props();

  let displayedLines = $state<string[]>([]);
  let currentLine = $state("");
  let isTyping = $state(true);

  function highlight(code: string): string {
    if (!code) return "";

    // 1. Escape HTML special chars
    code = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 2. Comments (simple full-line check for the demo)
    if (code.trim().startsWith("//")) {
      return `<span class="text-gray-500 italic">${code}</span>`;
    }

    // 3. Tokenize by strings (simple quote matching)
    // We match "..." or '...'
    const parts = code.split(/(".*?"|'.*?')/g);

    return parts.map(part => {
      // If it's a string
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
        return `<span class="text-green-400">${part}</span>`;
      }

      // Process code part
      let p = part;

      // Keywords
      p = p.replace(/\b(import|const|let|var|function|return|if|else|new|await|async|try|catch|class|extends|super|this|export|default|from)\b/g, '<span class="text-purple-400">$1</span>');

      // Numbers
      p = p.replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>');

      // Function calls / Class instantiations (word followed by paren)
      // We rely on the fact that we already escaped < to &lt; so we don't match tags
      p = p.replace(/(\w+)(?=\()/g, '<span class="text-blue-400">$1</span>');

      // Special highlight for types or capitalized words? Maybe too noisy.

      return p;
    }).join("");
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
    <div class="min-h-[1.5em]">{@html highlight(line)}</div>
  {/each}
  {#if isTyping}
    <div class="min-h-[1.5em]">
      {currentLine}<span class="inline-block w-2 h-4 align-middle bg-primary ml-0.5 animate-pulse"></span>
    </div>
  {/if}
</div>
