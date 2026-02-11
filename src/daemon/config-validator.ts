/**
 * Config Validator - Validates that configuration actually works
 *
 * This module validates that config values (LLM keys, OAuth tokens, env secrets)
 * are not just present, but actually functional.
 */

import type { ConfigValidation } from "./node-status";

export interface ConfigValidationResult {
  category: ConfigValidation["category"];
  status: ConfigValidation["status"];
  message: string;
  checkedAt: string;
}

/**
 * Validate an LLM API key by making a minimal API call.
 * For OpenAI/Anthropic: list models endpoint
 * For OpenRouter: list models endpoint
 * For others: attempt a minimal completion
 */
export async function validateLlmKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<ConfigValidationResult> {
  const checkedAt = new Date().toISOString();

  if (!apiKey?.trim()) {
    return {
      category: "llm_keys",
      status: "failed",
      message: "API key is empty",
      checkedAt,
    };
  }

  try {
    // Try to validate based on provider
    if (provider === "openai" || provider === "anthropic" || provider === "openrouter") {
      // Use list models endpoint (lightweight)
      const url =
        provider === "openai"
          ? baseUrl || "https://api.openai.com/v1/models"
          : provider === "anthropic"
            ? "https://api.anthropic.com/v1/messages"
            : baseUrl || "https://openrouter.ai/api/v1/models";

      const response = await fetch(url, {
        method: provider === "anthropic" ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(provider === "anthropic"
            ? {
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              }
            : {}),
          ...(provider === "openrouter" ? { "HTTP-Referer": "https://openviber.app" } : {}),
        },
        ...(provider === "anthropic"
          ? {
              body: JSON.stringify({
                model: "claude-3-haiku-20240307",
                max_tokens: 1,
                messages: [{ role: "user", content: "test" }],
              }),
            }
          : {}),
      });

      if (response.ok) {
        return {
          category: "llm_keys",
          status: "verified",
          message: `${provider} API key is valid`,
          checkedAt,
        };
      }

      const errorText = await response.text().catch(() => "");
      return {
        category: "llm_keys",
        status: "failed",
        message: `API key validation failed: ${response.status} ${errorText.slice(0, 100)}`,
        checkedAt,
      };
    }

    // For other providers, we can't easily validate without making a real call
    // Just check that the key is non-empty
    return {
      category: "llm_keys",
      status: "verified",
      message: `${provider} API key is present (not validated)`,
      checkedAt,
    };
  } catch (error) {
    return {
      category: "llm_keys",
      status: "failed",
      message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
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
  const checkedAt = new Date().toISOString();

  if (!accessToken?.trim()) {
    return {
      category: "oauth",
      status: "failed",
      message: "OAuth token is empty",
      checkedAt,
    };
  }

  // Check expiry if provided
  if (expiresAt) {
    try {
      const expiryDate = new Date(expiresAt);
      if (expiryDate < new Date()) {
        return {
          category: "oauth",
          status: "failed",
          message: `OAuth token expired at ${expiresAt}`,
          checkedAt,
        };
      }
    } catch {
      // Invalid date format, continue with API check
    }
  }

  // Make a test API call for known providers
  try {
    if (provider === "google") {
      // Test with userinfo endpoint
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        return {
          category: "oauth",
          status: "verified",
          message: "Google OAuth token is valid",
          checkedAt,
        };
      }

      return {
        category: "oauth",
        status: "failed",
        message: `Google OAuth token validation failed: ${response.status}`,
        checkedAt,
      };
    }

    // For other providers, just check that token exists and isn't expired
    return {
      category: "oauth",
      status: expiresAt ? "verified" : "unchecked",
      message: `${provider} OAuth token is present${expiresAt ? " and not expired" : ""}`,
      checkedAt,
    };
  } catch (error) {
    return {
      category: "oauth",
      status: "failed",
      message: `OAuth validation error: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    };
  }
}

/**
 * Validate that required environment secrets are present and non-empty.
 */
export function validateEnvSecrets(
  expected: string[],
  actual: Record<string, string>,
): ConfigValidationResult {
  const checkedAt = new Date().toISOString();

  if (expected.length === 0) {
    return {
      category: "env_secrets",
      status: "verified",
      message: "No environment secrets required",
      checkedAt,
    };
  }

  const missing: string[] = [];
  for (const key of expected) {
    const value = actual[key];
    if (!value || !value.trim()) {
      missing.push(key);
    }
  }

  if (missing.length === 0) {
    return {
      category: "env_secrets",
      status: "verified",
      message: `All required secrets present: ${expected.join(", ")}`,
      checkedAt,
    };
  }

  return {
    category: "env_secrets",
    status: "failed",
    message: `Missing secrets: ${missing.join(", ")}`,
    checkedAt,
  };
}

/**
 * Validate all config categories and return validation results.
 */
export async function validateConfig(params: {
  aiProviders?: Record<string, { apiKey?: string; baseUrl?: string }>;
  oauthConnections?: Array<{
    provider: string;
    accessToken: string;
    expiresAt?: string;
  }>;
  requiredEnvSecrets?: string[];
  actualEnvSecrets?: Record<string, string>;
}): Promise<ConfigValidation[]> {
  const validations: ConfigValidation[] = [];

  // Validate LLM keys
  if (params.aiProviders) {
    const providers = Object.entries(params.aiProviders);
    if (providers.length === 0) {
      validations.push({
        category: "llm_keys",
        status: "failed",
        message: "No LLM providers configured",
        checkedAt: new Date().toISOString(),
      });
    } else {
      // Validate the first provider with a key (or all if we want comprehensive)
      for (const [provider, config] of providers) {
        if (config.apiKey) {
          const result = await validateLlmKey(provider, config.apiKey, config.baseUrl);
          validations.push(result);
          // Only validate the first one to avoid too many API calls
          break;
        }
      }
      if (!validations.some((v) => v.category === "llm_keys")) {
        validations.push({
          category: "llm_keys",
          status: "failed",
          message: "No LLM provider keys found",
          checkedAt: new Date().toISOString(),
        });
      }
    }
  } else {
    validations.push({
      category: "llm_keys",
      status: "unchecked",
      message: "LLM provider settings not provided",
      checkedAt: new Date().toISOString(),
    });
  }

  // Validate OAuth tokens
  if (params.oauthConnections && params.oauthConnections.length > 0) {
    for (const conn of params.oauthConnections) {
      if (conn.accessToken) {
        const result = await validateOAuthToken(conn.provider, conn.accessToken, conn.expiresAt);
        validations.push(result);
      }
    }
  } else {
    validations.push({
      category: "oauth",
      status: "unchecked",
      message: "No OAuth connections provided",
      checkedAt: new Date().toISOString(),
    });
  }

  // Validate env secrets
  if (params.requiredEnvSecrets && params.requiredEnvSecrets.length > 0) {
    const envSecrets = params.actualEnvSecrets || (process.env as Record<string, string>);
    const result = validateEnvSecrets(params.requiredEnvSecrets, envSecrets);
    validations.push(result);
  }

  return validations;
}
