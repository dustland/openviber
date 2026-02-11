import { beforeEach, describe, expect, it, vi } from "vitest";

const execSyncMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock("child_process", () => ({
  execSync: (...args: any[]) => execSyncMock(...args),
  spawnSync: (...args: any[]) => spawnSyncMock(...args),
}));

import { getTools, __private } from "./terminal";

describe("terminal skill helpers", () => {
  it("safeTarget strips unsafe characters", () => {
    expect(__private.safeTarget("my-session")).toBe("my-session");
    expect(__private.safeTarget("my session!@#$%")).toBe("my-session-----");
    expect(__private.safeTarget("coding:window.1")).toBe("coding:window.1");
  });

  it("sleep resolves after the specified duration", async () => {
    vi.useFakeTimers();
    const promise = __private.sleep(2);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    vi.useRealTimers();
  });

  it("isTmuxInstalled returns installed status", () => {
    execSyncMock.mockReturnValue("tmux 3.4\n");
    const result = __private.isTmuxInstalled();
    expect(result.installed).toBe(true);
    expect(result.version).toBe("tmux 3.4");
    execSyncMock.mockReset();
  });
});

describe("terminal skill tools", () => {
  beforeEach(() => {
    execSyncMock.mockReset();
    spawnSyncMock.mockReset();
  });

  describe("terminal_check", () => {
    it("returns available=true when backend is found", async () => {
      execSyncMock.mockReturnValue("tmux 3.4\n");
      const result = await getTools().terminal_check.execute({});
      expect(result.available).toBe(true);
      expect(result.backend).toBe("tmux");
      expect(result.version).toBe("tmux 3.4");
    });

    it("returns available=false when backend is not found", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("command not found");
      });
      const result = await getTools().terminal_check.execute({});
      expect(result.available).toBe(false);
      expect(result.hint).toContain("tmux");
    });
  });

  describe("terminal_new_session", () => {
    it("creates a new session", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_new_session.execute({
        sessionName: "coding",
      });
      expect(result.ok).toBe(true);
      expect(result.sessionName).toBe("coding");
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        ["new-session", "-d", "-s", "coding"],
        expect.any(Object),
      );
    });

    it("passes window name and start directory", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_new_session.execute({
        sessionName: "coding",
        firstWindowName: "editor",
        startDirectory: "/tmp/project",
      });
      expect(result.ok).toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        expect.arrayContaining(["-n", "editor"]),
        expect.any(Object),
      );
    });
  });

  describe("terminal_kill_session", () => {
    it("destroys a session successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_kill_session.execute({
        sessionName: "coding",
      });
      expect(result.ok).toBe(true);
      expect(result.sessionName).toBe("coding");
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        ["kill-session", "-t", "coding"],
        expect.any(Object),
      );
    });

    it("returns error when session does not exist", async () => {
      spawnSyncMock.mockImplementation(() => {
        throw new Error("can't find session: coding");
      });
      const result = await getTools().terminal_kill_session.execute({
        sessionName: "coding",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("can't find session");
    });
  });

  describe("terminal_rename_session", () => {
    it("renames a session successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_rename_session.execute({
        oldName: "old",
        newName: "new-name",
      });
      expect(result.ok).toBe(true);
      expect(result.oldName).toBe("old");
      expect(result.newName).toBe("new-name");
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        ["rename-session", "-t", "old", "new-name"],
        expect.any(Object),
      );
    });
  });

  describe("terminal_new_window", () => {
    it("creates a new window in a session", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_new_window.execute({
        target: "coding",
        windowName: "server",
      });
      expect(result.ok).toBe(true);
      expect(result.session).toBe("coding");
      expect(result.windowName).toBe("server");
    });

    it("sends command to new window when specified", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      await getTools().terminal_new_window.execute({
        target: "coding",
        command: "npm run dev",
      });
      // First call: new-window, second call: send-keys
      expect(spawnSyncMock).toHaveBeenCalledTimes(2);
      expect(spawnSyncMock.mock.calls[1][1]).toEqual(
        expect.arrayContaining(["send-keys", "-t", "coding", "npm run dev", "Enter"]),
      );
    });
  });

  describe("terminal_kill_window", () => {
    it("closes a window successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_kill_window.execute({
        target: "coding:1",
      });
      expect(result.ok).toBe(true);
      expect(result.target).toBe("coding:1");
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        ["kill-window", "-t", "coding:1"],
        expect.any(Object),
      );
    });
  });

  describe("terminal_rename_window", () => {
    it("renames a window successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_rename_window.execute({
        target: "coding:1",
        newName: "server",
      });
      expect(result.ok).toBe(true);
      expect(result.newName).toBe("server");
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        ["rename-window", "-t", "coding:1", "server"],
        expect.any(Object),
      );
    });
  });

  describe("terminal_split_pane", () => {
    it("splits a pane horizontally by default", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_split_pane.execute({
        target: "coding:1",
      });
      expect(result.ok).toBe(true);
      expect(spawnSyncMock.mock.calls[0][1]).not.toContain("-h");
    });

    it("splits vertically when vertical=true", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      await getTools().terminal_split_pane.execute({
        target: "coding:1",
        vertical: true,
      });
      expect(spawnSyncMock.mock.calls[0][1]).toContain("-h");
    });
  });

  describe("terminal_send_keys", () => {
    it("sends keys with Enter by default", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().terminal_send_keys.execute({
        target: "coding:1",
        keys: "npm test",
      });
      expect(result.ok).toBe(true);
      expect(spawnSyncMock.mock.calls[0][1]).toContain("Enter");
    });

    it("omits Enter when pressEnter=false", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      await getTools().terminal_send_keys.execute({
        target: "coding:1",
        keys: "C-c",
        pressEnter: false,
      });
      expect(spawnSyncMock.mock.calls[0][1]).not.toContain("Enter");
    });
  });

  describe("terminal_read", () => {
    it("reads pane output", async () => {
      execSyncMock.mockReturnValue("$ npm test\nPASS all tests\n");
      const result = await getTools().terminal_read.execute({
        target: "coding:1.0",
      });
      expect(result.ok).toBe(true);
      expect(result.output).toContain("PASS all tests");
      expect(result.lines).toBe(200);
    });

    it("uses custom line count", async () => {
      execSyncMock.mockReturnValue("output\n");
      const result = await getTools().terminal_read.execute({
        target: "coding:1",
        lines: 500,
      });
      expect(result.ok).toBe(true);
      expect(result.lines).toBe(500);
      expect(execSyncMock.mock.calls[0][0]).toContain("-S -500");
    });

    it("returns error when target does not exist", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("can't find pane");
      });
      const result = await getTools().terminal_read.execute({
        target: "nonexistent:1.0",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("can't find pane");
    });
  });

  describe("terminal_list", () => {
    it("lists all sessions when no sessionName given", async () => {
      execSyncMock.mockReturnValue("coding\ndev\n");
      const result = await getTools().terminal_list.execute({});
      expect(result.ok).toBe(true);
      expect(result.sessions).toEqual(["coding", "dev"]);
    });

    it("lists windows and panes for a given session", async () => {
      execSyncMock
        .mockReturnValueOnce("0 bash\n1 cursor")
        .mockReturnValueOnce("0.0 bash\n1.0 agent");
      const result = await getTools().terminal_list.execute({
        sessionName: "coding",
      });
      expect(result.ok).toBe(true);
      expect(result.windows).toEqual(["0 bash", "1 cursor"]);
      expect(result.panes).toEqual(["0.0 bash", "1.0 agent"]);
    });

    it("returns empty arrays when no sessions exist", async () => {
      execSyncMock.mockReturnValue("");
      const result = await getTools().terminal_list.execute({});
      expect(result.ok).toBe(true);
      expect(result.sessions).toEqual([]);
    });
  });

  describe("terminal_run", () => {
    it("runs a command and captures output", async () => {
      execSyncMock.mockReturnValue("$ echo hello\nhello\n");
      spawnSyncMock.mockReturnValue({ status: 0 });

      const result = await getTools().terminal_run.execute({
        sessionName: "test",
        command: "echo hello",
        waitSeconds: 1,
      });
      expect(result.ok).toBe(true);
      expect(result.sessionName).toBe("test");
    });

    it("returns error when backend fails", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("tmux not found");
      });
      const result = await getTools().terminal_run.execute({
        sessionName: "test",
        command: "echo hello",
        waitSeconds: 1,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("tool registry completeness", () => {
    it("exports all 12 expected tools", () => {
      const tools = getTools();
      const expectedTools = [
        "terminal_check",
        "terminal_new_session",
        "terminal_kill_session",
        "terminal_rename_session",
        "terminal_new_window",
        "terminal_kill_window",
        "terminal_rename_window",
        "terminal_split_pane",
        "terminal_send_keys",
        "terminal_read",
        "terminal_list",
        "terminal_run",
      ];
      for (const name of expectedTools) {
        expect(tools[name], `tool ${name} should exist`).toBeDefined();
        expect(typeof tools[name].execute).toBe("function");
        expect(typeof tools[name].description).toBe("string");
        expect(tools[name].inputSchema).toBeDefined();
      }
      expect(Object.keys(tools)).toHaveLength(expectedTools.length);
    });
  });
});
