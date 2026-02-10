import { beforeAll, describe, expect, it } from "vitest";
import { defaultRegistry } from "./registry";
import { getTools } from "./playground";
import "./index";

beforeAll(async () => {
  await defaultRegistry.loadAll();
});

describe("skill-playground tool", () => {
  it("exposes skill_playground_verify tool", () => {
    const tools = getTools();
    expect(tools.skill_playground_verify).toBeDefined();
    expect(tools.skill_playground_verify.description).toContain("playground");
  });

  it("returns an error when no playground is defined", async () => {
    const result = await getTools().skill_playground_verify.execute({
      skillId: "tmux",
      waitSeconds: 10,
      refreshRepo: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not define a playground");
  });

  it("loads cursor-agent playground metadata", () => {
    const skill = defaultRegistry.getSkill("cursor-agent");
    expect(skill?.metadata.playground).toBeDefined();
  });
});
