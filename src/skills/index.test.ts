import { describe, expect, it } from "vitest";
import { defaultRegistry } from "./registry";
import { registerDefaultSkills } from "./index";

describe("registerDefaultSkills", () => {
  it("pre-registers gemini-cli tools so runtime can load them without SKILL.md discovery", async () => {
    registerDefaultSkills();

    const tools = await defaultRegistry.getTools("gemini-cli");

    expect(tools).toBeDefined();
    expect(Object.keys(tools)).toContain("gemini_run");
  });
});
