<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    lines: string[];
  }

  let { lines = [] }: Props = $props();

  let displayedLines = $state<string[]>([]);
  let currentLine = $state("");
  let isTyping = $state(true);

  // Syntax highlighting logic
  function highlight(code: string) {
    if (!code) return "";

    // Escape HTML characters to prevent XSS and rendering issues
    // We don't escape quotes here to preserve string matching in regex below
    const safeCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const placeholders: string[] = [];
    const placehold = (replacement: string) => {
      placeholders.push(replacement);
      return `__PLACEHOLDER_${placeholders.length - 1}__`;
    };

    // 1. Extract comments and strings first (order matters for precedence)
    let temp = safeCode.replace(/(\/\/.*$)|('.*?')|(".*?")|(`.*?`)/gm, (match, comment, s1, s2, s3) => {
      if (comment) return placehold(`<span class="text-gray-500">${match}</span>`);
      if (s1 || s2 || s3) return placehold(`<span class="text-green-400">${match}</span>`);
      return match;
    });

    // 2. Keywords
    temp = temp.replace(/\b(import|from|const|let|var|await|async|function|return|new|class|interface|type|export|default)\b/g, '<span class="text-purple-400">$1</span>');

    // 3. Built-ins / Globals
    temp = temp.replace(/\b(console|log|Math|JSON|Promise|setTimeout|document|window)\b/g, '<span class="text-yellow-400">$1</span>');

    // 4. Booleans / Null
    temp = temp.replace(/\b(true|false|null|undefined)\b/g, '<span class="text-red-400">$1</span>');

    // 5. Restore placeholders
    return temp.replace(/__PLACEHOLDER_(\d+)__/g, (_, i) => placeholders[parseInt(i)]);
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
    const timer = setTimeout(typeCode, 500);
    return () => clearTimeout(timer);
  });
</script>

<div class="flex font-mono text-sm leading-relaxed whitespace-pre-wrap font-medium">
  <!-- Line Numbers -->
  <div class="select-none text-right pr-4 text-gray-600 border-r border-gray-700/50 mr-4">
     {#each Array(displayedLines.length + (isTyping ? 1 : 0)) as _, i}
       <div class="min-h-[1.5em]">{i + 1}</div>
     {/each}
  </div>

  <!-- Code Content -->
  <div class="flex-1 text-blue-100/90">
     {#each displayedLines as line}
       <div class="min-h-[1.5em]">{@html highlight(line)}</div>
     {/each}
     {#if isTyping}
       <div class="min-h-[1.5em]">
         {currentLine}<span class="inline-block w-2 h-4 align-middle bg-primary ml-0.5 animate-pulse"></span>
       </div>
     {/if}
  </div>
</div>
