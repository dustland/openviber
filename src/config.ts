/**
 * Viber Configuration
 * 
 * Runtime configuration for the viber framework.
 * Applications should call configure() before using viber.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import os from 'os';
import path from 'path';

export interface ViberConfig {
  /** Root directory for file storage */
  storageRoot: string;

  /** Supabase client factory for database operations */
  createSupabaseClient?: () => SupabaseClient | null;

  /** Supabase service role client factory for admin operations */
  createServiceRoleClient?: () => SupabaseClient | null;

  /** Defaults directory path */
  defaultsPath?: string;
}

let config: ViberConfig | null = null;

/**
 * Configure viber with application-specific settings
 */
export function configure(newConfig: ViberConfig): void {
  config = newConfig;
}

/**
 * Get current viber configuration
 */
export function getConfig(): ViberConfig {
  if (!config) {
    // Default configuration - use ~/.viber for daemon mode
    return {
      storageRoot: path.join(os.homedir(), '.viber'),
      defaultsPath: './defaults',
    };
  }
  return config;
}

/**
 * Get viber storage root path
 */
export function getViberRoot(): string {
  return getConfig().storageRoot;
}

/**
 * Get path relative to viber root
 */
export function getViberPath(...segments: string[]): string {
  const root = getViberRoot();
  return [root, ...segments].join('/');
}

/**
 * ViberPaths - Path utilities
 */
export const ViberPaths = {
  getRoot: getViberRoot,
  getPath: getViberPath,
  getDefaultsPath: () => getConfig().defaultsPath || './defaults',
};

/**
 * Get Supabase client
 */
export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getConfig();
  if (cfg.createSupabaseClient) {
    return cfg.createSupabaseClient();
  }
  return null;
}

/**
 * Get Supabase service role client
 */
export function getSupabaseServiceRoleClient(): SupabaseClient | null {
  const cfg = getConfig();
  if (cfg.createServiceRoleClient) {
    return cfg.createServiceRoleClient();
  }
  return null;
}
