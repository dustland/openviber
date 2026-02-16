/**
 * Skill-originated tool registration.
 *
 * These are CoreTool objects that were historically bundled inside skill
 * directories (as index.ts exports). They are now registered here as
 * standalone tools, separate from the SkillRegistry which only manages
 * SKILL.md instruction packages.
 *
 * The SKILL.md files (instructions) still live in src/skills/<name>/
 * and tell the agent HOW to use these tools. But the tools themselves
 * are managed by the ToolRegistry.
 */

import { defaultToolRegistry } from "./registry";
import { getTools as getAntigravityTools } from "../skills/antigravity";
import { getTools as getCursorAgentTools } from "../skills/cursor-agent";
import { getTools as getCodexCliTools } from "../skills/codex-cli";
import { getTools as getGeminiCliTools } from "../skills/gemini-cli";
import { getTools as getGithubTools } from "../skills/github";
import { getTools as getTerminalTools } from "../skills/terminal";
import { getTools as getRailwayTools } from "../skills/railway";
import { getTools as getGmailTools } from "../skills/gmail";
import { getTools as getPlaygroundTools } from "../skills/playground";
import { getTools as getSystemInfoTools } from "../skills/system-info";

/**
 * Register all skill-originated tools into the ToolRegistry.
 *
 * Called during daemon startup alongside other tool initialization.
 * Each namespace corresponds to a skill directory that also has a SKILL.md.
 */
export function registerSkillTools() {
  defaultToolRegistry.registerTools("antigravity", getAntigravityTools());
  defaultToolRegistry.registerTools("cursor-agent", getCursorAgentTools());
  defaultToolRegistry.registerTools("codex-cli", getCodexCliTools());
  defaultToolRegistry.registerTools("gemini-cli", getGeminiCliTools());
  defaultToolRegistry.registerTools("github", getGithubTools());
  defaultToolRegistry.registerTools("terminal", getTerminalTools());
  defaultToolRegistry.registerTools("railway", getRailwayTools());
  defaultToolRegistry.registerTools("gmail", getGmailTools());
  defaultToolRegistry.registerTools("skill-playground", getPlaygroundTools());
  defaultToolRegistry.registerTools("system-info", getSystemInfoTools());
}
