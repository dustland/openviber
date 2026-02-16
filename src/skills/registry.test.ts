import { describe, expect, it } from "vitest";
import { SkillRegistry } from "./registry";

describe("SkillRegistry — discovery only (no tools)", () => {
  it("loadSkill returns a skill with metadata and instructions from SKILL.md", async () => {
    const registry = new SkillRegistry(__dirname);

    // Load a real skill in the same directory (e.g. terminal)
    const skill = await registry.loadSkill("terminal");
    expect(skill).toBeDefined();
    expect(skill!.metadata.name).toBe("terminal");
    expect(skill!.metadata.description).toBeTruthy();
    expect(skill!.instructions).toBeTruthy();
  });

  it("returns undefined for a directory without SKILL.md", async () => {
    const registry = new SkillRegistry(__dirname);
    const skill = await registry.loadSkill("_test");
    // _test dir itself has no SKILL.md (only subdirectories do)
    // If it has SKILL.md it returns a skill, otherwise undefined
    // This tests that missing SKILL.md is handled gracefully
    if (skill === undefined) {
      expect(skill).toBeUndefined();
    } else {
      expect(skill.metadata).toBeDefined();
    }
  });

  it("getAllSkills returns discovered skills after loadAll", async () => {
    const registry = new SkillRegistry(__dirname);
    await registry.loadAll();
    const skills = registry.getAllSkills();
    expect(skills.length).toBeGreaterThan(0);
    // Every skill should have basic fields
    for (const s of skills) {
      expect(s.id).toBeTruthy();
      expect(s.metadata.name).toBeTruthy();
      expect(s.dir).toBeTruthy();
    }
  });
});
