<script lang="ts">
  let { children } = $props();
</script>

<div class="flex h-full min-h-0 flex-col">
  {@render children()}
</div>
