import { describe, expect, it } from "vitest";
import { collectOauthReadySkillIds } from "./skill-auto-enable";

describe("collectOauthReadySkillIds", () => {
  it("returns only skills with passing required oauth checks", () => {
    const ids = collectOauthReadySkillIds({
      skills: [
        {
          id: "gmail",
          checks: [
            { actionType: "oauth", ok: true, required: true },
            { actionType: "binary", ok: true, required: true },
          ],
        },
        {
          id: "github",
          checks: [{ actionType: "oauth", ok: false, required: true }],
        },
        {
          id: "railway",
          checks: [{ actionType: "oauth", ok: true, required: false }],
        },
        {
          id: "tmux",
          checks: [{ actionType: "binary", ok: true, required: true }],
        },
      ],
    });

    expect(ids).toEqual(["gmail"]);
  });
});
