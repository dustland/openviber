/**
 * Skill Hub — Explore & Import skills from external sources
 *
 * Supports:
 *   - OpenClaw Skill Hub (community registry)
 *   - GitHub repositories (tagged with openviber-skill topic)
 *   - npm packages (with openviber-skill keyword)
 *   - Hugging Face (models/spaces tagged openviber-skill)
 *   - Smithery (MCP server registry)
 *   - Composio (tool/integration platform)
 *   - Glama (MCP server directory)
 */

export {
  SkillHubManager,
  getSkillHubManager,
  getDefaultSourcesConfig,
  type SkillSourceSettings,
  type SkillSourcesConfig,
} from "./manager";
export {
  OpenClawProvider,
  GitHubProvider,
  NpmProvider,
  HuggingFaceProvider,
  SmitheryProvider,
  ComposioProvider,
  GlamaProvider,
} from "./providers";
export type {
  ExternalSkillInfo,
  SkillSearchQuery,
  SkillSearchResult,
  SkillImportResult,
  SkillHubProvider,
  SkillHubProviderType,
} from "./types";
