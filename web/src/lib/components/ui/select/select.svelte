<script lang="ts">
	import type { HTMLSelectAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { ChevronDown } from "@lucide/svelte";

	let {
		class: className,
		ref = $bindable(null),
		value = $bindable(),
		children,
		...restProps
	}: WithElementRef<HTMLSelectAttributes> = $props();
</script>

<div class="relative w-full">
	<select
		bind:this={ref}
		class={cn(
			"border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 appearance-none rounded-md border px-3 py-1 pr-8 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
			"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
			"aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
			className
		)}
		bind:value
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDown
		class="text-muted-foreground pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
	/>
</div>
