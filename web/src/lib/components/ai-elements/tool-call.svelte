<script lang="ts">
  /**
   * ToolCall — collapsible tool invocation display with status badges, JSON I/O,
   * and extracted context (file paths, URLs) for right-pane display.
   * Port of vercel/ai-elements tool.tsx → Svelte 5, enhanced with context extraction.
   */
  import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
  } from "$lib/components/ui/collapsible";
  import {
    Wrench,
    ChevronDown,
    CheckCircle,
    Circle,
    Clock,
    XCircle,
    FileText,
    ExternalLink,
    FolderOpen,
  } from "@lucide/svelte";

  interface ContextItem {
    type: "file" | "url" | "directory";
    value: string;
    label: string;
  }

  interface Props {
    toolName: string;
    toolState:
      | "approval-requested"
      | "approval-responded"
      | "input-available"
      | "input-streaming"
      | "output-available"
      | "output-denied"
      | "output-error"
      | string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    class?: string;
    /** Callback when a context item is clicked (for right-pane display) */
    oncontextclick?: (item: ContextItem) => void;
  }

  let {
    toolName,
    toolState,
    input,
    output,
    errorText,
    class: className = "",
    oncontextclick,
  }: Props = $props();

  let isOpen = $state(false);

  const statusLabels: Record<string, string> = {
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "input-available": "Running",
    "input-streaming": "Pending",
    "output-available": "Completed",
    "output-denied": "Denied",
    "output-error": "Error",
  };

  const statusColors: Record<string, string> = {
    "approval-requested": "text-yellow-600",
    "approval-responded": "text-blue-600",
    "input-available": "text-amber-500 animate-pulse",
    "input-streaming": "text-muted-foreground",
    "output-available": "text-green-600",
    "output-denied": "text-orange-600",
    "output-error": "text-red-600",
  };

  function formatJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Extract essential context items (file paths, URLs, directories) from tool I/O.
   * Scans string values in the object for recognizable patterns.
   */
  function extractContext(data: unknown): ContextItem[] {
    const items: ContextItem[] = [];
    const seen = new Set<string>();

    function scan(obj: unknown) {
      if (typeof obj === "string") {
        // File paths (absolute)
        const fileMatches = obj.match(/(?:\/[\w.\-]+)+\.[\w]+/g);
        if (fileMatches) {
          for (const m of fileMatches) {
            if (!seen.has(m)) {
              seen.add(m);
              const basename = m.split("/").pop() || m;
              items.push({
                type: "file",
                value: m,
                label: basename,
              });
            }
          }
        }
        // URLs
        const urlMatches = obj.match(/https?:\/\/[^\s"',)}\]]+/g);
        if (urlMatches) {
          for (const m of urlMatches) {
            if (!seen.has(m)) {
              seen.add(m);
              try {
                const u = new URL(m);
                items.push({
                  type: "url",
                  value: m,
                  label: u.hostname + u.pathname,
                });
              } catch {
                items.push({ type: "url", value: m, label: m });
              }
            }
          }
        }
        // Directory paths (no extension, ends in /)
        const dirMatches = obj.match(/(?:\/[\w.\-]+){2,}\//g);
        if (dirMatches) {
          for (const m of dirMatches) {
            if (!seen.has(m)) {
              seen.add(m);
              items.push({
                type: "directory",
                value: m,
                label: m.split("/").filter(Boolean).pop() || m,
              });
            }
          }
        }
      } else if (Array.isArray(obj)) {
        for (const item of obj) scan(item);
      } else if (obj && typeof obj === "object") {
        for (const val of Object.values(obj)) scan(val);
      }
    }

    scan(data);
    return items.slice(0, 8); // Cap at 8 items
  }

  const contextItems = $derived(
    toolState === "output-available" || toolState === "result"
      ? extractContext(output)
      : extractContext(input),
  );
</script>

<Collapsible
  bind:open={isOpen}
  class="group not-prose mb-3 w-full rounded-lg border border-border/60 bg-card/50 {className}"
>
  <CollapsibleTrigger
    class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
  >
    <div class="flex items-center gap-2 min-w-0">
      <Wrench class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="font-medium text-sm truncate">{toolName}</span>
      <span
        class="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium"
      >
        {#if toolState === "output-available"}
          <CheckCircle class="size-3 {statusColors[toolState]}" />
        {:else if toolState === "output-error" || toolState === "output-denied"}
          <XCircle class="size-3 {statusColors[toolState]}" />
        {:else if toolState === "input-available" || toolState === "approval-requested"}
          <Clock class="size-3 {statusColors[toolState]}" />
        {:else}
          <Circle class="size-3 {statusColors[toolState]}" />
        {/if}
        {statusLabels[toolState] || toolState}
      </span>
    </div>
    <ChevronDown
      class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 {isOpen
        ? 'rotate-180'
        : ''}"
    />
  </CollapsibleTrigger>

  <!-- Context items — always visible below trigger when present -->
  {#if contextItems.length > 0}
    <div
      class="flex flex-wrap items-center gap-1.5 px-3 pb-2 border-b border-border/20"
    >
      {#each contextItems as item}
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors max-w-[200px]"
          onclick={() => oncontextclick?.(item)}
          title={item.value}
        >
          {#if item.type === "file"}
            <FileText class="size-3 shrink-0" />
          {:else if item.type === "url"}
            <ExternalLink class="size-3 shrink-0" />
          {:else}
            <FolderOpen class="size-3 shrink-0" />
          {/if}
          <span class="truncate">{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}

  <CollapsibleContent class="border-t border-border/40">
    <div class="space-y-3 p-3">
      {#if input !== undefined}
        <div class="space-y-1.5">
          <h4
            class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Parameters
          </h4>
          <pre
            class="overflow-x-auto rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed max-h-40 overflow-y-auto">{formatJson(
              input,
            )}</pre>
        </div>
      {/if}

      {#if output !== undefined || errorText}
        <div class="space-y-1.5">
          <h4
            class="text-[10px] font-semibold uppercase tracking-wider {errorText
              ? 'text-red-500'
              : 'text-muted-foreground'}"
          >
            {errorText ? "Error" : "Result"}
          </h4>
          {#if errorText}
            <div class="rounded-md bg-red-500/10 p-2.5 text-xs text-red-400">
              {errorText}
            </div>
          {:else}
            <pre
              class="overflow-x-auto rounded-md bg-muted/50 p-2.5 text-xs leading-relaxed max-h-60 overflow-y-auto">{formatJson(
                output,
              )}</pre>
          {/if}
        </div>
      {/if}
    </div>
  </CollapsibleContent>
</Collapsible>
