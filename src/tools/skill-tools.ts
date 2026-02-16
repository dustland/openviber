/**
 * Skill-originated tool registration.
 *
 * These are CoreTool objects that live in src/tools/ as standalone modules.
 * The corresponding SKILL.md files (instructions) live in src/skills/<name>/
 * and tell the agent HOW to use these tools.
 *
 * Per the OpenClaw convention, skill directories contain only:
 *   SKILL.md, _meta.json, scripts/, references/
 * No TypeScript tool code lives in skill directories.
 */

import { defaultToolRegistry } from "./registry";
import { getTools as getCursorAgentTools } from "./cursor-agent";
import { getTools as getCodexCliTools } from "./codex-cli";
import { getTools as getGeminiCliTools } from "./gemini-cli";
import { getTools as getGithubTools } from "./github";
import { getTools as getTerminalTools } from "./terminal";
import { getTools as getRailwayTools } from "./railway";
import { getTools as getGmailTools } from "./gmail";
import { getTools as getSystemInfoTools } from "./system-info";

/**
 * Register all tools into the ToolRegistry.
 *
 * Called during daemon startup alongside other tool initialization.
 * Each namespace corresponds to a skill directory that also has a SKILL.md.
 */
export function registerSkillTools() {
  defaultToolRegistry.registerTools("cursor-agent", getCursorAgentTools());
  defaultToolRegistry.registerTools("codex-cli", getCodexCliTools());
  defaultToolRegistry.registerTools("gemini-cli", getGeminiCliTools());
  defaultToolRegistry.registerTools("github", getGithubTools());
  defaultToolRegistry.registerTools("terminal", getTerminalTools());
  defaultToolRegistry.registerTools("railway", getRailwayTools());
  defaultToolRegistry.registerTools("gmail", getGmailTools());
  defaultToolRegistry.registerTools("system-info", getSystemInfoTools());
}
