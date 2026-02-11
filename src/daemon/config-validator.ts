/**
 * Config Validator - Validates that node configuration actually works
 *
 * This module validates that configuration values (LLM keys, OAuth tokens, env secrets)
 * are not just present, but actually functional. This ensures the node can actually
 * use the configured services.
 */

import type { ConfigValidation } from "./node-status";

export interface ConfigValidationResult {
  category: ConfigValidation["category"];
  status: ConfigValidation["status"];
  message?: string;
  checkedAt: string;
}

/**
 * Validate an LLM API key by making a minimal API call.
 * For OpenRouter, we can list models. For others, we try a minimal completion.
 */
export async function validateLlmKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<ConfigValidationResult> {
  const now = new Date().toISOString();

  if (!apiKey || !apiKey.trim()) {
    return {
      category: "llm_keys",
      status: "failed",
      message: "API key is empty",
      checkedAt: now,
    };
  }

  try {
    // For OpenRouter, use the models endpoint
    if (provider === "openrouter" || baseUrl?.includes("openrouter")) {
      const url = baseUrl || "https://openrouter.ai/api/v1/models";
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/openviber/openviber",
          "X-Title": "OpenViber",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          category: "llm_keys",
          status: "failed",
          message: `HTTP ${response.status}: ${response.statusText}`,
          checkedAt: now,
        };
      }

      return {
        category: "llm_keys",
        status: "verified",
        message: "OpenRouter API key is valid",
        checkedAt: now,
      };
    }

    // For Anthropic, try a minimal completion
    if (provider === "anthropic") {
      const url = baseUrl || "https://api.anthropic.com/v1/messages";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          category: "llm_keys",
          status: "failed",
          message: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
          checkedAt: now,
        };
      }

      return {
        category: "llm_keys",
        status: "verified",
        message: "Anthropic API key is valid",
        checkedAt: now,
      };
    }

    // For OpenAI, try a minimal completion
    if (provider === "openai") {
      const url = baseUrl || "https://api.openai.com/v1/chat/completions";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          category: "llm_keys",
          status: "failed",
          message: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
          checkedAt: now,
        };
      }

      return {
        category: "llm_keys",
        status: "verified",
        message: "OpenAI API key is valid",
        checkedAt: now,
      };
    }

    // For other providers, we can't validate without more context
    return {
      category: "llm_keys",
      status: "unchecked",
      message: `Validation not implemented for provider: ${provider}`,
      checkedAt: now,
    };
  } catch (error) {
    return {
      category: "llm_keys",
      status: "failed",
      message: error instanceof Error ? error.message : "Validation failed",
      checkedAt: now,
    };
  }
}

/**
 * Validate an OAuth token by checking expiry and optionally making a test API call.
 */
export async function validateOAuthToken(
  provider: string,
  accessToken: string,
  expiresAt?: string,
): Promise<ConfigValidationResult> {
  const now = new Date().toISOString();

  if (!accessToken || !accessToken.trim()) {
    return {
      category: "oauth",
      status: "failed",
      message: "Access token is empty",
      checkedAt: now,
    };
  }

  // Check expiry if provided
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (expiry < new Date()) {
      return {
        category: "oauth",
        status: "failed",
        message: `Token expired at ${expiry.toISOString()}`,
        checkedAt: now,
      };
    }
  }

  // For Google OAuth, try to get user info
  if (provider === "google") {
    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          category: "oauth",
          status: "failed",
          message: `HTTP ${response.status}: Token validation failed`,
          checkedAt: now,
        };
      }

      return {
        category: "oauth",
        status: "verified",
        message: "Google OAuth token is valid",
        checkedAt: now,
      };
    } catch (error) {
      return {
        category: "oauth",
        status: "failed",
        message: error instanceof Error ? error.message : "Token validation failed",
        checkedAt: now,
      };
    }
  }

  // For other providers, we can't validate without more context
  return {
    category: "oauth",
    status: "unchecked",
    message: `Validation not implemented for provider: ${provider}`,
    checkedAt: now,
  };
}

/**
 * Validate that required environment secrets are present and non-empty.
 */
export function validateEnvSecrets(
  expected: string[],
  actual: Record<string, string>,
): ConfigValidationResult {
  const now = new Date().toISOString();

  const missing: string[] = [];
  for (const key of expected) {
    if (!actual[key] || !actual[key].trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return {
      category: "env_secrets",
      status: "failed",
      message: `Missing or empty: ${missing.join(", ")}`,
      checkedAt: now,
    };
  }

  return {
    category: "env_secrets",
    status: "verified",
    message: `All required secrets present: ${expected.join(", ")}`,
    checkedAt: now,
  };
}
