/**
 * ViberAgent Cache - Simple cache for ViberAgent instances
 *
 * Keeps ViberAgent instances alive for the entire application lifecycle
 * to avoid recreating agents and maintain space context.
 */

import { ViberAgent, ViberOptions } from "./viber-agent";

export class ViberAgentCache {
  private static instances = new Map<string, ViberAgent>();

  /**
   * Get or create a ViberAgent instance for a space
   */
  static async get(spaceId: string, options: ViberOptions): Promise<ViberAgent> {
    let viberAgent = this.instances.get(spaceId);

    if (!viberAgent) {
      // Try to resume existing space, or create new one
      try {
        viberAgent = await ViberAgent.resume(spaceId, options);
        console.log(`[ViberAgentCache] Resumed space: ${spaceId}`);
      } catch (error) {
        // Space doesn't exist, create new one
        const goal = options.defaultGoal || `Space ${spaceId}`;
        viberAgent = await ViberAgent.start(goal, {
          ...options,
          spaceId, // Ensure spaceId is set
        });
        console.log(`[ViberAgentCache] Created new space: ${spaceId}`);
      }

      this.instances.set(spaceId, viberAgent);
    } else {
      console.log(
        `[ViberAgentCache] Using cached ViberAgent for space: ${spaceId}`
      );
    }

    return viberAgent;
  }

  /**
   * Remove a ViberAgent instance from cache (optional cleanup)
   */
  static remove(spaceId: string): void {
    if (this.instances.delete(spaceId)) {
      console.log(`[ViberAgentCache] Removed space from cache: ${spaceId}`);
    }
  }

  /**
   * Clear all cached instances (for testing or reset)
   */
  static clear(): void {
    this.instances.clear();
    console.log("[ViberAgentCache] Cleared all cached instances");
  }

  /**
   * Get cache statistics
   */
  static getStats(): { size: number; spaceIds: string[] } {
    return {
      size: this.instances.size,
      spaceIds: Array.from(this.instances.keys()),
    };
  }
}
