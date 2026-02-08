/**
 * Skill Hub — Explore & Import skills from external sources
 *
 * Supports:
 *   - OpenClaw Skill Hub (community registry)
 *   - GitHub repositories (tagged with openviber-skill topic)
 *   - npm packages (with openviber-skill keyword)
 */

export { SkillHubManager, getSkillHubManager } from "./manager";
export { OpenClawProvider, GitHubProvider, NpmProvider } from "./providers";
export type {
  ExternalSkillInfo,
  SkillSearchQuery,
  SkillSearchResult,
  SkillImportResult,
  SkillHubProvider,
  SkillHubProviderType,
} from "./types";
