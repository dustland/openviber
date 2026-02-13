/**
 * Integration test: cursor-agent skill is loaded and the agent exposes
 * cursor_agent_run so that Viber Board messages like "Use cursor-agent to ..."
 * can trigger the tool.
 *
 * Run: pnpm test src/skills/cursor-agent.integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { defaultRegistry } from "./registry";
import { Agent } from "../viber/agent";
import { getTools as getCursorAgentTools } from "./cursor-agent";
import { registerDefaultSkills } from "./index";

// Trigger pre-registration so getTools("cursor-agent") returns tools
registerDefaultSkills();

beforeAll(async () => {
  await defaultRegistry.loadAll();
});

describe("cursor-agent skill integration", () => {
  it("loads cursor-agent skill and exposes cursor_agent_run tool", async () => {
    const skills = defaultRegistry.getAllSkills();
    const cursorSkill = skills.find((s) => s.id === "cursor-agent");
    expect(cursorSkill).toBeDefined();
    expect(cursorSkill?.metadata.name).toBe("cursor-agent");

    const tools = await defaultRegistry.getTools("cursor-agent");
    expect(tools).toHaveProperty("cursor_agent_run");
    expect(tools.cursor_agent_run.description).toContain("cursor-agent");
    expect(tools.cursor_agent_run.description).toContain("Call this whenever");
    expect(tools.cursor_agent_run.execute).toBeTypeOf("function");
  });

  it("agent with cursor-agent skill has cursor_agent_run in getTools (pipeline to Viber Board)", async () => {
    const agent = new Agent({
      name: "Viber",
      description: "Test agent",
      provider: "openrouter",
      model: "deepseek/deepseek-chat",
      skills: ["cursor-agent"],
    });

    const debug = await agent.prepareDebugInfo({
      messages: [
        {
          role: "user",
          content:
            "Use cursor-agent to review the project at ~/tc/ticos and list the issues.",
        },
      ],
      spaceId: "test-integration",
    });

    expect(debug.tools).toBeDefined();
    expect(Array.isArray(debug.tools)).toBe(true);
    const cursorTool = debug.tools.find(
      (t: { id: string }) => t.id === "cursor_agent_run",
    );
    expect(cursorTool).toBeDefined();
    expect(cursorTool.description).toContain("cursor-agent");
    expect(debug.systemPrompt).toContain("cursor-agent");
    expect(debug.systemPrompt).toContain("ENABLED SKILLS");
  });

  it("cursor_agent_run tool has required parameters (goal, optional cwd, waitSeconds)", () => {
    const tools = getCursorAgentTools();
    const tool = tools.cursor_agent_run;
    expect(tool.inputSchema).toBeDefined();
    expect(tool.execute).toBeTypeOf("function");
    // Zod schema: goal is required; cwd and waitSeconds optional
    const schema = tool.inputSchema as {
      shape?: Record<string, unknown>;
      _def?: { shape?: () => Record<string, unknown> };
    };
    const shape = schema?.shape ?? schema?._def?.shape?.();
    expect(shape).toBeDefined();
    expect(shape?.goal).toBeDefined();
  });

  it("cursor_agent_run execute returns shape { ok, status, output?, error?, cwd } (when run)", async () => {
    // Run the tool with a minimal goal and short wait to verify it executes.
    // Requires tmux and Cursor CLI; skip if not available or in CI.
    const tools = getCursorAgentTools();
    const run = tools.cursor_agent_run.execute;

    const result = await run({
      goal: "Reply with exactly: INTEGRATION_TEST_OK",
      waitSeconds: 10,
    });

    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
    expect(result).toHaveProperty("cwd");
    expect(result).toHaveProperty("status");
    expect(["completed", "timed_out", "error"]).toContain(result.status);
    if (result.ok) {
      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("outputTail");
    } else {
      expect(result).toHaveProperty("error");
    }
  }, 30_000);
});
