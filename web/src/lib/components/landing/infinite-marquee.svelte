<script lang="ts">
  interface Item {
    name: string;
    category?: string;
    icon?: any;
  }

  let { items = [] } = $props();
</script>

<div class="relative overflow-hidden w-full py-4 mask-fade">
  <div class="marquee-track flex gap-4 min-w-full w-max">
    {#each items as item}
      <div class="marquee-item group inline-flex items-center gap-2 px-4 py-2 bg-card/50 border border-border/60 rounded-full backdrop-blur-md hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-default">
        {#if item.icon}
          {@const Icon = item.icon}
          <Icon class="size-4 text-primary" />
        {/if}
        <span class="text-sm font-medium">{item.name}</span>
        {#if item.category}
          <span class="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/50 px-1.5 py-0.5 rounded-full group-hover:bg-background/80 transition-colors">{item.category}</span>
        {/if}
      </div>
    {/each}
    <!-- Duplicate items for seamless loop -->
    {#each items as item}
      <div class="marquee-item group inline-flex items-center gap-2 px-4 py-2 bg-card/50 border border-border/60 rounded-full backdrop-blur-md hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-default">
        {#if item.icon}
          {@const Icon = item.icon}
          <Icon class="size-4 text-primary" />
        {/if}
        <span class="text-sm font-medium">{item.name}</span>
        {#if item.category}
          <span class="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/50 px-1.5 py-0.5 rounded-full group-hover:bg-background/80 transition-colors">{item.category}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .marquee-track {
    animation: scroll 40s linear infinite;
  }

  .marquee-track:hover {
    animation-play-state: paused;
  }

  .mask-fade {
    mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
  }

  @keyframes scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
</style>
