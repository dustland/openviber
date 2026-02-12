<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    ArrowUp,
    Check,
    ChevronDown,
    Cpu,
    FolderGit2,
    Package,
    Laptop,
    Sparkles,
  } from "@lucide/svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

  export interface ComposerNode {
    id: string;
    name: string;
    node_id: string | null;
    status: "pending" | "active" | "offline";
  }

  export interface ComposerEnvironment {
    id: string;
    name: string;
  }

  export interface ComposerSkill {
    id: string;
    name: string;
    description: string;
    /** Whether this skill is runnable on the node */
    available?: boolean;
    /** Human-readable health summary (e.g. "Missing: gh CLI") */
    healthSummary?: string;
  }

  export const MODEL_OPTIONS = [
    { id: "", label: "Default", badge: "" },
    // Flagship
    {
      id: "anthropic/claude-opus-4.6",
      label: "Claude Opus 4.6",
      badge: "Flagship",
    },
    { id: "openai/gpt-5.3", label: "GPT-5.3", badge: "Flagship" },
    { id: "google/gemini-3.0-pro", label: "Gemini 3.0 Pro", badge: "Flagship" },
    // Fast
    {
      id: "anthropic/claude-sonnet-4.6",
      label: "Claude Sonnet 4.6",
      badge: "Fast",
    },
    { id: "google/gemini-3.0-flash", label: "Gemini 3.0 Flash", badge: "Fast" },
    { id: "openai/gpt-5.3-mini", label: "GPT-5.3 Mini", badge: "Fast" },
    // Value
    { id: "deepseek/deepseek-v3.2", label: "DeepSeek 3.2", badge: "Value" },
    { id: "zhipu/glm-4.7", label: "GLM-4.7", badge: "Value" },
    { id: "qwen/qwen-3.5-max", label: "Qwen 3.5 Max", badge: "Value" },
    // Reasoning
    { id: "deepseek/deepseek-r2", label: "DeepSeek R2", badge: "Reasoning" },
    { id: "openai/o4-pro", label: "o4 Pro", badge: "Reasoning" },
  ];

  interface Props {
    /** Bindable textarea value */
    value: string;
    /** Textarea placeholder */
    placeholder?: string;
    /** Whether the textarea is disabled */
    disabled?: boolean;
    /** Whether a submission is in progress */
    sending?: boolean;
    /** Error message shown above the input */
    error?: string | null;
    /** Called when user presses Enter or clicks send */
    onsubmit?: () => void;
    /** Called to dismiss error */
    ondismisserror?: () => void;
    /** Called when user requests setup for an unavailable skill */
    onsetupskill?: (skill: ComposerSkill) => void;

    // -- Selector data --
    nodes?: ComposerNode[];
    environments?: ComposerEnvironment[];
    skills?: ComposerSkill[];
    /** Bindable set of enabled skill IDs for this viber */
    selectedSkillIds?: string[];
    selectedNodeId?: string | null;
    selectedEnvironmentId?: string | null;
    selectedModelId?: string;

    // -- Snippet props --
    /** Content rendered above the input card (e.g. skills chips, session indicator) */
    beforeInput?: Snippet;
    /** Content rendered on the left side inside the input card (e.g. settings gear) */
    leftAction?: Snippet;

    /** Bindable ref to the underlying textarea element (for focus management) */
    inputElement?: HTMLTextAreaElement | null;
  }

  let {
    value = $bindable(""),
    placeholder = "",
    disabled = false,
    sending = false,
    error = $bindable(null),
    onsubmit,
    ondismisserror,
    onsetupskill,

    nodes = [],
    environments = [],
    skills = [],
    selectedSkillIds = $bindable([]),
    selectedNodeId = $bindable(null),
    selectedEnvironmentId = $bindable(null),
    selectedModelId = $bindable(""),

    beforeInput,
    leftAction,

    inputElement = $bindable(null),
  }: Props = $props();

  // Derived
  const selectedNode = $derived(
    nodes.find((n) => n.id === selectedNodeId) ?? null,
  );
  const selectedEnvironment = $derived(
    environments.find((e) => e.id === selectedEnvironmentId) ?? null,
  );
  const selectedModel = $derived(
    MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0],
  );
  const selectedSkillCount = $derived(
    selectedSkillIds.filter((id) => skills.some((s) => s.id === id)).length,
  );
  const hasNodeSelector = $derived(nodes.length > 0);
  const hasEnvSelector = $derived(environments.length > 0);
  const canSend = $derived(!!value.trim() && !sending && !disabled);

  function toggleSkill(skillId: string) {
    const skill = skills.find((s) => s.id === skillId);
    if (skill && skill.available === false) {
      if (selectedSkillIds.includes(skillId)) {
        selectedSkillIds = selectedSkillIds.filter((id) => id !== skillId);
        return;
      }
      onsetupskill?.(skill);
      return;
    }

    if (selectedSkillIds.includes(skillId)) {
      selectedSkillIds = selectedSkillIds.filter((id) => id !== skillId);
    } else {
      selectedSkillIds = [...selectedSkillIds, skillId];
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onsubmit?.();
    }
  }
