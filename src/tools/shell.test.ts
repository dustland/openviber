import type { ExecException } from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execMock = vi.fn();

vi.mock("child_process", () => ({
  exec: (...args: unknown[]) => execMock(...args),
}));

import { ShellTool } from "./shell";

describe("ShellTool", () => {
  beforeEach(() => {
    execMock.mockReset();
  });

  it("blocks dangerous commands before execution", async () => {
    const tool = new ShellTool();
    await expect(
      tool.shell_run({ command: "rm -rf /" }),
    ).rejects.toThrow(/Security Error/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("blocks execution outside the workspace when restrictToWorkspace is enabled", async () => {
    const tool = new ShellTool();
    await expect(
      tool.shell_run({ command: "echo ok", cwd: "/tmp" }),
    ).rejects.toThrow(/outside the allowed workspace/);
    expect(execMock).not.toHaveBeenCalled();
  });

  it("allows execution within workspace subdirectories", async () => {
    execMock.mockImplementation(
      (_command: string, _opts: unknown, callback: (error: ExecException | null, stdout: string, stderr: string) => void) => {
        callback(null, "ok", "");
      },
    );

    const tool = new ShellTool();
    const result = await tool.shell_run({ command: "echo ok", cwd: "subdir" });

    expect(result.ok).toBe(true);
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it("allows execution outside the workspace when restrictToWorkspace is disabled", async () => {
    execMock.mockImplementation(
      (_command: string, _opts: unknown, callback: (error: ExecException | null, stdout: string, stderr: string) => void) => {
        callback(null, "ok", "");
      },
    );

    const tool = new ShellTool();
    tool.setConfig({ restrictToWorkspace: false });
    const result = await tool.shell_run({ command: "echo ok", cwd: "/tmp" });

    expect(result.ok).toBe(true);
    expect(execMock).toHaveBeenCalledTimes(1);
  });

  it("returns ok=true on successful exec", async () => {
    execMock.mockImplementation(
      (_command: string, _opts: unknown, callback: (error: ExecException | null, stdout: string, stderr: string) => void) => {
        callback(null, "hello", "");
      },
    );

    const tool = new ShellTool();
    const result = await tool.shell_run({ command: "echo hello" });

    expect(execMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      exitCode: 0,
      stdout: "hello",
      stderr: "",
    });
  });

  it("returns ok=false when exec fails", async () => {
    execMock.mockImplementation(
      (_command: string, _opts: unknown, callback: (error: ExecException | null, stdout: string, stderr: string) => void) => {
        const error = Object.assign(new Error("boom"), { code: 2 }) as ExecException;
        callback(error, "", "boom");
      },
    );

    const tool = new ShellTool();
    const result = await tool.shell_run({ command: "bad command" });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("boom");
  });
});
