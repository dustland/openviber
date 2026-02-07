<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";
  import type { Snippet } from "svelte";

  let {
    class: className,
    children,
    ...restProps
  }: CollapsiblePrimitive.TriggerProps & {
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<CollapsiblePrimitive.Trigger class={cn(className)} {...restProps}>
  {@render children?.()}
</CollapsiblePrimitive.Trigger>
