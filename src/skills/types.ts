import { CoreTool } from "../viber/tool";
import type { SkillRequirements } from "./hub/types";

/**
 * Playground definition for verifying a skill in a known scenario.
 */
export interface SkillPlaygroundSpec {
  /** Public GitHub repository in owner/name format. */
  repo: string;
  /** File path to review within the repo. Must be relative. */
  file: string;
  /** Optional branch to use when cloning/updating. */
  branch?: string;
  /** Optional shallow clone depth (defaults to 1). */
  cloneDepth?: number;
  /** Optional prompt template for verification runs. */
  prompt?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  /** Optional playground scenario to verify the skill works. */
  playground?: SkillPlaygroundSpec;
  /** Skill setup requirements (OAuth, env vars, binaries) parsed from SKILL.md frontmatter */
  requires?: SkillRequirements;
  [key: string]: any;
}

export interface Skill {
  id: string; // Directory name or name from SKILL.md
  metadata: SkillMetadata;
  instructions: string; // Markdown content from SKILL.md
  dir: string; // Directory path
}

export interface SkillModule {
  getTools?: (config?: any) => Promise<Record<string, CoreTool>> | Record<string, CoreTool>;
  tools?: Record<string, CoreTool>;
}
