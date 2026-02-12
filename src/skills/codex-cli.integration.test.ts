/**
 * Integration test: codex-cli skill is loaded and the agent exposes codex_run
 * so Viber Board messages like "Use codex to ..." can trigger the tool.
 *
 * Run: pnpm test src/skills/codex-cli.integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { defaultRegistry } from "./registry";
import { Agent } from "../viber/agent";
import { getTools as getCodexCliTools } from "./codex-cli";

// Trigger pre-registration so getTools("codex-cli") returns tools
import "./index";

beforeAll(async () => {
  await defaultRegistry.loadAll();
});

describe("codex-cli skill integration", () => {
  it("loads codex-cli skill and exposes codex_run tool", async () => {
    const skills = defaultRegistry.getAllSkills();
    const codexSkill = skills.find((s) => s.id === "codex-cli");
    expect(codexSkill).toBeDefined();
    expect(codexSkill?.metadata.name).toBe("codex-cli");

    const tools = await defaultRegistry.getTools("codex-cli");
    expect(tools).toHaveProperty("codex_run");
    expect(tools.codex_run.description).toContain("use codex");
    expect(tools.codex_run.execute).toBeTypeOf("function");
  });

  it("agent with codex-cli skill has codex_run in getTools (pipeline to Viber Board)", async () => {
    const agent = new Agent({
      name: "Viber",
      description: "Test agent",
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      skills: ["codex-cli"],
    });

    const debug = await agent.prepareDebugInfo({
      messages: [
        {
          role: "user",
          content:
            "Use codex to review this repo and propose a fix for failing tests.",
        },
      ],
      spaceId: "test-codex-integration",
    });

    expect(debug.tools).toBeDefined();
    expect(Array.isArray(debug.tools)).toBe(true);
    const codexTool = debug.tools.find(
      (t: { id: string }) => t.id === "codex_run",
    );
    expect(codexTool).toBeDefined();
    expect(codexTool.description).toContain("Codex CLI");
    expect(debug.systemPrompt).toContain("codex-cli");
    expect(debug.systemPrompt).toContain("ENABLED SKILLS");
  });

  it("agent internal tool map exposes AI SDK-compatible parameters for codex_run", async () => {
    const agent = new Agent({
      name: "Viber",
      description: "Test agent",
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      skills: ["codex-cli"],
    });

    await agent.prepareDebugInfo({
      messages: [{ role: "user", content: "Use codex for this task." }],
      spaceId: "test-codex-tools",
    });

    const tools = await (agent as any).getTools({ spaceId: "test-codex-tools" });
    expect(tools).toBeDefined();
    expect(tools.codex_run).toBeDefined();
    expect(tools.codex_run.parameters).toBeDefined();
    expect(tools.codex_run.execute).toBeTypeOf("function");
  });

  it("codex_run tool has required parameters (prompt, optional cwd, waitSeconds, approvalMode, model)", () => {
    const tools = getCodexCliTools();
    const tool = tools.codex_run;
    expect(tool.inputSchema).toBeDefined();
    expect(tool.execute).toBeTypeOf("function");

    // Zod schema: prompt is required, others optional
    const schema = tool.inputSchema as {
      shape?: Record<string, unknown>;
      _def?: { shape?: () => Record<string, unknown> };
    };
    const shape = schema?.shape ?? schema?._def?.shape?.();
    expect(shape).toBeDefined();
    expect(shape?.prompt).toBeDefined();
    expect(shape?.approvalMode).toBeDefined();
    expect(shape?.waitSeconds).toBeDefined();
  });

  const runLiveBasic = process.env.OPENVIBER_RUN_LIVE_CLI_TESTS === "1";
  const runLiveComplex = process.env.OPENVIBER_RUN_LIVE_CLI_COMPLEX_TESTS === "1";
  const maybeBasic = runLiveBasic ? it : it.skip;
  const maybeComplex = runLiveComplex ? it : it.skip;

  maybeBasic("codex_run execute returns rich shape (live codex basic)", async () => {
    const tools = getCodexCliTools();
    const run = tools.codex_run.execute;

    const result = await run({
      prompt: "Reply with exactly: INTEGRATION_TEST_OK",
      waitSeconds: 30,
      approvalMode: "suggest",
    });

    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
    expect(result).toHaveProperty("cwd");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("stdoutTail");
    expect(result).toHaveProperty("stderrTail");
    expect(result).toHaveProperty("output");

    if (result.ok) {
      expect(result.output.length).toBeGreaterThan(0);
    } else {
      expect(result).toHaveProperty("error");
    }
  }, 60_000);

  maybeComplex(
    "codex_run handles longer complex repository analysis flows (live codex complex)",
    async () => {
      const tools = getCodexCliTools();
      const run = tools.codex_run.execute;

      const result = await run({
        prompt:
          "Analyze this repository and produce a concise implementation plan to improve robustness of src/skills/codex-cli/index.ts. Include: risks, edge cases, and 3 prioritized actions with file paths.",
        cwd: process.cwd(),
        waitSeconds: 420,
        approvalMode: "suggest",
      });

      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("summary");
      expect(result.summary).toContain("approvalMode=suggest");
      expect(result.summary).toContain("status=");
      expect(result.summary).toContain("exitCode=");
      expect(result).toHaveProperty("stdoutTail");
      expect(result).toHaveProperty("stderrTail");

      // Complex run may pass or fail depending on environment/login, but must be actionable.
      if (!result.ok) {
        expect(result.error).toBeDefined();
      }
    },
    480_000,
  );
});
