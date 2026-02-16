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

/**
 * Registry metadata from _meta.json (ClawHub convention).
 * Tracks ownership, versioning, and publishing history.
 */
export interface SkillMeta {
  owner: string;
  slug: string;
  displayName: string;
  latest?: {
    version: string;
    publishedAt?: number;
    commit?: string;
  };
  history?: Array<{
    version: string;
    publishedAt?: number;
    commit?: string;
  }>;
}

export interface SkillMetadata {
  name: string;
  description: string;
  /** Optional playground scenario to verify the skill works. */
  playground?: SkillPlaygroundSpec;
  /** Skill setup requirements (OAuth, env vars, binaries) parsed from SKILL.md frontmatter */
  requires?: SkillRequirements;
  /** Optional license identifier */
  license?: string;
  /** Optional compatibility notes (environment requirements) */
  compatibility?: string;
  /** Optional allowed tools list */
  allowedTools?: string[];
  [key: string]: any;
}

/**
 * A Skill following the Agent Skills spec (agentskills.io).
 *
 * Skills are instruction packages — they tell the agent WHAT to do and HOW,
 * using its existing built-in tools (terminal, file ops, etc.).
 * Skills are NOT tools themselves.
 *
 * Standard structure:
 *   skill-name/
 *   ├── SKILL.md       # Required — frontmatter + markdown instructions
 *   ├── _meta.json     # Optional — registry metadata (owner, version, etc.)
 *   ├── scripts/       # Optional — executable scripts the agent runs via terminal
 *   └── references/    # Optional — reference docs loaded on demand
 */
export interface Skill {
  id: string;              // name from SKILL.md frontmatter (or directory name)
  metadata: SkillMetadata;
  instructions: string;    // Markdown body from SKILL.md
  dir: string;             // Absolute directory path
  meta?: SkillMeta;        // Parsed _meta.json (if present)
  hasScripts?: boolean;    // Whether scripts/ directory exists
  hasReferences?: boolean; // Whether references/ directory exists
}
