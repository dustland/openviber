<script lang="ts">
  import ChannelConfigPanel from "$lib/components/channel-config-panel.svelte";

  let { data } = $props();
  const viberId = $derived(data.viberId);
</script>

<svelte:head>
  <title>Channels — OpenViber</title>
</svelte:head>

<div class="h-full overflow-y-auto p-6">
  <ChannelConfigPanel {viberId} />
</div>
