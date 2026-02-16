/**
 * E2E verification: skills are discovered and tools are loaded correctly
 * after the migration from src/skills/<name>/index.ts to src/tools/<name>.ts
 *
 * Run: pnpm test src/tools/verify-migration.test.ts
 */
import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./registry";
import { SkillRegistry } from "../skills/registry";
import path from "path";

// Tool getTools imports (these are now in src/tools/)
import { getTools as getAntigravityTools } from "./antigravity";
import { getTools as getCursorAgentTools } from "./cursor-agent";
import { getTools as getCodexCliTools } from "./codex-cli";
import { getTools as getGeminiCliTools } from "./gemini-cli";
import { getTools as getGithubTools } from "./github";
import { getTools as getTerminalTools } from "./terminal";
import { getTools as getRailwayTools } from "./railway";
import { getTools as getGmailTools } from "./gmail";
import { getTools as getSystemInfoTools } from "./system-info";

const SKILLS_DIR = path.resolve(__dirname, "../skills");

describe("Post-migration verification", () => {
  it("registers all expected tools in the ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.registerTools("antigravity", getAntigravityTools());
    registry.registerTools("cursor-agent", getCursorAgentTools());
    registry.registerTools("codex-cli", getCodexCliTools());
    registry.registerTools("gemini-cli", getGeminiCliTools());
    registry.registerTools("github", getGithubTools());
    registry.registerTools("terminal", getTerminalTools());
    registry.registerTools("railway", getRailwayTools());
    registry.registerTools("gmail", getGmailTools());
    registry.registerTools("system-info", getSystemInfoTools());

    const allTools = registry.getAllTools();
    const toolNames = Object.keys(allTools);

    console.log(`Total tools registered: ${toolNames.length}`);
    console.log(`Tools: ${toolNames.join(", ")}`);

    // Verify key tools exist
    expect(toolNames).toContain("antigravity_check_and_heal");
    expect(toolNames).toContain("cursor_agent_run");
    expect(toolNames).toContain("codex_run");
    expect(toolNames).toContain("gemini_run");
    expect(toolNames).toContain("gh_list_issues");
    expect(toolNames).toContain("terminal_run");
    expect(toolNames).toContain("railway_status");
    expect(toolNames).toContain("gmail_search");
    expect(toolNames).toContain("system_info");
    expect(toolNames.length).toBeGreaterThanOrEqual(30);
  });

  it("discovers all skills with SKILL.md instructions", async () => {
    const registry = new SkillRegistry(SKILLS_DIR);
    await registry.loadAll();
    const skills = registry.getAllSkills();

    console.log(`\nTotal skills discovered: ${skills.length}`);
    for (const s of skills) {
      console.log(
        `  [${s.id}] instructions: ${s.instructions ? "✅" : "❌"}  meta: ${s.meta ? "✅" : "❌"}`
      );
    }

    // Verify key skills are discovered
    const skillIds = skills.map((s) => s.id);
    expect(skillIds).toContain("terminal");
    expect(skillIds).toContain("github");
    expect(skillIds).toContain("gemini-cli");
    expect(skillIds).toContain("codex-cli");
    expect(skillIds).toContain("cursor-agent");

    // Verify all skills have instructions (from SKILL.md)
    for (const skill of skills) {
      expect(skill.instructions, `skill '${skill.id}' should have instructions`).toBeTruthy();
    }
  });

  it("skill directories have NO index.ts files (spec compliance)", async () => {
    const fs = await import("fs");
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const skillDirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "hub" && e.name !== "_test"
    );

    for (const dir of skillDirs) {
      const indexPath = path.join(SKILLS_DIR, dir.name, "index.ts");
      expect(
        fs.existsSync(indexPath),
        `❌ ${dir.name}/index.ts should NOT exist in skill dir (tool code should be in src/tools/)`
      ).toBe(false);
    }

    console.log(`\nVerified ${skillDirs.length} skill directories have no index.ts`);
  });

  it("each skill has SKILL.md and _meta.json", async () => {
    const fs = await import("fs");
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    const skillDirs = entries.filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith(".") &&
        e.name !== "hub" &&
        e.name !== "_test" &&
        e.name !== "playground"
    );

    for (const dir of skillDirs) {
      const skillMd = path.join(SKILLS_DIR, dir.name, "SKILL.md");
      const metaJson = path.join(SKILLS_DIR, dir.name, "_meta.json");
      expect(fs.existsSync(skillMd), `${dir.name} should have SKILL.md`).toBe(true);
      expect(fs.existsSync(metaJson), `${dir.name} should have _meta.json`).toBe(true);
    }

    console.log(`Verified ${skillDirs.length} skill directories have SKILL.md + _meta.json`);
  });
});
