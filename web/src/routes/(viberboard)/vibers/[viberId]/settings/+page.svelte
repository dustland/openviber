<script lang="ts">
  import { RefreshCw, Puzzle, Network, X, Server } from "@lucide/svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ChannelConfigPanel from "$lib/components/channel-config-panel.svelte";

  interface DetailedStatus {
    machine?: Record<string, unknown>;
    viber?: {
      viberId: string;
      viberName: string;
      version: string;
      connected: boolean;
      daemonUptimeSeconds: number;
      processMemory: Record<string, number>;
      runningTaskCount: number;
      runningTasks: unknown[];
      skills: string[];
      capabilities: string[];
      skillHealth?: SkillHealthReport;
      totalTasksExecuted: number;
      lastHeartbeatAt?: string;
      collectedAt: string;
    };
  }

  interface SkillHealthCheck {
    id: string;
    label: string;
    ok: boolean;
    required?: boolean;
    message?: string;
    hint?: string;
    actionType?: "env" | "oauth" | "binary" | "auth_cli" | "manual";
  }

  interface SkillHealthResult {
    id: string;
    name: string;
    status: string;
    available: boolean;
    checks: SkillHealthCheck[];
    summary: string;
  }

  interface SkillHealthReport {
    generatedAt: string;
    skills: SkillHealthResult[];
  }

  let { data } = $props();
  const viberId = $derived(data.viberId);

  // We fetch viber info to get config_sync_state
  interface ViberInfo {
    id: string;
    viber_id: string | null;
    config_sync_state?: {
      configVersion?: string;
      lastConfigPullAt?: string;
      validations?: Array<{
        category: string;
        status: string;
        message?: string;
        checkedAt: string;
      }>;
    };
  }

  let status = $state<DetailedStatus | null>(null);
  let configSyncState = $state<ViberInfo["config_sync_state"] | undefined>(
    undefined,
  );
  let loading = $state(true);
  let error = $state<string | null>(null);

  function formatTimeAgo(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  function getConfigSyncStatus(syncState: {
    configVersion?: string;
    lastConfigPullAt?: string;
    validations?: Array<{ status: string }>;
  }): { label: string; badgeClass: string } {
    if (!syncState.configVersion) {
      return { label: "Pending", badgeClass: "bg-muted text-muted-foreground" };
    }

    const validations = syncState.validations || [];
    const failed = validations.filter((v) => v.status === "failed");
    const verified = validations.filter((v) => v.status === "verified");

    if (failed.length > 0) {
      return { label: "Failed", badgeClass: "bg-rose-500/10 text-rose-600" };
    }
    if (verified.length > 0 && failed.length === 0) {
      return {
        label: "Verified",
        badgeClass: "bg-emerald-500/10 text-emerald-600",
      };
    }
    if (syncState.lastConfigPullAt) {
      return {
        label: "Delivered",
        badgeClass: "bg-amber-500/10 text-amber-600",
      };
    }
    return { label: "Pending", badgeClass: "bg-muted text-muted-foreground" };
  }

  function healthLabel(s: string): string {
    switch (s) {
      case "AVAILABLE":
        return "OK";
      case "NOT_AVAILABLE":
        return "MISSING";
      case "UNKNOWN":
        return "UNKNOWN";
      default:
        return s || "UNKNOWN";
    }
  }

  function healthBadgeClass(s: string): string {
    switch (s) {
      case "AVAILABLE":
        return "bg-emerald-500/10 text-emerald-600";
      case "NOT_AVAILABLE":
        return "bg-rose-500/10 text-rose-600";
      case "UNKNOWN":
        return "bg-amber-500/10 text-amber-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  async function fetchData() {
    loading = true;
    error = null;
    try {
      // Fetch status and viber info in parallel
      const [statusRes, vibersRes] = await Promise.all([
        fetch(`/api/vibers/${encodeURIComponent(viberId)}/status`),
        fetch("/api/vibers"),
      ]);

      if (!statusRes.ok) {
        const d = await statusRes.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${statusRes.status})`);
      }

      const statusData = await statusRes.json();
      status = statusData.status || null;

      if (vibersRes.ok) {
        const vibersData = await vibersRes.json();
        const vibers: ViberInfo[] = vibersData.vibers ?? [];
        const match = vibers.find(
          (v) => v.viber_id === viberId || v.id === viberId,
        );
        configSyncState = match?.config_sync_state;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load settings";
      status = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (viberId) {
      fetchData();
    }
  });
</script>

<div class="p-6 space-y-6">
  {#if loading}
    <div class="space-y-4">
      <Skeleton class="h-24 w-full rounded-lg" />
      <Skeleton class="h-32 w-full rounded-lg" />
      <Skeleton class="h-48 w-full rounded-lg" />
    </div>
  {:else if error}
    <div
      class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm"
    >
      {error}
    </div>
  {:else if !status}
    <div class="text-center py-16">
      <Server class="size-10 text-muted-foreground/50 mx-auto mb-3" />
      <p class="text-muted-foreground">
        No status data available. The viber may not have sent a heartbeat yet.
      </p>
    </div>
  {:else}
    <!-- Config Sync State -->
    {#if configSyncState || (status?.viber && !status.viber.connected)}
      <section>
        <h3
          class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"
        >
          <RefreshCw class="size-4" />
          Config Sync State
        </h3>

        {#if !status?.viber?.connected}
          <div
            class="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 mb-3"
          >
            <div class="flex items-center gap-2 text-sm text-amber-600">
              <X class="size-4" />
              <span class="font-medium">Viber is offline</span>
            </div>
            <p class="text-xs text-amber-600/80 mt-1">
              Config sync state may be stale. Last known state shown below.
            </p>
          </div>
        {/if}

        {#if configSyncState}
          {@const syncStatus = getConfigSyncStatus(configSyncState)}
          <div class="rounded-lg border border-border p-4 mb-3">
            <div class="flex items-center justify-between mb-3">
              <div class="text-xs font-medium text-foreground">Sync Status</div>
              <span
                class={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium ${syncStatus.badgeClass}`}
              >
                {syncStatus.label}
              </span>
            </div>

            {#if configSyncState.configVersion}
              <div class="text-[11px] text-muted-foreground mb-2">
                <div>
                  Version: <span class="font-mono"
                    >{configSyncState.configVersion}</span
                  >
                </div>
                {#if configSyncState.lastConfigPullAt}
                  <div class="mt-1">
                    Last verified: {formatTimeAgo(
                      configSyncState.lastConfigPullAt,
                    )}
                  </div>
                {/if}
              </div>
            {/if}

            {#if configSyncState.validations && configSyncState.validations.length > 0}
              <div class="mt-3 space-y-2">
                <div class="text-[11px] font-medium text-foreground">
                  Validations:
                </div>
                {#each configSyncState.validations as validation}
                  <div
                    class="flex items-start justify-between gap-2 text-[11px]"
                  >
                    <div class="flex-1">
                      <span class="font-medium">{validation.category}:</span>
                      <span
                        class={`ml-1 ${validation.status === "verified" ? "text-emerald-600" : validation.status === "failed" ? "text-rose-600" : "text-amber-600"}`}
                      >
                        {validation.status}
                      </span>
                      {#if validation.message}
                        <div class="text-muted-foreground mt-0.5">
                          {validation.message}
                        </div>
                      {/if}
                    </div>
                    {#if validation.checkedAt}
                      <div class="text-muted-foreground/60 text-[10px]">
                        {formatTimeAgo(validation.checkedAt)}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <div
            class="rounded-lg border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground"
          >
            No config sync state available
          </div>
        {/if}
      </section>
    {/if}

    <!-- Skill Health -->
    {#if status.viber?.skillHealth?.skills && status.viber.skillHealth.skills.length > 0}
      <section>
        <div class="rounded-lg border border-border p-4 mb-3">
          <div
            class="flex items-center gap-2 text-sm font-medium text-foreground mb-3"
          >
            <Puzzle class="size-4" />
            Skill Health
          </div>
          <div class="space-y-2">
            {#each status.viber.skillHealth.skills as skill}
              {@const missingChecks =
                skill.checks?.filter((c) => (c.required ?? true) && !c.ok) ||
                []}
              <div class="rounded-md border border-border bg-muted/20 p-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="text-xs font-medium text-foreground">
                    {skill.name || skill.id}
                  </div>
                  <span
                    class={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${healthBadgeClass(skill.status)}`}
                  >
                    {healthLabel(skill.status)}
                  </span>
                </div>
                {#if skill.status !== "AVAILABLE"}
                  <div class="mt-2 space-y-2">
                    <div class="space-y-1 text-[11px] text-muted-foreground">
                      {#if missingChecks.length === 0}
                        <div>{skill.summary}</div>
                      {:else}
                        {#each missingChecks as check}
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex-1">
                              <span class="font-medium">{check.label}:</span>
                              {check.hint || check.message || "missing"}
                            </div>
                            {#if check.actionType && !check.ok}
                              <div class="shrink-0">
                                {#if check.actionType === "oauth"}
                                  <button
                                    type="button"
                                    class="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                    onclick={() =>
                                      alert(`Connect ${skill.name} OAuth`)}
                                  >
                                    Connect
                                  </button>
                                {:else if check.actionType === "binary" || check.actionType === "auth_cli"}
                                  <button
                                    type="button"
                                    class="text-[10px] px-2 py-0.5 rounded bg-muted text-foreground hover:bg-muted/80 transition-colors"
                                    onclick={() => {
                                      if (check.hint) {
                                        const cmd =
                                          check.hint.match(
                                            /(?:Install with|Run `?): ?`?(.+)`?/,
                                          )?.[1] || check.hint;
                                        navigator.clipboard.writeText(cmd);
                                        alert(`Copied: ${cmd}`);
                                      }
                                    }}
                                  >
                                    Copy cmd
                                  </button>
                                {:else if check.actionType === "env"}
                                  <button
                                    type="button"
                                    class="text-[10px] px-2 py-0.5 rounded bg-muted text-foreground hover:bg-muted/80 transition-colors"
                                    onclick={() =>
                                      alert(
                                        `Add environment variable: ${check.label}`,
                                      )}
                                  >
                                    Add env var
                                  </button>
                                {/if}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          <div class="text-[11px] text-muted-foreground/60 text-right mt-2">
            Updated: {new Date(
              status.viber.skillHealth.generatedAt,
            ).toLocaleTimeString()}
          </div>
        </div>
      </section>
    {/if}

    <!-- Skills & Capabilities -->
    {#if status.viber}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#if status.viber.skills && status.viber.skills.length > 0}
          <div class="rounded-lg border border-border p-4">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground mb-2"
            >
              <Puzzle class="size-4" />
              Skills ({status.viber.skills.length})
            </div>
            <div class="flex flex-wrap gap-1">
              {#each status.viber.skills as skill}
                <span
                  class="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {skill}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if status.viber.capabilities && status.viber.capabilities.length > 0}
          <div class="rounded-lg border border-border p-4">
            <div
              class="flex items-center gap-2 text-sm font-medium text-foreground mb-2"
            >
              <Network class="size-4" />
              Capabilities ({status.viber.capabilities.length})
            </div>
            <div class="flex flex-wrap gap-1">
              {#each status.viber.capabilities as cap}
                <span
                  class="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {cap}
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Channel Configuration -->
    <ChannelConfigPanel {viberId} />
  {/if}
</div>
