import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { Skill, SkillMeta } from "./types";
import type { SkillRequirements } from "./hub/types";
import { createLogger } from "../utils/logger";

const log = createLogger("SkillRegistry");

/**
 * SkillRegistry — discovery and loading of Agent Skills (SKILL.md + _meta.json).
 *
 * Following the Agent Skills spec (agentskills.io) and ClawHub convention:
 *   - Skills are instruction packages, NOT tool containers
 *   - Each skill dir has SKILL.md (required), _meta.json (optional),
 *     scripts/ (optional), references/ (optional)
 *   - Progressive disclosure: only name+description loaded at startup,
 *     full body loaded when the skill is activated
 *
 * Tools are managed separately by the ToolRegistry (src/tools/).
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor(private skillsRoot: string) { }

  /**
   * Scan for skills in the skills directory.
   * Only loads metadata (name + description) for each skill — the full
   * instructions are available on demand via getSkill().
   */
  async loadAll(): Promise<void> {
    try {
      const entries = await fs.readdir(this.skillsRoot, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      for (const dirName of dirs) {
        await this.loadSkill(dirName);
      }
    } catch (error) {
      log.warn("Failed to scan skills", {
        data: { skillsRoot: this.skillsRoot, error: String(error) },
      });
    }
  }

  /**
   * Load a specific skill by directory name.
   * Parses SKILL.md frontmatter + body, and _meta.json if present.
   */
  async loadSkill(dirName: string): Promise<Skill | undefined> {
    const skillDir = path.join(this.skillsRoot, dirName);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    try {
      // Check if SKILL.md exists — a directory without SKILL.md is not a skill
      try {
        await fs.access(skillMdPath);
      } catch {
        return undefined;
      }

      // Read SKILL.md
      const content = await fs.readFile(skillMdPath, "utf8");

      // Parse frontmatter (--- delimited YAML)
      const parts = content.split(/^---$/m);
      if (parts.length < 3) {
        log.warn("Invalid SKILL.md format", { data: { dirName } });
        return undefined;
      }

      const frontmatter = parts[1];
      const instructions = parts.slice(2).join("---").trim();

      const metadata = yaml.parse(frontmatter);
      const id = metadata.name || dirName;

      // Read _meta.json if present (ClawHub registry metadata)
      let meta: SkillMeta | undefined;
      const metaPath = path.join(skillDir, "_meta.json");
      try {
        const metaContent = await fs.readFile(metaPath, "utf8");
        meta = JSON.parse(metaContent) as SkillMeta;
      } catch {
        // _meta.json is optional
      }

      // Check for optional directories
      const hasScripts = await this.dirExists(path.join(skillDir, "scripts"));
      const hasReferences = await this.dirExists(path.join(skillDir, "references"));

      const skill: Skill = {
        id,
        metadata: {
          name: id,
          description: metadata.description || "",
          ...metadata
        },
        instructions,
        dir: skillDir,
        meta,
        hasScripts,
        hasReferences,
      };

      this.skills.set(id, skill);
      return skill;

    } catch (error) {
      log.error("Failed to load skill", {
        data: { dirName, error: String(error) },
      });
      return undefined;
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

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

import { getViberRoot } from "../utils/paths";
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
    log.info("Using skills path (user)", { data: { path: userSkillsPath } });
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
        log.info("Using skills path (bundled)", { data: { path: bundledPath } });
        return bundledPath;
      }
    } catch { /* continue */ }

    // Option 3: Development mode - src/skills in cwd
    const devPath = path.resolve(process.cwd(), "src/skills");
    try {
      fsSync.accessSync(devPath);
      log.info("Using skills path (dev)", { data: { path: devPath } });
      return devPath;
    } catch {
      // Fallback: just return user path (will be created on demand)
      log.info("Using skills path (default)", {
        data: { path: userSkillsPath },
      });
      return userSkillsPath;
    }
  }
}

export const defaultRegistry = new SkillRegistry(getDefaultSkillsPath());
