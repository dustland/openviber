/**
 * Config Validator - Validates that configuration actually works
 *
 * This module validates that config values are not just present, but actually functional:
 * - LLM API keys: test with a minimal API call
 * - OAuth tokens: check expiry and optionally test API access
 * - Env secrets: verify presence and non-empty values
 */

import type { ConfigValidation } from "./node-status";

export interface ConfigValidationResult {
  category: ConfigValidation["category"];
  status: ConfigValidation["status"];
  message?: string;
}

/**
 * Validate an LLM API key by making a minimal API call.
 * @param provider - Provider name (e.g., "openai", "anthropic", "openrouter")
 * @param apiKey - API key to validate
 * @returns Validation result
 */
export async function validateLlmKey(
  provider: string,
  apiKey: string
): Promise<ConfigValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      category: "llm_keys",
      status: "failed",
      message: "API key is empty",
    };
  }

  try {
    // For OpenRouter, test with a simple models list call
    if (provider === "openrouter" || provider.toLowerCase().includes("openrouter")) {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/openviber/openviber",
          "X-Title": "OpenViber",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return {
          category: "llm_keys",
          status: "verified",
          message: "OpenRouter API key is valid",
        };
      } else {
        const errorText = await response.text().catch(() => "");
        return {
          category: "llm_keys",
          status: "failed",
          message: `OpenRouter API error: ${response.status} ${errorText.slice(0, 100)}`,
        };
      }
    }

    // For OpenAI, test with a simple completion call (using a minimal prompt)
    if (provider === "openai" || provider.toLowerCase().includes("openai")) {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return {
          category: "llm_keys",
          status: "verified",
          message: "OpenAI API key is valid",
        };
      } else {
        const errorText = await response.text().catch(() => "");
        return {
          category: "llm_keys",
          status: "failed",
          message: `OpenAI API error: ${response.status} ${errorText.slice(0, 100)}`,
        };
      }
    }

    // For Anthropic, test with a simple models call
    if (provider === "anthropic" || provider.toLowerCase().includes("anthropic")) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok || response.status === 200) {
        return {
          category: "llm_keys",
          status: "verified",
          message: "Anthropic API key is valid",
        };
      } else {
        const errorText = await response.text().catch(() => "");
        return {
          category: "llm_keys",
          status: "failed",
          message: `Anthropic API error: ${response.status} ${errorText.slice(0, 100)}`,
        };
      }
    }

    // For unknown providers, just check that key exists
    return {
      category: "llm_keys",
      status: "unchecked",
      message: `Provider ${provider} validation not implemented`,
    };
  } catch (error) {
    return {
      category: "llm_keys",
      status: "failed",
      message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate an OAuth token by checking expiry and optionally making a test API call.
 * @param provider - Provider name (e.g., "google", "github")
 * @param accessToken - OAuth access token
 * @param expiresAt - Optional ISO timestamp when token expires
 * @returns Validation result
 */
export async function validateOAuthToken(
  provider: string,
  accessToken: string,
  expiresAt?: string
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
    try {
      const expiryDate = new Date(expiresAt);
      if (expiryDate < new Date()) {
        return {
          category: "oauth",
          status: "failed",
          message: `Token expired at ${expiresAt}`,
        };
      }
    } catch {
      // Invalid date format, continue with API test
    }
  }

  try {
    // For Google, test with userinfo endpoint
    if (provider === "google" || provider.toLowerCase().includes("google")) {
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return {
          category: "oauth",
          status: "verified",
          message: "Google OAuth token is valid",
        };
      } else {
        return {
          category: "oauth",
          status: "failed",
          message: `Google OAuth error: ${response.status}`,
        };
      }
    }

    // For GitHub, test with user endpoint
    if (provider === "github" || provider.toLowerCase().includes("github")) {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "OpenViber",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return {
          category: "oauth",
          status: "verified",
          message: "GitHub OAuth token is valid",
        };
      } else {
        return {
          category: "oauth",
          status: "failed",
          message: `GitHub OAuth error: ${response.status}`,
        };
      }
    }

    // For unknown providers, just check that token exists
    return {
      category: "oauth",
      status: "unchecked",
      message: `Provider ${provider} validation not implemented`,
    };
  } catch (error) {
    return {
      category: "oauth",
      status: "failed",
      message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Validate that required environment secrets are present and non-empty.
 * @param expected - Array of environment variable names to check
 * @param actual - Record of actual environment variables
 * @returns Validation result
 */
export function validateEnvSecrets(
  expected: string[],
  actual: Record<string, string>
): ConfigValidationResult {
  if (expected.length === 0) {
    return {
      category: "env_secrets",
      status: "verified",
      message: "No environment secrets required",
    };
  }

  const missing: string[] = [];
  const empty: string[] = [];

  for (const key of expected) {
    const value = actual[key];
    if (!value) {
      missing.push(key);
    } else if (!value.trim()) {
      empty.push(key);
    }
  }

  if (missing.length > 0 || empty.length > 0) {
    const issues: string[] = [];
    if (missing.length > 0) {
      issues.push(`Missing: ${missing.join(", ")}`);
    }
    if (empty.length > 0) {
      issues.push(`Empty: ${empty.join(", ")}`);
    }
    return {
      category: "env_secrets",
      status: "failed",
      message: issues.join("; "),
    };
  }

  return {
    category: "env_secrets",
    status: "verified",
    message: `All ${expected.length} required secrets are present`,
  };
}

/**
 * Validate a full config object (from web API config pull).
 * @param config - Config object from web API
 * @returns Array of validation results
 */
export async function validateConfig(config: {
  aiProviders?: Record<string, { apiKey?: string; baseUrl?: string }>;
  oauthConnections?: Array<{
    provider: string;
    accessToken: string;
    expiresAt?: string;
  }>;
  environments?: Array<{
    variables?: { key: string; value: string }[];
  }>;
}): Promise<ConfigValidation[]> {
  const validations: ConfigValidation[] = [];
  const checkedAt = new Date().toISOString();

  // Validate LLM keys
  if (config.aiProviders) {
    const providers = Object.entries(config.aiProviders);
    if (providers.length > 0) {
      const llmResults = await Promise.all(
        providers.map(([provider, config]) =>
          validateLlmKey(provider, config.apiKey || "")
        )
      );

      // Aggregate LLM key validations
      const verified = llmResults.filter((r) => r.status === "verified").length;
      const failed = llmResults.filter((r) => r.status === "failed").length;
      const unchecked = llmResults.filter((r) => r.status === "unchecked").length;

      if (failed > 0) {
        const failedProviders = providers
          .filter((_, i) => llmResults[i].status === "failed")
          .map(([p]) => p);
        validations.push({
          category: "llm_keys",
          status: "failed",
          message: `Failed: ${failedProviders.join(", ")}`,
          checkedAt,
        });
      } else if (unchecked > 0) {
        validations.push({
          category: "llm_keys",
          status: "unchecked",
          message: `${unchecked} provider(s) not validated`,
          checkedAt,
        });
      } else {
        validations.push({
          category: "llm_keys",
          status: "verified",
          message: `All ${verified} LLM provider(s) verified`,
          checkedAt,
        });
      }
    } else {
      validations.push({
        category: "llm_keys",
        status: "unchecked",
        message: "No LLM providers configured",
        checkedAt,
      });
    }
  } else {
    validations.push({
      category: "llm_keys",
      status: "unchecked",
      message: "No LLM providers in config",
      checkedAt,
    });
  }

  // Validate OAuth tokens
  if (config.oauthConnections && config.oauthConnections.length > 0) {
    const oauthResults = await Promise.all(
      config.oauthConnections.map((conn) =>
        validateOAuthToken(conn.provider, conn.accessToken, conn.expiresAt)
      )
    );

    const verified = oauthResults.filter((r) => r.status === "verified").length;
    const failed = oauthResults.filter((r) => r.status === "failed").length;

    if (failed > 0) {
      const failedProviders = config.oauthConnections
        .filter((_, i) => oauthResults[i].status === "failed")
        .map((c) => c.provider);
      validations.push({
        category: "oauth",
        status: "failed",
        message: `Failed: ${failedProviders.join(", ")}`,
        checkedAt,
      });
    } else {
      validations.push({
        category: "oauth",
        status: "verified",
        message: `All ${verified} OAuth connection(s) verified`,
        checkedAt,
      });
    }
  } else {
    validations.push({
      category: "oauth",
      status: "unchecked",
      message: "No OAuth connections configured",
      checkedAt,
    });
  }

  // Validate env secrets (from environments)
  if (config.environments && config.environments.length > 0) {
    const allEnvVars = new Set<string>();
    for (const env of config.environments) {
      if (env.variables) {
        for (const v of env.variables) {
          allEnvVars.add(v.key);
        }
      }
    }

    if (allEnvVars.size > 0) {
      const envRecord: Record<string, string> = {};
      for (const env of config.environments) {
        if (env.variables) {
          for (const v of env.variables) {
            envRecord[v.key] = v.value;
          }
        }
      }

      const envResult = validateEnvSecrets(Array.from(allEnvVars), envRecord);
      validations.push({
        category: "env_secrets",
        status: envResult.status,
        message: envResult.message,
        checkedAt,
      });
    } else {
      validations.push({
        category: "env_secrets",
        status: "unchecked",
        message: "No environment variables configured",
        checkedAt,
      });
    }
  } else {
    validations.push({
      category: "env_secrets",
      status: "unchecked",
      message: "No environments configured",
      checkedAt,
    });
  }

  return validations;
}
