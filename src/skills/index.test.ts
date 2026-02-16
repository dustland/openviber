import { describe, expect, it } from "vitest";
import { defaultToolRegistry } from "../tools/registry";
import { registerSkillTools } from "../tools/skill-tools";

describe("registerSkillTools", () => {
  it("registers gemini-cli tools in the ToolRegistry", () => {
    registerSkillTools();

    const tools = defaultToolRegistry.getTools("gemini-cli");

    expect(tools).toBeDefined();
    expect(Object.keys(tools)).toContain("gemini_run");
  });
});
