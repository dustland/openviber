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
    // 1. Escape HTML
    let safe = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    const placeholders: Record<string, string> = {};
    let pCount = 0;

    const store = (match: string, type: 'C' | 'S') => {
      const key = `__${type}${pCount++}__`;
      placeholders[key] = match;
      return key;
    };

    // 2. Extract Strings (Priority over comments to handle URLs or strings containing //)
    safe = safe.replace(/(&#039;.*?&#039;)/g, (m) => store(m, 'S')); // '...'
    safe = safe.replace(/(&quot;.*?&quot;)/g, (m) => store(m, 'S')); // "..."
    safe = safe.replace(/(`.*?`)/g, (m) => store(m, 'S')); // `...`

    // 3. Extract Comments
    safe = safe.replace(/(\/\/.*$)/gm, (m) => store(m, 'C'));

    // 4. Keywords
    const keywords = [
      "const", "let", "var", "function", "return", "if", "else", "for", "while",
      "import", "from", "async", "await", "class", "interface", "type", "new",
      "export", "default", "try", "catch", "finally", "throw"
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    safe = safe.replace(kwRegex, '<span class="text-purple-400">$1</span>');

    // 5. Classes (Capitalized words)
    // Avoid matching inside existing tags (which are lowercase/kebab-case)
    safe = safe.replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span class="text-yellow-300">$1</span>');

    // 6. Restore
    for (const key in placeholders) {
       let val = placeholders[key];
       let wrapped = val;
       if (key.startsWith("__C")) {
         wrapped = `<span class="text-gray-500">${val}</span>`;
       } else if (key.startsWith("__S")) {
         wrapped = `<span class="text-green-400">${val}</span>`;
       }
       safe = safe.replace(key, wrapped);
    }

    return safe;
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
      // Line finished, highlight and add to displayed
      displayedLines = [...displayedLines, highlight(currentLine)];
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