</script>

<div class="w-full space-y-1.5">
  {#if error}
    <div
      class="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {error}
    </div>
  {/if}

  {#if beforeInput}
    {@render beforeInput()}
  {/if}

  <!-- Input card -->
  <div
    class="composer-card rounded-2xl border border-border bg-background/95 shadow-sm backdrop-blur transition-colors"
    class:opacity-60={!canSend && !value.trim()}
  >
    <!-- Textarea area -->
    <div class="flex items-start gap-2 px-4 pt-3 pb-1">
      {#if leftAction}
        <div class="pt-1.5">
          {@render leftAction()}
        </div>
      {/if}

      <textarea
        bind:this={inputElement}
        bind:value
        onkeydown={handleKeydown}
        rows="1"
        {placeholder}
        class="min-h-[36px] max-h-36 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
        disabled={disabled || sending}
      ></textarea>
    </div>

    <!-- Toolbar row (inside card) -->
    <div class="flex items-center justify-between gap-2 px-3 pb-2.5 pt-0.5">
      <div class="flex items-center gap-0.5 min-w-0 overflow-x-auto">
        <!-- Node selector -->
        {#if hasNodeSelector}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
            >
              {#if selectedNode}
                <span
                  class="size-1.5 shrink-0 rounded-full"
                  class:bg-emerald-500={selectedNode.status === "active"}
                  class:bg-amber-500={selectedNode.status === "pending"}
                  class:bg-zinc-400={selectedNode.status === "offline"}
                ></span>
                <span class="truncate max-w-[100px]">{selectedNode.name}</span>
              {:else}
                <Laptop class="size-3.5" />
                <span>Viber</span>
              {/if}
              <ChevronDown class="size-3 opacity-50" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-64">
              <DropdownMenu.Label>Select viber</DropdownMenu.Label>
              <DropdownMenu.Separator />
              {#if nodes.length === 0}
                <div
                  class="px-2 py-3 text-center text-xs text-muted-foreground"
                >
                  No vibers registered. Go to
                  <a href="/vibers" class="underline">Vibers</a> to add one.
                </div>
              {:else}
                {#each nodes as node (node.id)}
                  <DropdownMenu.Item
                    onclick={() => (selectedNodeId = node.id)}
                    class="flex items-center justify-between"
                    disabled={node.status !== "active"}
                  >
                    <span class="flex items-center gap-2">
                      <span
                        class="size-2 shrink-0 rounded-full"
                        class:bg-emerald-500={node.status === "active"}
                        class:bg-amber-500={node.status === "pending"}
                        class:bg-zinc-400={node.status === "offline"}
                      ></span>
                      {node.name}
                      {#if node.status !== "active"}
                        <span class="text-xs text-muted-foreground"
                          >({node.status})</span
                        >
                      {/if}
                    </span>
                    {#if selectedNodeId === node.id}
                      <Check class="size-3.5 text-primary" />
                    {/if}
                  </DropdownMenu.Item>
                {/each}
              {/if}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}

        <!-- Environment selector -->
        {#if hasEnvSelector}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
            >
              <FolderGit2 class="size-3.5" />
              {#if selectedEnvironment}
                <span class="truncate max-w-[100px]"
                  >{selectedEnvironment.name}</span
                >
              {:else}
                <span>Env</span>
              {/if}
              <ChevronDown class="size-3 opacity-50" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-56">
              <DropdownMenu.Label>Select environment</DropdownMenu.Label>
              <DropdownMenu.Separator />
              <DropdownMenu.Item
                onclick={() => (selectedEnvironmentId = null)}
                class="flex items-center justify-between"
              >
                <span class="flex items-center gap-2">
                  <Package class="size-4 opacity-60" />
                  All environments
                </span>
                {#if selectedEnvironmentId === null}
                  <Check class="size-3.5 text-primary" />
                {/if}
              </DropdownMenu.Item>
              {#each environments as env (env.id)}
                <DropdownMenu.Item
                  onclick={() => (selectedEnvironmentId = env.id)}
                  class="flex items-center justify-between"
                >
                  <span class="flex items-center gap-2">
                    <FolderGit2 class="size-4 opacity-60" />
                    {env.name}
                  </span>
                  {#if selectedEnvironmentId === env.id}
                    <Check class="size-3.5 text-primary" />
                  {/if}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}

        <!-- Separator between context selectors and model/skills -->
        {#if hasNodeSelector || hasEnvSelector}
          <div class="mx-0.5 h-4 w-px bg-border/60 shrink-0"></div>
        {/if}

        <!-- Model selector -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
          >
            <Cpu class="size-3.5" />
            <span class="truncate max-w-[120px]">{selectedModel.label}</span>
            <ChevronDown class="size-3 opacity-50" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64">
            <DropdownMenu.Label>Select model</DropdownMenu.Label>
            <DropdownMenu.Separator />
            {#each MODEL_OPTIONS as opt (opt.id)}
              <DropdownMenu.Item
                onclick={() => (selectedModelId = opt.id)}
                class="flex items-center justify-between"
              >
                <span class="flex items-center gap-2">
                  {opt.label}
                  {#if opt.badge}
                    <span
                      class="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {opt.badge}
                    </span>
                  {/if}
                </span>
                {#if selectedModelId === opt.id}
                  <Check class="size-3.5 text-primary" />
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        <!-- Skill selector (multi-toggle) -->
        {#if skills.length > 0}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
            >
              <Sparkles class="size-3.5" />
              <span>Skills</span>
              {#if selectedSkillCount > 0}
                <span
                  class="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  >{selectedSkillCount}</span
                >
              {:else}
                <span
                  class="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums"
                  >{skills.length}</span
                >
              {/if}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-72">
              <DropdownMenu.Label
                >Enable skills for this viber</DropdownMenu.Label
              >
              <DropdownMenu.Separator />
              {#each skills as skill (skill.id)}
                <DropdownMenu.CheckboxItem
                  checked={selectedSkillIds.includes(skill.id)}
                  onCheckedChange={() => toggleSkill(skill.id)}
                  class="flex items-center gap-2"
                >
                  <div class="min-w-0 flex-1">
                    <span
                      class="text-sm font-medium {skill.available === false
                        ? 'opacity-50'
                        : ''}">{skill.name}</span
                    >
                    {#if skill.available === false && skill.healthSummary}
                      <p class="text-[11px] text-destructive line-clamp-1">
                        {skill.healthSummary} (click to set up)
                      </p>
                    {:else if skill.description}
                      <p class="text-[11px] text-muted-foreground line-clamp-1">
                        {skill.description}
                      </p>
                    {/if}
                  </div>
                </DropdownMenu.CheckboxItem>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>

      <!-- Send button -->
      <button
        type="button"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
        onclick={() => onsubmit?.()}
        disabled={!canSend}
        title="Send"
      >
        <ArrowUp class="size-4" />
      </button>
    </div>
  </div>
</div>

<style>
  .composer-card:focus-within {
    border-color: hsl(var(--ring));
    box-shadow: 0 0 0 2px hsl(var(--ring) / 0.15);
  }
</style>
