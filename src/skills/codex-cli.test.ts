import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
const existsSyncMock = vi.fn();
const statSyncMock = vi.fn();

vi.mock("child_process", () => ({
  spawn: (...args: any[]) => spawnMock(...args),
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (...args: any[]) => existsSyncMock(...args),
    statSync: (...args: any[]) => statSyncMock(...args),
  };
});

import { __private, getTools } from "../tools/codex-cli";

type ProcOptions = {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  delayMs?: number;
  neverClose?: boolean;
};

function createFakeProc(options: ProcOptions = {}) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    if (options.neverClose) {
      setTimeout(() => proc.emit("close", options.code ?? 143), 0);
    }
    return true;
  });

  if (!options.neverClose) {
    setTimeout(() => {
      if (options.stdout) proc.stdout.emit("data", options.stdout);
      if (options.stderr) proc.stderr.emit("data", options.stderr);
      proc.emit("close", options.code ?? 0);
    }, options.delayMs ?? 0);
  }

  return proc;
}

describe("codex-cli tool", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    existsSyncMock.mockReset();
    statSyncMock.mockReset();
    vi.useRealTimers();

    existsSyncMock.mockImplementation((target: unknown) => {
      if (typeof target !== "string") {
        return false;
      }
      if (target.includes("codex")) {
        return true;
      }
      return target === "/tmp/project" || target === process.cwd();
    });
    statSyncMock.mockReturnValue({ isDirectory: () => true });
  });

  it("builds codex exec args for full-auto mode", () => {
    const args = __private.buildCodexArgs(
      "Fix failing tests",
      "/tmp/project",
      "full-auto",
      "gpt-5-codex",
    );
    expect(args[0]).toBe("exec");
    expect(args).toContain("--full-auto");
    expect(args).toContain("--cd");
    expect(args).toContain("/tmp/project");
    expect(args).toContain("--model");
    expect(args).toContain("gpt-5-codex");
  });

  it("builds codex exec args for suggest mode (read-only)", () => {
    const args = __private.buildCodexArgs(
      "Review the repository",
      "/tmp/project",
      "suggest",
    );
    expect(args).toContain("-s");
    expect(args).toContain("read-only");
    expect(args[args.length - 1]).toBe("Review the repository");
  });

  it("executes codex and returns ok=true on exit code 0", async () => {
    const fake = createFakeProc({
      stdout: "done",
      stderr: "warn",
      code: 0,
    });
    spawnMock.mockReturnValue(fake);

    const result = await getTools().codex_run.execute({
      prompt: "Do work",
      cwd: "/tmp/project",
      approvalMode: "suggest",
      waitSeconds: 10,
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe("codex");
    expect(args[0]).toBe("exec");
    expect(args).toContain("--cd");
    expect(result.ok).toBe(true);
    expect(result.output).toContain("done");
    expect(result.output).toContain("warn");
    expect(result.summary).toContain("status=success");
    expect(result.stdoutTail).toContain("done");
    expect(result.command).toContain("\"exec\"");
  });

  it("returns ok=false when codex exits non-zero", async () => {
    const fake = createFakeProc({
      stderr: "fatal error",
      code: 2,
    });
    spawnMock.mockReturnValue(fake);

    const result = await getTools().codex_run.execute({
      prompt: "Fail please",
      waitSeconds: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.error).toContain("exited with code 2");
    expect(result.output).toContain("fatal error");
    expect(result.summary).toContain("status=failed");
  });

  it("returns timeout error when codex does not finish in time", async () => {
    vi.useFakeTimers();
    const fake = createFakeProc({ neverClose: true, code: 143 });
    spawnMock.mockReturnValue(fake);

    const pending = getTools().codex_run.execute({
      prompt: "Long task",
      waitSeconds: 10,
    });

    await vi.advanceTimersByTimeAsync(10_001);
    const result = await pending;

    expect(fake.kill).toHaveBeenCalledWith("SIGTERM");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
    expect(result.timedOut).toBe(true);
  });

  it("returns clear error when codex is not installed", async () => {
    existsSyncMock.mockReturnValue(false);

    const result = await getTools().codex_run.execute({
      prompt: "Hello",
      waitSeconds: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Codex CLI not found in PATH");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("truncates oversized output to protect context window", () => {
    const huge = "a".repeat(20_000);
    const out = __private.truncateOutput(huge);
    expect(out.length).toBeLessThan(huge.length);
    expect(out).toContain("[truncated");
  });

  it("creates tail previews for chat-friendly responses", () => {
    const input = Array.from({ length: 100 }, (_, i) => `line-${i + 1}`).join("\n");
    const tail = __private.getTailLines(input, 5);
    expect(tail).toContain("line-100");
    expect(tail).toContain("omitted");
  });
});
