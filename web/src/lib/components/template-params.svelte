<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import type { TemplateParam } from "$lib/data/template-utils";

  interface Props {
    params: TemplateParam[];
    values: Record<string, string>;
    onChange: (id: string, value: string) => void;
    title?: string;
    class?: string;
  }

  let {
    params,
    values,
    onChange,
    title,
    class: className = "",
  }: Props = $props();
</script>

{#if params.length > 0}
  <div class={`space-y-3 ${className}`}>
    {#if title}
      <h3
        class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {title}
      </h3>
    {/if}

    {#each params as param}
      {@const inputId = `template-param-${param.id}`}
      <div class="space-y-1.5">
        <Label for={inputId}>
          {param.label}
          {#if param.required}
            <span class="text-destructive"> *</span>
          {/if}
        </Label>
        {#if param.type === "select"}
          <Select
            id={inputId}
            value={values[param.id] ?? ""}
            on:change={(e) =>
              onChange(
                param.id,
                (e.currentTarget as HTMLSelectElement).value,
              )}
          >
            {#each param.options ?? [] as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </Select>
        {:else}
          <Input
            id={inputId}
            value={values[param.id] ?? ""}
            placeholder={param.placeholder}
            on:input={(e) =>
              onChange(
                param.id,
                (e.currentTarget as HTMLInputElement).value,
              )}
          />
        {/if}
        {#if param.description}
          <p class="text-[11px] text-muted-foreground">
            {param.description}
          </p>
        {/if}
      </div>
    {/each}
  </div>
{/if}
