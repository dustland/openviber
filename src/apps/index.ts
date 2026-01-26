/**
 * App Registry - Discovers and loads app-level modules
 * 
 * Apps are self-contained modules in src/apps/ that extend Viber functionality.
 * Each app must export an `activate()` function.
 */

import { EventEmitter } from "events";

export interface AppModule {
  name: string;
  description?: string;
  activate: (context: AppContext) => Promise<AppInstance>;
}

export interface AppContext {
  events: EventEmitter;
  config?: Record<string, any>;
}

export interface AppInstance {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getStatus?: () => any;
}

// Registry of available apps
const appRegistry: Map<string, () => Promise<AppModule>> = new Map();

/**
 * Register an app by name with a lazy loader
 */
export function registerApp(name: string, loader: () => Promise<AppModule>): void {
  appRegistry.set(name, loader);
}

/**
 * Get list of registered app names
 */
export function getAvailableApps(): string[] {
  return Array.from(appRegistry.keys());
}

/**
 * Load an app by name
 */
export async function loadApp(name: string): Promise<AppModule | null> {
  const loader = appRegistry.get(name);
  if (!loader) return null;
  return loader();
}

/**
 * Load all available apps
 */
export async function loadAllApps(): Promise<Map<string, AppModule>> {
  const apps = new Map<string, AppModule>();
  for (const [name, loader] of appRegistry) {
    try {
      const app = await loader();
      apps.set(name, app);
    } catch (error) {
      console.warn(`[Apps] Failed to load app '${name}':`, error);
    }
  }
  return apps;
}

// Register built-in apps
registerApp("antigravity-healing", async () => {
  const { AntigravityMonitor } = await import("./antigravity-healing");
  return {
    name: "antigravity-healing",
    description: "Auto-heals Antigravity windows by detecting errors and clicking Retry",
    activate: async (ctx: AppContext) => {
      const monitor = new AntigravityMonitor({
        cdpPort: 9333,
        onStatus: (status) => ctx.events.emit("app:status", {
          app: "antigravity-healing",
          status,
        }),
      });
      return {
        start: () => monitor.start(),
        stop: () => monitor.stop(),
        getStatus: () => ({
          ...monitor.getStatus(),
          windows: monitor.getWindowStatuses(),
        }),
      };
    },
  };
});
