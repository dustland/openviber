/**
 * Skill Pipeline Integration Tests
 *
 * Validates the skill + tool pipeline after the Agent Skills spec alignment:
 *   1. Skill discovery — SkillRegistry finds SKILL.md and parses metadata
 *   2. Tool registration — ToolRegistry manages tools separately from skills
 *   3. Tool execution — calling execute() returns expected results
 *   4. Agent integration — Agent loads skills (instructions) + tools (capabilities)
 *   5. Full pipeline  — runTask() streams results with tool calls (requires LLM key)
 *
 * Tests 1–4 are fully deterministic (no LLM, no network).
 * Test 5 is skipped when no API key is available.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as path from "path";
import { SkillRegistry } from "./registry";
import { ToolRegistry } from "../tools/registry";
import { defaultToolRegistry } from "../tools/registry";
import type { CoreTool } from "../worker/tool";

// Point at the _test skills directory, not the real skills
const TEST_SKILLS_DIR = path.resolve(__dirname, "_test");

// ==================== Layer 1: Skill Discovery ====================

describe("Skill Pipeline — Discovery", () => {
  let registry: SkillRegistry;

  beforeAll(async () => {
    registry = new SkillRegistry(TEST_SKILLS_DIR);
    await registry.loadAll();
  });

  it("discovers the echo skill via SKILL.md", () => {
    const skill = registry.getSkill("echo");
    expect(skill).toBeDefined();
    expect(skill!.id).toBe("echo");
    expect(skill!.metadata.name).toBe("echo");
    expect(skill!.metadata.description).toContain("echo");
  });

  it("discovers the math skill via SKILL.md", () => {
    const skill = registry.getSkill("math");
    expect(skill).toBeDefined();
    expect(skill!.id).toBe("math");
    expect(skill!.metadata.name).toBe("math");
    expect(skill!.metadata.description).toContain("arithmetic");
  });

  it("lists both test skills from getAllSkills()", () => {
    const allSkills = registry.getAllSkills();
    const ids = allSkills.map((s) => s.id);
    expect(ids).toContain("echo");
    expect(ids).toContain("math");
  });

  it("parses instructions from SKILL.md body", () => {
    const echo = registry.getSkill("echo");
    expect(echo!.instructions).toContain("test_echo");
    const math = registry.getSkill("math");
    expect(math!.instructions).toContain("test_calculate");
  });
});

// ==================== Layer 2: Tool Registration ====================

describe("Skill Pipeline — Tool Registration", () => {
  let toolRegistry: ToolRegistry;

  beforeAll(async () => {
    // Import test tool modules and register them in a fresh ToolRegistry
    toolRegistry = new ToolRegistry();
    const { getTools: getEchoTools } = await import("../tools/_test/echo");
    const { getTools: getMathTools } = await import("../tools/_test/math");
    toolRegistry.registerTools("echo", getEchoTools());
    toolRegistry.registerTools("math", getMathTools());
  });

  it("registers echo tools under the 'echo' namespace", () => {
    const tools = toolRegistry.getTools("echo");
    expect(tools).toBeDefined();
    expect(tools).toHaveProperty("test_echo");
    expect(tools.test_echo.description).toBeDefined();
    expect(tools.test_echo.inputSchema).toBeDefined();
    expect(typeof tools.test_echo.execute).toBe("function");
  });

  it("registers math tools under the 'math' namespace", () => {
    const tools = toolRegistry.getTools("math");
    expect(tools).toBeDefined();
    expect(tools).toHaveProperty("test_calculate");
    expect(tools.test_calculate.description).toBeDefined();
    expect(tools.test_calculate.inputSchema).toBeDefined();
    expect(typeof tools.test_calculate.execute).toBe("function");
  });

  it("getAllTools flattens registered tools", () => {
    const all = toolRegistry.getAllTools();
    expect(all).toHaveProperty("test_echo");
    expect(all).toHaveProperty("test_calculate");
  });

  it("getToolsFor returns tools for specific namespaces", () => {
    const echoOnly = toolRegistry.getToolsFor(["echo"]);
    expect(echoOnly).toHaveProperty("test_echo");
    expect(echoOnly).not.toHaveProperty("test_calculate");
  });
});

// ==================== Layer 3: Tool Execution ====================

describe("Skill Pipeline — Tool Execution", () => {
  let echoTool: CoreTool;
  let mathTool: CoreTool;

  beforeAll(async () => {
    const { getTools: getEchoTools } = await import("../tools/_test/echo");
    const { getTools: getMathTools } = await import("../tools/_test/math");
    echoTool = getEchoTools().test_echo;
    mathTool = getMathTools().test_calculate;
  });

  it("echo tool returns the input message unchanged", async () => {
    const result = await echoTool.execute({ message: "hello viber" });
    expect(result.echo).toBe("hello viber");
    expect(result.timestamp).toBeDefined();
    expect(typeof result.timestamp).toBe("string");
  });

  it("echo tool handles empty string", async () => {
    const result = await echoTool.execute({ message: "" });
    expect(result.echo).toBe("");
  });

  it("math tool adds correctly", async () => {
    const result = await mathTool.execute({ a: 7, b: 3, op: "add" });
    expect(result.result).toBe(10);
    expect(result.expression).toBe("7 + 3 = 10");
  });

  it("math tool subtracts correctly", async () => {
    const result = await mathTool.execute({ a: 10, b: 4, op: "subtract" });
    expect(result.result).toBe(6);
  });

  it("math tool multiplies correctly", async () => {
    const result = await mathTool.execute({ a: 6, b: 7, op: "multiply" });
    expect(result.result).toBe(42);
    expect(result.expression).toContain("42");
  });

  it("math tool divides correctly", async () => {
    const result = await mathTool.execute({ a: 15, b: 3, op: "divide" });
    expect(result.result).toBe(5);
  });

  it("math tool handles division by zero gracefully", async () => {
    const result = await mathTool.execute({ a: 10, b: 0, op: "divide" });
    expect(result.error).toBe("Division by zero");
    expect(result.result).toBeUndefined();
  });
});

// ==================== Layer 4: Agent Integration ====================

describe("Skill Pipeline — Agent Integration", () => {
  it("agent loads test skills and exposes their tools", async () => {
    // Register test tools in the global ToolRegistry
    const { getTools: getEchoTools } = await import("../tools/_test/echo");
    const { getTools: getMathTools } = await import("../tools/_test/math");
    defaultToolRegistry.registerTools("echo", getEchoTools());
    defaultToolRegistry.registerTools("math", getMathTools());

    // Create an Agent with both test skills
    const { Agent } = await import("../worker/agent");
    const agent = new Agent({
      id: "test-agent",
      name: "Test Agent",
      description: "Agent for integration testing",
      provider: "openai",
      model: "gpt-4o-mini",
      skills: ["echo", "math"],
    } as any);

    // Use prepareDebugInfo to inspect what tools the agent resolves
    const debugInfo = await agent.prepareDebugInfo({
      messages: [{ role: "user", content: "test" }],
    });

    // The agent should have merged the skill tools
    const toolIds = debugInfo.tools.map((t: any) => t.id);
    expect(toolIds).toContain("test_echo");
    expect(toolIds).toContain("test_calculate");
  });
});

// ==================== Layer 5: Full Pipeline with Streaming ====================

const hasLLMKey = !!(
  process.env.OPENAI_API_KEY ||
  process.env.OPENROUTER_API_KEY ||
  process.env.ANTHROPIC_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY
);

describe("Skill Pipeline — Full Streaming", () => {
  const conditionalIt = hasLLMKey ? it : it.skip;

  conditionalIt(
    "runTask streams a response that uses the echo tool",
    async () => {
      // Register test tools
      const { getTools: getEchoTools } = await import("../tools/_test/echo");
      defaultToolRegistry.registerTools("echo", getEchoTools());

      const { runTask } = await import("../daemon/runtime");

      const { streamResult } = await runTask(
        'Use the test_echo tool to echo the exact message "pipeline-canary-12345". Then report the result.',
        {
          taskId: `test-pipeline-${Date.now()}`,
          agentConfig: {
            id: "test-stream",
            name: "Test Stream Agent",
            description: "Streaming test agent",
            provider: "openai",
            model: "gpt-4o-mini",
            skills: ["echo"],
          } as any,
        }
      );

      const events: any[] = [];
      for await (const event of streamResult.fullStream) {
        events.push(event);
      }

      const finalText = await streamResult.text;

      // Should have received events
      expect(events.length).toBeGreaterThan(0);

      // Should have at least one tool-call event for test_echo
      const toolCalls = events.filter(
        (e) => e.type === "tool-call" && e.toolName === "test_echo"
      );
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);

      // The tool result should contain our canary string
      const toolResults = events.filter(
        (e) => e.type === "tool-result" && e.toolName === "test_echo"
      );
      expect(toolResults.length).toBeGreaterThanOrEqual(1);
      const resultText = JSON.stringify(toolResults[0]?.result);
      expect(resultText).toContain("pipeline-canary-12345");

      // Final text should reference the echo
      expect(finalText.length).toBeGreaterThan(0);
    },
    60_000
  );
});
