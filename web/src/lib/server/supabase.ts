import { createClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/private";

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

/** Server-side Supabase client (service role). Use for upserts and operations that need correct conflict handling. */
export function getServerSupabase() {
  const { supabaseUrl, serviceRoleKey } = requireSupabaseServiceConfig();
  return createClient(supabaseUrl, serviceRoleKey);
}

export function requireSupabaseServiceConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase is not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required).",
    );
  }

  return {
    supabaseUrl: SUPABASE_URL,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function serviceRoleHeaders(extra: Record<string, string> = {}) {
  const { serviceRoleKey } = requireSupabaseServiceConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

export function restUrl(path: string, params?: Record<string, string | null | undefined>) {
  const { supabaseUrl } = requireSupabaseServiceConfig();
  const url = new URL(`/rest/v1/${path}`, supabaseUrl);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }
  }

  return url;
}

export function toInFilter(values: string[]) {
  return `in.(${values.map((value) => JSON.stringify(value)).join(",")})`;
}

export interface SupabaseRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  params?: Record<string, string | null | undefined>;
  body?: unknown;
  prefer?: string;
  headers?: Record<string, string>;
}

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export async function supabaseRequest<T>(
  path: string,
  options: SupabaseRequestOptions = {},
): Promise<T> {
  const url = restUrl(path, options.params);
  const method = options.method || "GET";

  const headers: Record<string, string> = serviceRoleHeaders(options.headers || {});

  if (options.prefer) {
    headers.Prefer = options.prefer;
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = JSON.stringify(options.body);
  }

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();

      // Retry on transient errors (502, 503, 504)
      if (TRANSIENT_STATUS_CODES.has(response.status) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `Supabase transient error (${response.status}) on ${method} ${path}, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = new Error(
          `Supabase request failed (${response.status}) ${method} ${path}: ${text}`,
        );
        continue;
      }

      throw new Error(`Supabase request failed (${response.status}) ${method} ${path}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  // Should not reach here, but just in case
  throw lastError || new Error(`Supabase request failed after ${MAX_RETRIES} retries`);
}
