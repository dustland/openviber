<script lang="ts">
  let { children, class: className = "" } = $props();
  let div: HTMLDivElement;
  let mouseX = $state(0);
  let mouseY = $state(0);

  function handleMouseMove(e: MouseEvent) {
    if (!div) return;
    const rect = div.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={div}
  onmousemove={handleMouseMove}
  class="relative group rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-border/80 {className}"
>
  <div
    class="pointer-events-none absolute -inset-px transition duration-300 opacity-0 group-hover:opacity-100"
    style="
      background: radial-gradient(
        600px circle at {mouseX}px {mouseY}px,
        hsl(var(--primary) / 0.15),
        transparent 40%
      );
    "
  ></div>
  <div class="relative z-10 h-full">
    {@render children()}
  </div>
</div>
