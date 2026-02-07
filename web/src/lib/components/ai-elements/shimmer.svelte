<script lang="ts">
  /**
   * Shimmer — animated gradient text effect used during streaming.
   * Port of vercel/ai-elements shimmer.tsx
   */
  let { class: className = "" }: { class?: string } = $props();
</script>

<span
  class="inline-block animate-pulse bg-gradient-to-r from-current via-current/50 to-current bg-clip-text {className}"
>
  <slot />
</span>
