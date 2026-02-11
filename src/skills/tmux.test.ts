import { describe, expect, it } from "vitest";
import { __private, getTools } from "./tmux";

describe("tmux skill tools", () => {
  it("exposes prerequisite setup tool", () => {
    const tools = getTools();
    expect(tools.tmux_prepare_skill_prerequisites).toBeDefined();
    expect(tools.tmux_prepare_skill_prerequisites.description).toContain(
      "prerequisites",
    );
  });

  it("selects pnpm install commands for node-based CLIs", () => {
    const env = {
      hasBrew: false,
      hasApt: false,
      hasCurl: false,
      isRoot: false,
    };

    expect(__private.selectInstallCommand("codex-cli", env)).toBe(
      "pnpm add -g @openai/codex",
    );
    expect(__private.selectInstallCommand("gemini-cli", env)).toBe(
      "pnpm add -g @google/gemini-cli",
    );
    expect(__private.selectInstallCommand("railway-cli", env)).toBe(
      "pnpm add -g @railway/cli",
    );
  });

  it("selects system install command based on environment", () => {
    const brewEnv = {
      hasBrew: true,
      hasApt: false,
      hasCurl: false,
      isRoot: false,
    };
    expect(__private.selectInstallCommand("tmux", brewEnv)).toBe(
      "brew install tmux",
    );

    const aptRootEnv = {
      hasBrew: false,
      hasApt: true,
      hasCurl: false,
      isRoot: true,
    };
    expect(__private.selectInstallCommand("gh-cli", aptRootEnv)).toBe(
      "apt-get update && apt-get install -y gh",
    );

    const aptNonRootEnv = {
      hasBrew: false,
      hasApt: true,
      hasCurl: false,
      isRoot: false,
    };
    expect(__private.selectInstallCommand("tmux", aptNonRootEnv)).toBeNull();
  });

  it("builds auth commands with command resolver", () => {
    expect(
      __private.selectAuthCommand("cursor-auth", () => "cursor-agent"),
    ).toBe("cursor-agent login");
    expect(__private.selectAuthCommand("gh-auth", () => "gh")).toBe(
      "gh auth login -h github.com",
    );
    expect(__private.selectAuthCommand("codex-auth", () => null)).toBeNull();
  });
});
