/**
 * Viber Data Management
 *
 * This is the unified data access layer for all Viber entities.
 * External code should use ViberDataManager, not the internal adapters.
 */

export { getViberDataManager, getViberDataManagerServer } from "./manager";
export type { ViberDataManager } from "./manager";

// Export factory functions for server usage (API routes)
export { getDataAdapter, getServerDataAdapter } from "./factory";
export * from "./types";
