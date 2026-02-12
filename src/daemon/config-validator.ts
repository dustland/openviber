/**
 * Config Validator - Validates node configuration actually works
 *
 * The node is the authority on what works. This module validates that config
 * values (LLM keys, OAuth tokens, env secrets) are not just present, but actually functional.
 */

import type { ConfigValidation } from "./telemetry";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export interface ConfigValidationResult {
  category: ConfigValidation["category"];
  status: ConfigValidation["status"];
  message?: string;
}

/**
 * Validate an LLM API key by making a minimal API call.
 * Uses a lightweight models-list or single-token completion to verify the key works.
 */
export async function validateLlmKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<ConfigValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      category: "llm_keys",
      status: "failed",
      message: "API key is empty",
    };
  }

  try {
    // Create provider instance
    let providerInstance: any;
    switch (provider.toLowerCase()) {
      case "anthropic":
        providerInstance = createAnthropic({
          apiKey,
          baseURL: baseUrl,
        });
        break;
      case "openai":
        providerInstance = createOpenAI({
          apiKey,
          baseURL: baseUrl,
        });
        break;
      case "openrouter":
        providerInstance = createOpenRouter({
          apiKey,
          baseURL: baseUrl,
        });
        break;
      default:
        // For unknown providers, just check that key exists
        return {
          category: "llm_keys",
          status: "unchecked",
          message: `Provider '${provider}' validation not implemented`,
        };
    }

    // Make a minimal API call to verify the key works
    // For most providers, we can use a simple completion with minimal tokens
    // For OpenRouter, we can list models
    if (provider.toLowerCase() === "openrouter") {
      // OpenRouter: try to list models (lightweight)
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          category: "llm_keys",
          status: "failed",
          message: `API key validation failed: ${response.status} ${response.statusText}`,
        };
      }
    } else {
      // For Anthropic/OpenAI: try a minimal completion
      // Use the provider's generateText with a tiny prompt and maxTokens=1
      const result = await providerInstance.generateText({
        model: provider.toLowerCase() === "anthropic" ? "claude-3-haiku-20240307" : "gpt-3.5-turbo",
        prompt: "Hi",
        maxTokens: 1,
      });

      if (!result || !result.text) {
        return {
          category: "llm_keys",
          status: "failed",
          message: "API key validation failed: no response",
        };
      }
    }

    return {
      category: "llm_keys",
      status: "verified",
      message: `${provider} API key is valid`,
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    // Check for common error patterns
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      return {
        category: "llm_keys",
        status: "failed",
        message: "API key is invalid or unauthorized",
      };
    }
    if (errorMessage.includes("timeout")) {
      return {
        category: "llm_keys",
        status: "failed",
        message: "API key validation timed out",
      };
    }
    return {
      category: "llm_keys",
      status: "failed",
      message: `API key validation failed: ${errorMessage}`,
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
  if (!accessToken || !accessToken.trim()) {
    return {
      category: "oauth",
      status: "failed",
      message: "OAuth token is empty",
    };
  }

  // Check expiry if provided
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    if (expiryDate < new Date()) {
      return {
        category: "oauth",
        status: "failed",
        message: `OAuth token expired on ${expiryDate.toISOString()}`,
      };
    }
  }

  // Optionally make a test API call based on provider
  try {
    switch (provider.toLowerCase()) {
      case "google":
        // Test Google OAuth by calling userinfo endpoint
        const googleResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!googleResponse.ok) {
          return {
            category: "oauth",
            status: "failed",
            message: `Google OAuth validation failed: ${googleResponse.status}`,
          };
        }
        break;

      case "github":
        // Test GitHub OAuth by calling user endpoint
        const githubResponse = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!githubResponse.ok) {
          return {
            category: "oauth",
            status: "failed",
            message: `GitHub OAuth validation failed: ${githubResponse.status}`,
          };
        }
        break;

      default:
        // For other providers, just check that token exists and isn't expired
        return {
          category: "oauth",
          status: expiresAt ? "verified" : "unchecked",
          message: expiresAt
            ? `OAuth token valid until ${new Date(expiresAt).toISOString()}`
            : "OAuth token present (expiry not checked)",
        };
    }

    return {
      category: "oauth",
      status: "verified",
      message: `${provider} OAuth token is valid`,
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes("timeout")) {
      return {
        category: "oauth",
        status: "failed",
        message: "OAuth token validation timed out",
      };
    }
    return {
      category: "oauth",
      status: "failed",
      message: `OAuth token validation failed: ${errorMessage}`,
    };
  }
}

/**
 * Validate environment secrets are present and non-empty.
 */
export function validateEnvSecrets(
  expected: string[],
  actual: Record<string, string>,
): ConfigValidationResult {
  const missing: string[] = [];
  const empty: string[] = [];

  for (const key of expected) {
    const value = actual[key];
    if (value === undefined || value === null) {
      missing.push(key);
    } else if (typeof value === "string" && !value.trim()) {
      empty.push(key);
    }
  }

  if (missing.length > 0) {
    return {
      category: "env_secrets",
      status: "failed",
      message: `Missing environment variables: ${missing.join(", ")}`,
    };
  }

  if (empty.length > 0) {
    return {
      category: "env_secrets",
      status: "failed",
      message: `Empty environment variables: ${empty.join(", ")}`,
    };
  }

  return {
    category: "env_secrets",
    status: "verified",
    message: `All ${expected.length} environment variables are present`,
  };
}

/**
 * Validate all LLM provider keys from a config object.
 */
export async function validateAllLlmKeys(
  aiProviders: Record<string, { apiKey?: string; baseUrl?: string }>,
): Promise<ConfigValidationResult[]> {
  const results: ConfigValidationResult[] = [];

  for (const [provider, config] of Object.entries(aiProviders)) {
    if (config.apiKey) {
      const result = await validateLlmKey(provider, config.apiKey, config.baseUrl);
      results.push(result);
    }
  }

  return results;
}

/**
 * Validate all OAuth tokens from a config object.
 */
export async function validateAllOAuthTokens(
  oauthConnections: Array<{
    provider: string;
    accessToken: string;
    expiresAt?: string | null;
  }>,
): Promise<ConfigValidationResult[]> {
  const results: ConfigValidationResult[] = [];

  for (const conn of oauthConnections) {
    if (conn.accessToken) {
      const result = await validateOAuthToken(
        conn.provider,
        conn.accessToken,
        conn.expiresAt || undefined,
      );
      results.push(result);
    }
  }

  return results;
}
