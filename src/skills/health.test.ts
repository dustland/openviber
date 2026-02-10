import { describe, expect, it } from "vitest";
import { checkSkillHealth, checkSkillsHealth } from "./health";

describe("skill health checks", () => {
  it("returns UNKNOWN for skills without automated checks", async () => {
    const result = await checkSkillHealth({ id: "mystery-skill" });
    expect(result.status).toBe("UNKNOWN");
    expect(result.available).toBe(false);
    expect(result.summary).toContain("No automated health checks");
  });

  it("builds a report for the provided skill list", async () => {
    const report = await checkSkillsHealth([{ id: "mystery-skill" }]);
    expect(report.skills).toHaveLength(1);
    expect(report.skills[0]?.id).toBe("mystery-skill");
    expect(typeof report.generatedAt).toBe("string");
  });
});
