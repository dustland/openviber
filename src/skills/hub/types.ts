/**
 * External Skill Hub Types
 *
 * Types for exploring and importing skills from external sources:
 * - OpenClaw Skill Hub (community skill registry)
 * - GitHub repositories
 * - npm packages
 */

// ==================== Skill Requirements ====================

/** OAuth provider requirement (e.g. Google, Microsoft) */
export interface OAuthRequirement {
  /** Provider key (e.g. "google") */
  provider: string;
  /** Required OAuth scopes */
  scopes: string[];
}

/** Environment variable requirement */
export interface EnvRequirement {
  /** Env var name */
  name: string;
  /** Human-readable label */
  label?: string;
  /** Help text for how to get this value */
  hint?: string;
  /** Whether this requirement is optional */
  optional?: boolean;
}

/** Binary/CLI tool requirement */
export interface BinaryRequirement {
  /** Binary name (e.g. "gh", "node") */
  name: string;
  /** Install commands per platform */
  install?: Record<string, string>;
}

/** Combined requirements for a skill */
export interface SkillRequirements {
  oauth?: OAuthRequirement[];
  env?: EnvRequirement[];
  bins?: BinaryRequirement[];
}

// ==================== External Skill Info ====================

/** A skill listing from an external hub */
export interface ExternalSkillInfo {
  /** Unique identifier within the provider (e.g. "owner/skill-name") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description */
  description: string;
  /** Author / publisher */
  author: string;
  /** Version string (semver) */
  version: string;
  /** Source provider key */
  source: SkillHubProviderType;
  /** Download / clone URL */
  url: string;
  /** Tags / categories */
  tags: string[];
  /** Number of downloads or stars */
  popularity?: number;
  /** ISO date of last update */
  updatedAt?: string;
  /** README or long description (optional, fetched on detail view) */
  readme?: string;
  /** License */
  license?: string;
  /** Required tools / dependencies */
  dependencies?: string[];
  /** Skill setup requirements (OAuth, env vars, binaries) */
  requires?: SkillRequirements;
}

/** Search query for exploring skills */
export interface SkillSearchQuery {
  /** Free-text search term */
  query?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by author */
  author?: string;
  /** Sort order */
  sort?: "relevance" | "popularity" | "recent" | "name";
  /** Page number (1-based) */
  page?: number;
  /** Results per page */
  limit?: number;
}

/** Paginated search results */
export interface SkillSearchResult {
  skills: ExternalSkillInfo[];
  total: number;
  page: number;
  totalPages: number;
}

/** Result of importing a skill */
export interface SkillImportResult {
  ok: boolean;
  skillId: string;
  installPath: string;
  message: string;
  error?: string;
}

/** Provider-specific config overrides */
export interface SkillHubProviderConfig {
  /** Custom API/registry URL override */
  url?: string;
  /** API key / token */
  apiKey?: string;
}

/** Provider type identifier */
export type SkillHubProviderType =
  | "openclaw"
  | "github"
  | "npm"
  | "huggingface"
  | "smithery"
  | "composio"
  | "glama";

/**
 * Interface for skill hub providers.
 * Each provider implements this to enable search + import from their source.
 */
export interface SkillHubProvider {
  /** Provider type key */
  readonly type: SkillHubProviderType;
  /** Human-readable name */
  readonly displayName: string;
  /** Update provider config overrides at runtime */
  setConfig?(config?: SkillHubProviderConfig): void;
  /** Search for skills */
  search(query: SkillSearchQuery): Promise<SkillSearchResult>;
  /** Get detailed info about a specific skill */
  getSkillInfo(skillId: string): Promise<ExternalSkillInfo | null>;
  /** Import / install a skill to the local skills directory */
  importSkill(skillId: string, targetDir: string): Promise<SkillImportResult>;
}
