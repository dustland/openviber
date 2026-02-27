<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    lines: string[];
    language?: 'typescript' | 'bash';
    typingSpeed?: number;
  }

  let {
    lines = [],
    language = 'typescript',
    typingSpeed = 30
  }: Props = $props();

  let displayedLines = $state<string[]>([]);
  let currentLine = $state("");
  let isTyping = $state(true);

  // Simple tokenization logic
  function highlight(line: string): string {
    if (!line) return "";

    // Comments
    if (line.trim().startsWith("//") || line.trim().startsWith("#")) {
      return `<span class="text-gray-500 italic">${line}</span>`;
    }

    let highlighted = line;

    // Keywords (TypeScript/JS mostly)
    const keywords = [
      'import', 'from', 'const', 'let', 'var', 'async', 'await',
      'function', 'return', 'if', 'else', 'for', 'while', 'new', 'export', 'default', 'class', 'interface', 'type'
    ];

    // Create regex for keywords
    // Only highlight if it's a whole word boundary
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      highlighted = highlighted.replace(regex, `<span class="text-purple-400 font-bold">${keyword}</span>`);
    });

    // Strings (double or single quotes)
    // Note: Simple regex, might break on escaped quotes but good enough for landing page
    highlighted = highlighted.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, match => `<span class="text-green-400">${match}</span>`);

    // Numbers
    highlighted = highlighted.replace(/\b\d+\b/g, match => `<span class="text-orange-400">${match}</span>`);

    // Types (Capitals) - heuristic
    highlighted = highlighted.replace(/\b[A-Z][a-zA-Z0-9]*\b/g, match => {
        // Avoid re-coloring keywords if they were capitalized (unlikely for JS/TS keywords) or already inside tags
        if (match.startsWith('<span')) return match;
        return `<span class="text-yellow-400">${match}</span>`;
    });

    return highlighted;
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
        await new Promise(r => setTimeout(r, Math.random() * typingSpeed + 10));
      }
      // Line finished, add to displayed and clear current
      displayedLines = [...displayedLines, line]; // Store raw line for highlight processing
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

<div class="font-mono text-sm leading-relaxed text-blue-100/90 whitespace-pre font-medium overflow-x-auto">
  <table class="w-full border-collapse">
    <tbody>
      {#each displayedLines as line, i}
        <tr>
          <td class="w-8 pr-4 text-right text-white/20 select-none align-top">{i + 1}</td>
          <td class="align-top">{@html highlight(line)}</td>
        </tr>
      {/each}
      {#if isTyping}
        <tr>
          <td class="w-8 pr-4 text-right text-white/20 select-none align-top">{displayedLines.length + 1}</td>
          <td class="align-top">
            {currentLine}<span class="inline-block w-2 h-4 align-middle bg-primary ml-0.5 animate-pulse"></span>
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>
