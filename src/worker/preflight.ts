/**
 * Provider-Model Preflight Validation
 *
 * Validates that a provider + model combination will work before
 * making expensive API calls. Fails fast with clear, actionable errors.
 *
 * @module worker/preflight
 */

import { isProviderConfigured, parseModelString } from "./provider";

/** Known provider → API key env var mapping */
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Known provider → models-list endpoint for lightweight validation */
const PROVIDER_MODELS_URL: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
};

export interface PreflightResult {
  ok: boolean;
  provider: string;
  model: string;
  errors: string[];
  warnings: string[];
}

/**
 * Run preflight validation on a provider + model.
 *
 * Checks run in order of cost:
 *  1. Is the provider known/supported?
 *  2. Is the API key present in env?
 *  3. (Optional) Does the model ID exist at the provider?
 *
 * @param provider  — e.g. "openrouter", "anthropic", "openai"
 * @param model     — e.g. "deepseek/deepseek-chat", "claude-3.5-sonnet"
 * @param apiKey    — explicit API key (overrides env var)
 * @param options   — `skipModelCheck` to skip the network call
 */
export async function preflightValidate(
  provider: string,
  model: string,
  apiKey?: string,
  options?: { skipModelCheck?: boolean },
): Promise<PreflightResult> {
  const result: PreflightResult = {
    ok: true,
    provider,
    model,
    errors: [],
    warnings: [],
  };

  // ─── 1. Check provider is configured ──────────────────────────────
  const envVar = PROVIDER_KEY_ENV[provider];
  const resolvedKey = apiKey || (envVar ? process.env[envVar] : undefined);

  if (!resolvedKey && provider !== "deepseek") {
    // DeepSeek uses the deepseek SDK which handles its own auth
    const envHint = envVar ? ` Set ${envVar} in your environment or config.` : "";
    result.ok = false;
    result.errors.push(
      `No API key found for provider "${provider}".${envHint}`,
    );
    return result; // Can't do further checks without a key
  }

  if (!isProviderConfigured(provider) && !apiKey) {
    // Provider check also failed — surface a warning even if key exists
    result.warnings.push(
      `Provider "${provider}" may not be fully configured.`,
    );
  }

  // ─── 2. Validate model string format ──────────────────────────────
  if (!model || model.trim() === "") {
    result.ok = false;
    result.errors.push("Model name is empty. Specify a model in your viber config.");
    return result;
  }

  // ─── 3. Optional: Validate model exists at provider ───────────────
  if (!options?.skipModelCheck && resolvedKey) {
    const modelsUrl = PROVIDER_MODELS_URL[provider];
    if (modelsUrl) {
      try {
        const response = await fetch(modelsUrl, {
          headers: { Authorization: `Bearer ${resolvedKey}` },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            result.ok = false;
            result.errors.push(
              `API key for "${provider}" is invalid or expired (${response.status}). ` +
              `Check your ${envVar || "API key"} configuration.`,
            );
          } else {
            result.warnings.push(
              `Could not verify model availability (HTTP ${response.status}). ` +
              `Proceeding anyway — the model may still work.`,
            );
          }
        } else {
          // Check if model ID is in the response
          const data = await response.json();
          const models: string[] = extractModelIds(data);
          if (models.length > 0 && !models.includes(model)) {
            // For OpenRouter, model IDs are like "deepseek/deepseek-chat"
            // Don't hard-fail — the list may be paginated or filtered
            result.warnings.push(
              `Model "${model}" was not found in ${provider}'s model list. ` +
              `It may still work if it's a recently added or aliased model.`,
            );
          }
        }
      } catch (error: any) {
        if (error?.name === "TimeoutError" || error?.message?.includes("timeout")) {
          result.warnings.push(
            `Model validation timed out for ${provider}. Proceeding without verification.`,
          );
        } else {
          result.warnings.push(
            `Could not verify model: ${error?.message || String(error)}. Proceeding anyway.`,
          );
        }
      }
    }
  }

  return result;
}

/**
 * Extract model IDs from a provider's models-list response.
 * Handles both OpenAI-style and OpenRouter-style responses.
 */
function extractModelIds(data: any): string[] {
  // OpenAI format: { data: [{ id: "gpt-4o" }, ...] }
  // OpenRouter format: { data: [{ id: "openai/gpt-4o" }, ...] }
  if (data?.data && Array.isArray(data.data)) {
    return data.data
      .filter((m: any) => m?.id)
      .map((m: any) => m.id as string);
  }
  return [];
}

/**
 * Format preflight errors into a single actionable error message.
 */
export function formatPreflightError(result: PreflightResult): string {
  const lines: string[] = [];
  lines.push(`⚠️ Provider/model preflight failed for ${result.provider}/${result.model}:`);
  for (const err of result.errors) {
    lines.push(`  ✗ ${err}`);
  }
  for (const warn of result.warnings) {
    lines.push(`  ⚡ ${warn}`);
  }
  return lines.join("\n");
}
