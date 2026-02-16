/**
 * Skills entry point.
 *
 * Re-exports the skill registry for discovering and loading
 * Agent Skills (SKILL.md + _meta.json).
 *
 * Tools are managed separately — see src/tools/skill-tools.ts
 */
export { defaultRegistry, SkillRegistry } from "./registry";
export type { Skill, SkillMetadata, SkillMeta } from "./types";
