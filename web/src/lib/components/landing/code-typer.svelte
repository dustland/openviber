<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    lines: string[];
  }

  let { lines = [] }: Props = $props();

  let visibleLines = $state<string[]>([]);
  let timer: ReturnType<typeof setTimeout>;

  function typeLines() {
    let index = 0;
    visibleLines = [];

    function nextLine() {
      if (index < lines.length) {
        visibleLines = [...visibleLines, lines[index]];
        index++;
        // Variable speed for realism? Or constant? Constant is cleaner for code.
        timer = setTimeout(nextLine, 100);
      }
    }

    nextLine();
  }

  onMount(() => {
    // Start typing after a short delay when component mounts
    timer = setTimeout(typeLines, 500);
    return () => clearTimeout(timer);
  });
</script>

<div class="font-mono text-sm leading-relaxed text-blue-100">
  <pre><code>{#each visibleLines as line, i}
    <div class="line">{@html line}{#if i === visibleLines.length - 1}<span class="cursor">|</span>{/if}</div>
  {/each}</code></pre>
</div>

<style>
  .line {
    min-height: 1.5em; /* Ensure empty lines have height */
    display: block;
  }
  .cursor {
    display: inline-block;
    color: hsl(var(--primary));
    animation: blink 1s step-end infinite;
    margin-left: 2px;
    font-weight: bold;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
</style>
