<script lang="ts">
  import { type Snippet } from "svelte";

  let {
    filename = "untitled",
    children,
    class: className = ""
  }: {
    filename?: string;
    children: Snippet;
    class?: string;
  } = $props();
</script>

<div class="rounded-xl border border-white/10 bg-[#1e1e1e] shadow-2xl overflow-hidden {className}">
  <!-- Window Header -->
  <div class="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-white/5">
    <div class="flex gap-2">
      <div class="size-3 rounded-full bg-[#ff5f56]"></div>
      <div class="size-3 rounded-full bg-[#ffbd2e]"></div>
      <div class="size-3 rounded-full bg-[#27c93f]"></div>
    </div>
    <div class="text-xs font-medium text-white/40 font-mono tracking-wide select-none">
      {filename}
    </div>
    <div class="w-10"></div> <!-- Spacer for centering -->
  </div>

  <!-- Content Area -->
  <div class="p-4 sm:p-6 overflow-x-auto">
    {@render children()}
  </div>
</div>
