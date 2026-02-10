<script lang="ts">
  /**
   * Shimmer — animated gradient text effect used during streaming.
   * Port of vercel/ai-elements shimmer.tsx
   */
  import type { Snippet } from "svelte";

  let {
    class: className = "",
    children,
  }: { class?: string; children?: Snippet } = $props();
</script>

<span
  class="inline-block animate-pulse bg-linear-to-r from-current via-current/50 to-current bg-clip-text {className}"
>
  {@render children?.()}
</span>
