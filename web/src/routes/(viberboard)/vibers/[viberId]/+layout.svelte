<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { ArrowLeft, RefreshCw } from "@lucide/svelte";
  import ViberIcon from "$lib/components/icons/viber-icon.svelte";

  let { children, data } = $props();

  const viberId = $derived(data.viberId);
  const pathname = $derived($page.url.pathname);

  interface ViberInfo {
    id: string;
    name: string;
    viber_id: string | null;
    status: "pending" | "active" | "offline";
  }

  let viber = $state<ViberInfo | null>(null);
  let loading = $state(true);

  const tabs = [
    { label: "Status", href: `/vibers/${viberId}/status` },
    { label: "Settings", href: `/vibers/${viberId}/settings` },
    { label: "Skills", href: `/vibers/${viberId}/skills` },
    { label: "Channels", href: `/vibers/${viberId}/channels` },
    { label: "Jobs", href: `/vibers/${viberId}/jobs` },
    { label: "Tasks", href: `/vibers/${viberId}/tasks` },
  ] as const;

  // Reactively recompute tabs when viberId changes
  const activeTabs = $derived([
    { label: "Status", href: `/vibers/${viberId}/status` },
    { label: "Settings", href: `/vibers/${viberId}/settings` },
    { label: "Skills", href: `/vibers/${viberId}/skills` },
    { label: "Channels", href: `/vibers/${viberId}/channels` },
    { label: "Jobs", href: `/vibers/${viberId}/jobs` },
    { label: "Tasks", href: `/vibers/${viberId}/tasks` },
  ]);

  function statusBadgeClass(status: ViberInfo["status"]) {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "pending":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  }

  function statusLabel(status: ViberInfo["status"]) {
    switch (status) {
      case "active":
        return "Active";
      case "pending":
        return "Pending";
      default:
        return "Offline";
    }
  }

  async function fetchViber() {
    loading = true;
    try {
      const res = await fetch("/api/vibers");
      if (!res.ok) return;
      const payload = await res.json();
      const vibers: ViberInfo[] = payload.vibers ?? [];
      viber =
        vibers.find((v) => v.viber_id === viberId || v.id === viberId) ?? null;
    } catch {
      viber = null;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchViber();
  });
</script>

<svelte:head>
  <title>{viber?.name ?? "Viber"} — OpenViber</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <header
    class="shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-4"
  >
    <div class="flex items-center gap-4 mb-3">
      <a
        href="/vibers"
        class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft class="size-4" />
        <span>Vibers</span>
      </a>
    </div>
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
        >
          <ViberIcon class="size-5 text-primary" />
        </div>
        <div class="min-w-0">
          {#if loading}
            <div class="h-6 w-40 rounded bg-muted animate-pulse"></div>
          {:else if viber}
            <div class="flex items-center gap-2.5">
              <h1 class="text-xl font-semibold text-foreground truncate">
                {viber.name}
              </h1>
              <span
                class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(viber.status)}`}
              >
                {statusLabel(viber.status)}
              </span>
            </div>
            <p class="text-xs text-muted-foreground font-mono mt-0.5 truncate">
              {viberId}
            </p>
          {:else}
            <h1 class="text-xl font-semibold text-foreground">
              Viber Not Found
            </h1>
          {/if}
        </div>
      </div>
      <button
        type="button"
        class="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        title="Refresh"
        onclick={() => fetchViber()}
      >
        <RefreshCw class="size-4" />
      </button>
    </div>

    <!-- Tab Navigation -->
    <nav class="flex items-center gap-1 mt-4 -mb-[1px]">
      {#each activeTabs as tab}
        {@const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + "/")}
        <a
          href={tab.href}
          class="px-3.5 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors {isActive
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          {tab.label}
        </a>
      {/each}
    </nav>
  </header>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    {@render children()}
  </div>
</div>
