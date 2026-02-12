import { describe, expect, it } from "vitest";
import {
  applyWorkingModeToTools,
  resolveRequireApprovalTools,
  resolveWorkingMode,
} from "./agent";
import type { AgentConfig } from "../types";

describe("working-mode", () => {
  it("resolves default and alias working modes", () => {
    expect(resolveWorkingMode({} as unknown as AgentConfig)).toBe("agent_decides");
    expect(resolveWorkingMode({ mode: "always_ask" } as unknown as AgentConfig)).toBe(
      "always_ask"
    );
    expect(
      resolveWorkingMode({ workingMode: "always_execute" } as unknown as AgentConfig)
    ).toBe("always_execute");
  });

  it("resolves require approval tools from both config key styles", () => {
    expect(
      Array.from(
        resolveRequireApprovalTools({
          require_approval: ["create_file"],
        } as unknown as AgentConfig)
      )
    ).toEqual(["create_file"]);

    expect(
      Array.from(
        resolveRequireApprovalTools({
          requireApproval: ["delete_file"],
        } as unknown as AgentConfig)
      )
    ).toEqual(["delete_file"]);
  });

  it("blocks tools in always_ask mode without metadata approval", async () => {
    const tools = {
      create_file: {
        description: "create",
        inputSchema: {},
        execute: async () => "ok",
      },
    };

    const wrapped = applyWorkingModeToTools(tools, {
      mode: "always_ask",
      requireApproval: new Set(),
      metadata: {},
    });

    await expect(wrapped!.create_file.execute({})).rejects.toThrow(
      /Approval required/
    );
  });

  it("allows approved tools in always_ask mode", async () => {
    const tools = {
      create_file: {
        description: "create",
        inputSchema: {},
        execute: async () => "ok",
      },
    };

    const wrapped = applyWorkingModeToTools(tools, {
      mode: "always_ask",
      requireApproval: new Set(),
      metadata: { approvedTools: ["create_file"] },
    });

    await expect(wrapped!.create_file.execute({})).resolves.toBe("ok");
  });

  it("blocks only configured tools in agent_decides mode", async () => {
    const tools = {
      read_file: {
        description: "read",
        inputSchema: {},
        execute: async () => "read",
      },
      delete_file: {
        description: "delete",
        inputSchema: {},
        execute: async () => "delete",
      },
    };

    const wrapped = applyWorkingModeToTools(tools, {
      mode: "agent_decides",
      requireApproval: new Set(["delete_file"]),
      metadata: {},
    });

    await expect(wrapped!.read_file.execute({})).resolves.toBe("read");
    await expect(wrapped!.delete_file.execute({})).rejects.toThrow(
      /Approval required/
    );
  });
});
