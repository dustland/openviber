<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    ArrowUp,
    Check,
    ChevronDown,
    Cpu,
    Paperclip,
    Sparkles,
    X,
  } from "@lucide/svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";

  export interface ComposerViber {
    id: string;
    name: string;
    viber_id: string | null;
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
    /** Whether this skill is runnable on the viber */
    available?: boolean;
    /** Human-readable health summary (e.g. "Missing: gh CLI") */
    healthSummary?: string;
  }

  export interface ComposerImageAttachment {
    id: string;
    name: string;
    mediaType: string;
    dataUrl: string;
    size: number;
  }

  export const MODEL_OPTIONS = [
    { id: "", label: "Default", badge: "" },
    // Flagship
    {
      id: "anthropic/claude-opus-4.6",
      label: "Claude Opus 4.6",
      badge: "Flagship",
    },
    { id: "openai/gpt-5.2", label: "GPT-5.2", badge: "Flagship" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", badge: "Flagship" },
    // Fast
    {
      id: "anthropic/claude-sonnet-4",
      label: "Claude Sonnet 4",
      badge: "Fast",
    },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", badge: "Fast" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", badge: "Fast" },
    // Value
    { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", badge: "Value" },
    { id: "qwen/qwen3-max", label: "Qwen3 Max", badge: "Value" },
    // Reasoning
    { id: "deepseek/deepseek-r1", label: "DeepSeek R1", badge: "Reasoning" },
    { id: "openai/o3-pro", label: "o3 Pro", badge: "Reasoning" },
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
    skills?: ComposerSkill[];
    /** Bindable set of enabled skill IDs for this viber */
    selectedSkillIds?: string[];
    selectedModelId?: string;

    // -- Snippet props --
    /** Content rendered above the input card (e.g. skills chips, session indicator) */
    beforeInput?: Snippet;
    /** Content rendered on the left side inside the input card (e.g. settings gear) */
    leftAction?: Snippet;

    /** Bindable ref to the underlying textarea element (for focus management) */
    inputElement?: HTMLTextAreaElement | null;
    /** Bindable image attachments queued for sending */
    imageAttachments?: ComposerImageAttachment[];
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

    skills = [],
    selectedSkillIds = $bindable([]),
    selectedModelId = $bindable(""),

    beforeInput,
    leftAction,

    inputElement = $bindable(null),
    imageAttachments = $bindable([]),
  }: Props = $props();

  let fileInputElement = $state<HTMLInputElement | null>(null);

  // Derived
  const selectedModel = $derived(
    MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0],
  );
  const selectedSkillCount = $derived(
    selectedSkillIds.filter((id) => skills.some((s) => s.id === id)).length,
  );
  const canSend = $derived(
    (!!value.trim() || imageAttachments.length > 0) && !sending && !disabled,
  );

  function resizeTextarea() {
    if (!inputElement) return;
    inputElement.style.height = "auto";
    inputElement.style.height = `${Math.min(inputElement.scrollHeight, 144)}px`;
  }

  async function convertFileToAttachment(
    file: File,
  ): Promise<ComposerImageAttachment | null> {
    if (!file.type.startsWith("image/")) {
      return null;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(new Error("Failed to read selected image."));
      reader.readAsDataURL(file);
    });

    return {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name || "image",
      mediaType: file.type,
      dataUrl,
      size: file.size,
    };
  }

  async function appendFiles(files: FileList | File[]) {
    const candidates = Array.from(files);
    const converted = await Promise.all(
      candidates.map(convertFileToAttachment),
    );
    const next = converted.filter(
      (attachment): attachment is ComposerImageAttachment =>
        attachment !== null,
    );
    if (next.length > 0) {
      imageAttachments = [...imageAttachments, ...next];
    }
  }

  async function handleFileInputChange(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    await appendFiles(target.files);
    target.value = "";
  }

  async function handlePaste(event: ClipboardEvent) {
    const files = event.clipboardData?.files;
    if (!files || files.length === 0) return;
    const hasImage = Array.from(files).some((file) =>
      file.type.startsWith("image/"),
    );
    if (!hasImage) return;
    event.preventDefault();
    await appendFiles(files);
  }

  function removeAttachment(id: string) {
    imageAttachments = imageAttachments.filter(
      (attachment) => attachment.id !== id,
    );
  }

  $effect(() => {
    value;
    resizeTextarea();
  });

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
        oninput={resizeTextarea}
        onpaste={handlePaste}
        rows="1"
        {placeholder}
        class="min-h-[36px] max-h-36 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
        disabled={disabled || sending}
      ></textarea>
    </div>

    {#if imageAttachments.length > 0}
      <div class="flex flex-wrap gap-2 px-4 pb-2">
        {#each imageAttachments as attachment (attachment.id)}
          <div
            class="relative size-16 overflow-hidden rounded-md border border-border bg-muted/30"
          >
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              class="size-full object-cover"
              loading="lazy"
            />
            <button
              type="button"
              class="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
              onclick={() => removeAttachment(attachment.id)}
              aria-label={`Remove ${attachment.name}`}
            >
              <X class="size-3" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Toolbar row (inside card) -->
    <div class="flex items-center justify-between gap-2 px-3 pb-2.5 pt-0.5">
      <div class="flex items-center gap-0.5 min-w-0 overflow-x-auto">
        <input
          bind:this={fileInputElement}
          type="file"
          class="hidden"
          accept="image/*"
          multiple
          onchange={handleFileInputChange}
        />
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
          onclick={() => fileInputElement?.click()}
          disabled={disabled || sending}
          title="Upload images"
        >
          <Paperclip class="size-3.5" />
          <span>Attach</span>
        </button>

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
