<script lang="ts">
  interface Props {
    title?: string;
    icon?: string;
    children?: any;
  }

  let { title, icon, children }: Props = $props();
</script>

<div class="rounded-lg border border-border bg-card p-4">
  {#if title}
    <h3 class="font-semibold mb-2 flex items-center gap-2">
      {#if icon}<span>{icon}</span>{/if}
      {title}
    </h3>
  {/if}
  <div class="text-sm text-muted-foreground">
    {@render children?.()}
  </div>
</div>
