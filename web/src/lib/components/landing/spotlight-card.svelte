<script lang="ts">
  import { type Snippet } from "svelte";

  let {
    children,
    class: className = "",
    spotlightColor = "hsl(var(--primary) / 0.15)",
    borderColor = "hsl(var(--primary) / 0.3)",
    radius = "1rem", // default to rounded-xl approx
    ...rest
  }: {
    children: Snippet;
    class?: string;
    spotlightColor?: string;
    borderColor?: string;
    radius?: string;
    [key: string]: any;
  } = $props();

  let divRef: HTMLDivElement | undefined = $state();
  let position = $state({ x: 0, y: 0 });
  let opacity = $state(0);

  function handleMouseMove(e: MouseEvent) {
    if (!divRef) return;
    const rect = divRef.getBoundingClientRect();
    position.x = e.clientX - rect.left;
    position.y = e.clientY - rect.top;
  }

  function handleMouseEnter() {
    opacity = 1;
  }

  function handleMouseLeave() {
    opacity = 0;
  }
</script>

<div
  bind:this={divRef}
  onmousemove={handleMouseMove}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  tabindex="0"
  role="article"
  class="group relative overflow-hidden border border-border/50 bg-card/40 backdrop-blur-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none {className}"
  style:border-radius={radius}
  {...rest}
>
  <!-- Spotlight background -->
  <div
    class="pointer-events-none absolute -inset-px transition duration-300"
    style="opacity: {opacity}; background: radial-gradient(600px circle at {position.x}px {position.y}px, {spotlightColor}, transparent 40%); border-radius: {radius};"
  ></div>

  <!-- Border reveal (simulated via gradient border overlay) -->
  <div
    class="pointer-events-none absolute inset-0 transition duration-300"
    style="opacity: {opacity}; border-radius: {radius}; padding: 1px; background: radial-gradient(600px circle at {position.x}px {position.y}px, {borderColor}, transparent 40%); -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude;"
  ></div>

  <div class="relative h-full">
    {@render children()}
  </div>
</div>
