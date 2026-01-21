/**
 * XAgent Cache - Simple cache for XAgent instances
 *
 * Keeps XAgent instances alive for the entire application lifecycle
 * to avoid recreating agents and maintain space context.
 */

import { XAgent, XOptions } from "./xagent";

export class XAgentCache {
  private static instances = new Map<string, XAgent>();

  /**
   * Get or create an XAgent instance for a space
   */
  static async get(spaceId: string, options: XOptions): Promise<XAgent> {
    let xAgent = this.instances.get(spaceId);

    if (!xAgent) {
      // Try to resume existing space, or create new one
      try {
        xAgent = await XAgent.resume(spaceId, options);
        console.log(`[XAgentCache] Resumed space: ${spaceId}`);
      } catch (error) {
        // Space doesn't exist, create new one
        const goal = options.defaultGoal || `Space ${spaceId}`;
        xAgent = await XAgent.start(goal, {
          ...options,
          spaceId, // Ensure spaceId is set
        });
        console.log(`[XAgentCache] Created new space: ${spaceId}`);
      }

      this.instances.set(spaceId, xAgent);
    } else {
      console.log(
        `[XAgentCache] Using cached XAgent for space: ${spaceId}`
      );
    }

    return xAgent;
  }

  /**
   * Remove an XAgent instance from cache (optional cleanup)
   */
  static remove(spaceId: string): void {
    if (this.instances.delete(spaceId)) {
      console.log(`[XAgentCache] Removed space from cache: ${spaceId}`);
    }
  }

  /**
   * Clear all cached instances (for testing or reset)
   */
  static clear(): void {
    this.instances.clear();
    console.log("[XAgentCache] Cleared all cached instances");
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
