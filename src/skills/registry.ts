import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { Skill, SkillModule } from "./types";
import { CoreTool } from "../core/tool";
import type { SkillRequirements } from "./hub/types";

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private loadedTools: Map<string, Record<string, CoreTool>> = new Map();

  constructor(private skillsRoot: string) { }

  /**
   * Scan for skills in the skills directory
   */
  async loadAll(): Promise<void> {
    try {
      const entries = await fs.readdir(this.skillsRoot, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const dirName of dirs) {
        await this.loadSkill(dirName);
      }
    } catch (error) {
      console.warn(`[SkillRegistry] Failed to scan skills at ${this.skillsRoot}:`, error);
    }
  }

  /**
   * Load a specific skill by directory name
   */
  async loadSkill(dirName: string): Promise<Skill | undefined> {
    const skillDir = path.join(this.skillsRoot, dirName);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    try {
      // Check if SKILL.md exists
      try {
        await fs.access(skillMdPath);
      } catch {
        return undefined; // Not a skill
      }

      // Read SKILL.md
      const content = await fs.readFile(skillMdPath, "utf8");

      // Parse frontmatter
      // Simple parse: split by ---
      const parts = content.split(/^---$/m);
      if (parts.length < 3) {
        console.warn(`[SkillRegistry] Invalid SKILL.md format in ${dirName}`);
        return undefined;
      }

      const frontmatter = parts[1];
      const instructions = parts.slice(2).join("---").trim();

      const metadata = yaml.parse(frontmatter);
      const id = metadata.name || dirName;

      const skill: Skill = {
        id,
        metadata: {
          name: id,
          description: metadata.description || "",
          ...metadata
        },
        instructions,
        dir: skillDir,
      };

      this.skills.set(id, skill);
      return skill;

    } catch (error) {
      console.error(`[SkillRegistry] Failed to load skill ${dirName}:`, error);
      return undefined;
    }
  }

  /**
   * Get tools for a specific skill (lazy load module)
   */
  async getTools(skillId: string, config?: any): Promise<Record<string, CoreTool>> {
    // Check pre-registered tools first (from preRegisterTools()) before requiring skill metadata
    if (this.loadedTools.has(skillId)) {
      return this.loadedTools.get(skillId)!;
    }

    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    // Import index.ts
    const idxPath = path.join(skill.dir, "index.ts"); // or .js
    try {
      // Dynamic import
      // Note: In strict ESM/TS environments we might need full path or file URL
      const modulePath = path.resolve(idxPath);
      const mod = await import(modulePath) as SkillModule;

      let tools: Record<string, CoreTool> = {};

      if (mod.getTools) {
        tools = await mod.getTools(config);
      } else if (mod.tools) {
        tools = mod.tools;
      }

      this.loadedTools.set(skillId, tools);
      return tools;
    } catch (error) {
      console.error(`[SkillRegistry] Failed to load tools for ${skillId}:`, error);
      return {};
    }
  }

  /**
   * Pre-register tools for a skill (used for bundled builds where dynamic import of .ts fails)
   */
  preRegisterTools(skillId: string, tools: Record<string, CoreTool>): void {
    this.loadedTools.set(skillId, tools);

    // Ensure pre-registered skills are visible via getAllSkills() even when
    // SKILL.md discovery is unavailable (e.g. bundled runtime without source files).
    if (!this.skills.has(skillId)) {
      this.skills.set(skillId, {
        id: skillId,
        metadata: {
          name: skillId,
          description: "",
        },
        instructions: "",
        dir: path.join(this.skillsRoot, skillId),
      });
    }
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get the requirements for a skill (from SKILL.md frontmatter).
   */
  getRequirements(skillId: string): SkillRequirements | undefined {
    const skill = this.skills.get(skillId);
    return skill?.metadata?.requires;
  }
}

import { getViberRoot } from "../config";
import { getModuleDirname } from "../utils/module-path";

const __dirname = getModuleDirname();

// Try multiple paths for skill discovery:
// 1. User's config directory (~/.openviber/skills) - User custom skills
// 2. Bundled skills (relative to this file in dist) - Package skills
// 3. Development mode: src/skills in cwd (only if running from source)
function getDefaultSkillsPath(): string {
  // Option 1: User's config directory (~/.openviber/skills)
  const userSkillsPath = path.join(getViberRoot(), "skills");
  try {
    fsSync.accessSync(userSkillsPath);
    console.log(`[SkillRegistry] Using skills path (user): ${userSkillsPath}`);
    return userSkillsPath;
  } catch {
    // Option 2: Bundled skills (relative to this file - works for dist/)
    const bundledPath = path.resolve(__dirname, ".");
    try {
      fsSync.accessSync(bundledPath);
      // Only use if it looks like a skills directory (not just dist/)
      const hasSkillDirs = fsSync.readdirSync(bundledPath).some(f => {
        const skillMd = path.join(bundledPath, f, "SKILL.md");
        try { fsSync.accessSync(skillMd); return true; } catch { return false; }
      });
      if (hasSkillDirs) {
        console.log(`[SkillRegistry] Using skills path (bundled): ${bundledPath}`);
        return bundledPath;
      }
    } catch { /* continue */ }

    // Option 3: Development mode - src/skills in cwd
    const devPath = path.resolve(process.cwd(), "src/skills");
    try {
      fsSync.accessSync(devPath);
      console.log(`[SkillRegistry] Using skills path (dev): ${devPath}`);
      return devPath;
    } catch {
      // Fallback: just return user path (will be created on demand)
      console.log(`[SkillRegistry] Using skills path (default): ${userSkillsPath}`);
      return userSkillsPath;
    }
  }
}

export const defaultRegistry = new SkillRegistry(getDefaultSkillsPath());
