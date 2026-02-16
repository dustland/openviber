/**
 * Skills Manager — handles skill-related API endpoints
 *
 * Provides REST API endpoints for:
 * - Listing all skills with health status
 * - Getting health details for a specific skill
 */

import type { IncomingMessage as Request, ServerResponse as Response } from "http";
import { getSkillHealthReport, type SkillHealthResult } from "../skills/health";
import { defaultRegistry } from "../skills/registry";

export class SkillsManager {
  /**
   * GET /api/skills - List all skills with health status
   */
  async handleListSkills(req: Request, res: Response): Promise<void> {
    try {
      // Ensure skills are loaded
      await defaultRegistry.loadAll();

      // Get health report for all skills
      const report = await getSkillHealthReport();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
    } catch (error: any) {
      console.error("[SkillsManager] Error listing skills:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error?.message || "Failed to list skills" }));
    }
  }

  /**
   * GET /api/skills/:id - Get details for a specific skill
   */
  async handleGetSkill(req: Request, res: Response, skillId: string): Promise<void> {
    try {
      // Load the skill
      await defaultRegistry.loadAll();
      const skill = defaultRegistry.getSkill(skillId);

      if (!skill) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Skill '${skillId}' not found` }));
        return;
      }

      // Get health details
      const { checkSkillHealth } = await import("../skills/health");
      const health = await checkSkillHealth({
        id: skill.id,
        name: skill.metadata.name || skill.id,
        description: skill.metadata.description,
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: skill.id,
          metadata: skill.metadata,
          health,
        })
      );
    } catch (error: any) {
      console.error(`[SkillsManager] Error getting skill '${skillId}':`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error?.message || "Failed to get skill" }));
    }
  }
}
