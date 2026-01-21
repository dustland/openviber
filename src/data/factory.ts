/**
 * DataAdapterFactory - Creates appropriate data adapter based on configuration
 * Internal to Viber - external code should use ViberDataManager
 */

import type { DataAdapter } from "./adapter";
import { LocalDataAdapter } from "./adapters/local";
// SupabaseDatabaseAdapter is NOT imported here - it's imported dynamically in getServerDataAdapter()
// to avoid bundling server code (next/headers) in client bundle

export type DataMode = "local" | "database" | "auto";

export class DataAdapterFactory {
  private static instance: DataAdapter | null = null;

  /**
   * Create or get singleton data adapter instance
   */
  static create(mode?: DataMode): DataAdapter {
    if (this.instance) {
      return this.instance;
    }

    const dataMode = mode || this.detectMode();

    if (dataMode === "database") {
      // For client-side database mode, we should ideally not be creating an adapter here
      // but rather using server actions. However, for legacy compatibility or
      // if this is called on the server, we might need to handle it.
      if (typeof window !== "undefined") {
        throw new Error(
          "Client-side direct database access is not supported. Use server actions."
        );
      }
      console.log("[ViberDataAdapter] Using database mode (API-based)");
      // We can't synchronously return SupabaseDatabaseAdapter here because of dynamic import requirements for server-only code.
      // This method is synchronous. If we are on the server, we should use getServerDataAdapter instead.
      // For now, we'll throw an error to enforce using the async/server-specific path.
      throw new Error(
        "Synchronous creation of database adapter is not supported. Use getServerDataAdapter()."
      );
    } else {
      console.log("[ViberDataAdapter] Using local mode (file-based)");
      this.instance = new LocalDataAdapter();
    }

    return this.instance;
  }

  /**
   * Auto-detect which mode to use based on environment
   */
  private static detectMode(): DataMode {
    // Check explicit environment variable
    const explicitMode = process.env.VIBEX_DATA_MODE as DataMode | undefined;
    if (explicitMode === "local" || explicitMode === "database") {
      return explicitMode;
    }

    // Auto-detect: use local mode only if explicitly running in local development
    // without Supabase configuration (for offline/CLI use cases)
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      // Only use local mode if we're clearly in a local-only environment
      if (process.env.NODE_ENV === "development" && !process.env.VERCEL) {
        console.warn(
          "[ViberDataAdapter] No Supabase config found, falling back to local mode"
        );
        return "local";
      }
    }

    // Default to database mode for cloud/multi-user SaaS deployment
    return "database";
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Get current mode
   */
  static getCurrentMode(): DataMode {
    return this.detectMode();
  }
}

/**
 * Get data adapter for client-side and general use
 * Internal to Viber - use ViberDataManager instead
 */
export function getDataAdapter(): DataAdapter {
  return DataAdapterFactory.create();
}

/**
 * Get data adapter for server-side API routes
 * Uses direct Supabase access in database mode (not API calls)
 *
 * NOTE: This function uses server-only imports and should only be called
 * from server-side code (API routes, server components, server actions).
 */
export function getServerDataAdapter(): DataAdapter {
  // Check we're on the server
  if (typeof window !== "undefined") {
    throw new Error("getServerDataAdapter() can only be called on the server");
  }

  const mode = DataAdapterFactory.getCurrentMode();

  if (mode === "database") {
    // Dynamic require to avoid bundling server code in client bundle
    // Use server-only version that doesn't import next/headers at module level
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SupabaseDatabaseAdapter } = require("./adapters/supabase-server");
    // API routes use direct Supabase access to avoid circular dependencies
    console.log(
      "[ViberDataAdapter] Server: Using Supabase database mode (direct access)"
    );
    return new SupabaseDatabaseAdapter();
  } else {
    // Local mode uses file system
    console.log("[ViberDataAdapter] Server: Using local mode (file-based)");
    return new LocalDataAdapter();
  }
}
