<script lang="ts">
  import { cn } from "$lib/utils";

  let { class: className, children, onclick, ...rest } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={cn("rounded-xl border bg-card text-card-foreground shadow", className)}
  {onclick}
  {...rest}
>
  {@render children?.()}
</div>
