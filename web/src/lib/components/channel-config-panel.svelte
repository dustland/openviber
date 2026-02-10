<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlertCircle,
    Check,
    Eye,
    EyeOff,
    Loader2,
    Save,
    Zap,
  } from "@lucide/svelte";

  interface Props {
    nodeId: string;
  }

  let { nodeId }: Props = $props();

  type DiscordState = {
    enabled: boolean;
    botToken: string;
    allowGuildIds: string;
    allowChannelIds: string;
    allowUserIds: string;
    requireMention: boolean;
    replyMode: "reply" | "channel";
  };

  type FeishuState = {
    enabled: boolean;
    appId: string;
    appSecret: string;
    verificationToken: string;
    encryptKey: string;
    domain: string;
    connectionMode: "websocket" | "webhook";
    webhookPath: string;
    allowGroupMessages: boolean;
    requireMention: boolean;
  };

  type DingTalkState = {
    enabled: boolean;
    appKey: string;
    appSecret: string;
    robotCode: string;
  };

  type WeComState = {
    enabled: boolean;
    corpId: string;
    agentId: string;
    secret: string;
    token: string;
    aesKey: string;
  };

  let baseConfig = $state<Record<string, any>>({});
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let revealSecrets = $state<Set<string>>(new Set());

  let discord = $state<DiscordState>({
    enabled: false,
    botToken: "",
    allowGuildIds: "",
    allowChannelIds: "",
    allowUserIds: "",
    requireMention: true,
    replyMode: "reply",
  });

  let feishu = $state<FeishuState>({
    enabled: false,
    appId: "",
    appSecret: "",
    verificationToken: "",
    encryptKey: "",
    domain: "feishu",
    connectionMode: "websocket",
    webhookPath: "/webhook/feishu",
    allowGroupMessages: false,
    requireMention: true,
  });

  let dingtalk = $state<DingTalkState>({
    enabled: false,
    appKey: "",
    appSecret: "",
    robotCode: "",
  });

  let wecom = $state<WeComState>({
    enabled: false,
    corpId: "",
    agentId: "",
    secret: "",
    token: "",
    aesKey: "",
  });

  function toggleReveal(key: string) {
    const next = new Set(revealSecrets);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    revealSecrets = next;
  }

  function normalizeList(value: string): string[] | undefined {
    const items = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }

  function listToString(value: unknown): string {
    if (!Array.isArray(value)) return "";
    return value.map((entry) => String(entry)).join(", ");
  }

  async function fetchConfig() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/config`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to load config");
      }
      baseConfig = payload.config || {};
      const channels = baseConfig.channels || {};

      const discordCfg = channels.discord || {};
      discord = {
        enabled: discordCfg.enabled ?? false,
        botToken: discordCfg.botToken || "",
        allowGuildIds: listToString(discordCfg.allowGuildIds),
        allowChannelIds: listToString(discordCfg.allowChannelIds),
        allowUserIds: listToString(discordCfg.allowUserIds),
        requireMention: discordCfg.requireMention ?? true,
        replyMode: discordCfg.replyMode === "channel" ? "channel" : "reply",
      };

      const feishuCfg = channels.feishu || {};
      feishu = {
        enabled: feishuCfg.enabled ?? false,
        appId: feishuCfg.appId || "",
        appSecret: feishuCfg.appSecret || "",
        verificationToken: feishuCfg.verificationToken || "",
        encryptKey: feishuCfg.encryptKey || "",
        domain: feishuCfg.domain || "feishu",
        connectionMode:
          feishuCfg.connectionMode === "webhook" ? "webhook" : "websocket",
        webhookPath: feishuCfg.webhookPath || "/webhook/feishu",
        allowGroupMessages: feishuCfg.allowGroupMessages ?? false,
        requireMention: feishuCfg.requireMention ?? true,
      };

      const dingtalkCfg = channels.dingtalk || {};
      dingtalk = {
        enabled: dingtalkCfg.enabled ?? false,
        appKey: dingtalkCfg.appKey || "",
        appSecret: dingtalkCfg.appSecret || "",
        robotCode: dingtalkCfg.robotCode || "",
      };

      const wecomCfg = channels.wecom || {};
      wecom = {
        enabled: wecomCfg.enabled ?? false,
        corpId: wecomCfg.corpId || "",
        agentId: wecomCfg.agentId || "",
        secret: wecomCfg.secret || "",
        token: wecomCfg.token || "",
        aesKey: wecomCfg.aesKey || "",
      };
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load config";
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    saving = true;
    error = null;
    successMessage = null;
    try {
      const channels = {
        ...(baseConfig.channels || {}),
        discord: {
          enabled: discord.enabled,
          botToken: discord.botToken || undefined,
          allowGuildIds: normalizeList(discord.allowGuildIds),
          allowChannelIds: normalizeList(discord.allowChannelIds),
          allowUserIds: normalizeList(discord.allowUserIds),
          requireMention: discord.requireMention,
          replyMode: discord.replyMode,
        },
        feishu: {
          enabled: feishu.enabled,
          appId: feishu.appId || undefined,
          appSecret: feishu.appSecret || undefined,
          verificationToken: feishu.verificationToken || undefined,
          encryptKey: feishu.encryptKey || undefined,
          domain: feishu.domain || undefined,
          connectionMode: feishu.connectionMode,
          webhookPath: feishu.webhookPath || undefined,
          allowGroupMessages: feishu.allowGroupMessages,
          requireMention: feishu.requireMention,
        },
        dingtalk: {
          enabled: dingtalk.enabled,
          appKey: dingtalk.appKey || undefined,
          appSecret: dingtalk.appSecret || undefined,
          robotCode: dingtalk.robotCode || undefined,
        },
        wecom: {
          enabled: wecom.enabled,
          corpId: wecom.corpId || undefined,
          agentId: wecom.agentId || undefined,
          secret: wecom.secret || undefined,
          token: wecom.token || undefined,
          aesKey: wecom.aesKey || undefined,
        },
      };

      const nextConfig = { ...baseConfig, channels };

      const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to save config");
      }
      baseConfig = payload.config || nextConfig;
      successMessage = "Channel settings saved";
      setTimeout(() => {
        successMessage = null;
      }, 3000);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to save config";
    } finally {
      saving = false;
    }
  }

  onMount(() => {
    fetchConfig();
  });
</script>

<section class="mt-6">
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <Zap class="size-4 text-muted-foreground" />
      <div>
        <h3 class="text-sm font-semibold text-foreground">Channel Integrations</h3>
        <p class="text-xs text-muted-foreground">
          Configure Discord, Feishu, and enterprise channels for this node.
        </p>
      </div>
    </div>
    <button
      type="button"
      onclick={saveConfig}
      disabled={saving}
      class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
    >
      {#if saving}
        <Loader2 class="size-3.5 animate-spin" />
        Saving...
      {:else}
        <Save class="size-3.5" />
        Save
      {/if}
    </button>
  </div>

  {#if error}
    <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 mb-4 flex items-center gap-2">
      <AlertCircle class="size-4 text-destructive" />
      <p class="text-xs text-destructive">{error}</p>
    </div>
  {/if}

  {#if successMessage}
    <div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 mb-4 flex items-center gap-2">
      <Check class="size-4 text-emerald-600" />
      <p class="text-xs text-emerald-600">{successMessage}</p>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 class="size-4 animate-spin" />
      Loading channel config...
    </div>
  {:else}
    <div class="space-y-4">
      <!-- Discord -->
      <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-semibold">Discord</h4>
            <p class="text-[11px] text-muted-foreground">
              Bot token + optional allowlists (guilds/channels/users).
            </p>
          </div>
          <label class="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={discord.enabled} />
            Enabled
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="discord-bot-token" class="text-[11px] text-muted-foreground">Bot Token</label>
            <div class="relative">
              <input
                id="discord-bot-token"
                type={revealSecrets.has("discord-token") ? "text" : "password"}
                bind:value={discord.botToken}
                class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                placeholder="Discord bot token"
              />
              <button
                type="button"
                onclick={() => toggleReveal("discord-token")}
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {#if revealSecrets.has("discord-token")}
                  <EyeOff class="size-3.5" />
                {:else}
                  <Eye class="size-3.5" />
                {/if}
              </button>
            </div>
          </div>
          <div>
            <label for="discord-allow-guild-ids" class="text-[11px] text-muted-foreground">Allow Guild IDs</label>
            <input
              id="discord-allow-guild-ids"
              type="text"
              bind:value={discord.allowGuildIds}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="123, 456"
            />
          </div>
          <div>
            <label for="discord-allow-channel-ids" class="text-[11px] text-muted-foreground">Allow Channel IDs</label>
            <input
              id="discord-allow-channel-ids"
              type="text"
              bind:value={discord.allowChannelIds}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="123, 456"
            />
          </div>
          <div>
            <label for="discord-allow-user-ids" class="text-[11px] text-muted-foreground">Allow User IDs</label>
            <input
              id="discord-allow-user-ids"
              type="text"
              bind:value={discord.allowUserIds}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="123, 456"
            />
          </div>
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2 text-[11px]">
              <input type="checkbox" bind:checked={discord.requireMention} />
              Require mention in guilds
            </label>
          </div>
          <div>
            <label for="discord-reply-mode" class="text-[11px] text-muted-foreground">Reply Mode</label>
            <select
              id="discord-reply-mode"
              bind:value={discord.replyMode}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
            >
              <option value="reply">Reply</option>
              <option value="channel">Channel</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Feishu -->
      <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-semibold">Feishu / Lark</h4>
            <p class="text-[11px] text-muted-foreground">
              App credentials for Feishu/Lark bots.
            </p>
          </div>
          <label class="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={feishu.enabled} />
            Enabled
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="feishu-app-id" class="text-[11px] text-muted-foreground">App ID</label>
            <input
              id="feishu-app-id"
              type="text"
              bind:value={feishu.appId}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="cli_xxx"
            />
          </div>
          <div>
            <label for="feishu-app-secret" class="text-[11px] text-muted-foreground">App Secret</label>
            <div class="relative">
              <input
                id="feishu-app-secret"
                type={revealSecrets.has("feishu-secret") ? "text" : "password"}
                bind:value={feishu.appSecret}
                class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
                placeholder="app secret"
              />
              <button
                type="button"
                onclick={() => toggleReveal("feishu-secret")}
                class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {#if revealSecrets.has("feishu-secret")}
                  <EyeOff class="size-3.5" />
                {:else}
                  <Eye class="size-3.5" />
                {/if}
              </button>
            </div>
          </div>
          <div>
            <label for="feishu-domain" class="text-[11px] text-muted-foreground">Domain</label>
            <input
              id="feishu-domain"
              type="text"
              bind:value={feishu.domain}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="feishu | lark | https://"
            />
          </div>
          <div>
            <label for="feishu-connection-mode" class="text-[11px] text-muted-foreground">Connection Mode</label>
            <select
              id="feishu-connection-mode"
              bind:value={feishu.connectionMode}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
            >
              <option value="websocket">WebSocket</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
          <div>
            <label for="feishu-webhook-path" class="text-[11px] text-muted-foreground">Webhook Path</label>
            <input
              id="feishu-webhook-path"
              type="text"
              bind:value={feishu.webhookPath}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="/webhook/feishu"
            />
          </div>
          <div>
            <label for="feishu-verification-token" class="text-[11px] text-muted-foreground">Verification Token</label>
            <input
              id="feishu-verification-token"
              type="text"
              bind:value={feishu.verificationToken}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="optional"
            />
          </div>
          <div>
            <label for="feishu-encrypt-key" class="text-[11px] text-muted-foreground">Encrypt Key</label>
            <input
              id="feishu-encrypt-key"
              type="text"
              bind:value={feishu.encryptKey}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="optional"
            />
          </div>
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2 text-[11px]">
              <input type="checkbox" bind:checked={feishu.allowGroupMessages} />
              Allow group messages
            </label>
          </div>
          <div class="flex items-center gap-3">
            <label class="inline-flex items-center gap-2 text-[11px]">
              <input type="checkbox" bind:checked={feishu.requireMention} />
              Require mention in groups
            </label>
          </div>
        </div>
      </div>

      <!-- DingTalk -->
      <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-semibold">DingTalk</h4>
            <p class="text-[11px] text-muted-foreground">
              Enterprise bot credentials for DingTalk.
            </p>
          </div>
          <label class="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={dingtalk.enabled} />
            Enabled
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="dingtalk-app-key" class="text-[11px] text-muted-foreground">App Key</label>
            <input
              id="dingtalk-app-key"
              type="text"
              bind:value={dingtalk.appKey}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="app key"
            />
          </div>
          <div>
            <label for="dingtalk-app-secret" class="text-[11px] text-muted-foreground">App Secret</label>
            <input
              id="dingtalk-app-secret"
              type="text"
              bind:value={dingtalk.appSecret}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="app secret"
            />
          </div>
          <div>
            <label for="dingtalk-robot-code" class="text-[11px] text-muted-foreground">Robot Code</label>
            <input
              id="dingtalk-robot-code"
              type="text"
              bind:value={dingtalk.robotCode}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="optional"
            />
          </div>
        </div>
      </div>

      <!-- WeCom -->
      <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-semibold">WeCom</h4>
            <p class="text-[11px] text-muted-foreground">
              WeChat Work enterprise bot credentials.
            </p>
          </div>
          <label class="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" bind:checked={wecom.enabled} />
            Enabled
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="wecom-corp-id" class="text-[11px] text-muted-foreground">Corp ID</label>
            <input
              id="wecom-corp-id"
              type="text"
              bind:value={wecom.corpId}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="corp id"
            />
          </div>
          <div>
            <label for="wecom-agent-id" class="text-[11px] text-muted-foreground">Agent ID</label>
            <input
              id="wecom-agent-id"
              type="text"
              bind:value={wecom.agentId}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="agent id"
            />
          </div>
          <div>
            <label for="wecom-agent-secret" class="text-[11px] text-muted-foreground">Agent Secret</label>
            <input
              id="wecom-agent-secret"
              type="text"
              bind:value={wecom.secret}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="secret"
            />
          </div>
          <div>
            <label for="wecom-token" class="text-[11px] text-muted-foreground">Token</label>
            <input
              id="wecom-token"
              type="text"
              bind:value={wecom.token}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="verification token"
            />
          </div>
          <div>
            <label for="wecom-aes-key" class="text-[11px] text-muted-foreground">AES Key</label>
            <input
              id="wecom-aes-key"
              type="text"
              bind:value={wecom.aesKey}
              class="mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs"
              placeholder="encoding aes key"
            />
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>
