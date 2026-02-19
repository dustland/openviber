<script lang="ts">
  import { cn } from "$lib/utils";

  let { children, class: className = "", delay = 0 } = $props();

  let mouseX = $state(0);
  let mouseY = $state(0);
  let cardRef: HTMLDivElement | undefined = $state();

  function handleMouseMove(e: MouseEvent) {
    if (!cardRef) return;
    const rect = cardRef.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }
</script>

<div
  bind:this={cardRef}
  onmousemove={handleMouseMove}
  role="none"
  class={cn(
    "group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors duration-500 hover:border-white/20",
    className
  )}
  style="--mouse-x: {mouseX}px; --mouse-y: {mouseY}px; --delay: {delay}ms;"
>
  <!-- Spotlight overlay -->
  <div
    class="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
    style="background: radial-gradient(600px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.06), transparent 40%);"
  ></div>

  <div class="relative z-10 h-full">
    {@render children()}
  </div>
</div>
