<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";
  import type { Snippet } from "svelte";

  let {
    class: className,
    open = $bindable(false),
    children,
    ...restProps
  }: CollapsiblePrimitive.RootProps & {
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<CollapsiblePrimitive.Root bind:open class={cn(className)} {...restProps}>
  {@render children?.()}
</CollapsiblePrimitive.Root>
