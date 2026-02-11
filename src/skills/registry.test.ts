import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SkillRegistry } from "./registry";
import type { CoreTool } from "../core/tool";

describe("SkillRegistry pre-registration", () => {
  it("adds pre-registered skills to skill listings without SKILL.md", () => {
    const registry = new SkillRegistry("/tmp/openviber-skills-test");
    const fakeTool: CoreTool = {
      description: "fake tool",
      inputSchema: z.object({}),
      execute: async () => ({ ok: true }),
    };

    registry.preRegisterTools("fake-skill", { fake: fakeTool });

    const skill = registry.getSkill("fake-skill");
    expect(skill).toBeDefined();
    expect(skill?.id).toBe("fake-skill");
    expect(registry.getAllSkills().map((s) => s.id)).toContain("fake-skill");
  });
});
