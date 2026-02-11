import { beforeEach, describe, expect, it, vi } from "vitest";

const execSyncMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock("child_process", () => ({
  execSync: (...args: any[]) => execSyncMock(...args),
  spawnSync: (...args: any[]) => spawnSyncMock(...args),
}));

import { getTools, __private } from "./tmux";

describe("tmux skill helpers", () => {
  it("safeTarget strips unsafe characters", () => {
    expect(__private.safeTarget("my-session")).toBe("my-session");
    expect(__private.safeTarget("my session!@#$%")).toBe("my-session-----");
    expect(__private.safeTarget("coding:window.1")).toBe("coding:window.1");
  });

  it("sleep resolves after the specified duration", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const promise = __private.sleep(2);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    // Just verify it resolved without error
    vi.useRealTimers();
  });
});

describe("tmux skill tools", () => {
  beforeEach(() => {
    execSyncMock.mockReset();
    spawnSyncMock.mockReset();
  });

  describe("tmux_install_check", () => {
    it("returns installed=true when tmux is found", async () => {
      execSyncMock.mockReturnValue("tmux 3.4\n");
      const result = await getTools().tmux_install_check.execute({});
      expect(result.installed).toBe(true);
      expect(result.version).toBe("tmux 3.4");
    });

    it("returns installed=false when tmux is not found", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("command not found");
      });
      const result = await getTools().tmux_install_check.execute({});
      expect(result.installed).toBe(false);
      expect(result.hint).toContain("brew install tmux");
    });
  });

  describe("tmux_new_session", () => {
    it("creates a new detached session", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_new_session.execute({
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
      const result = await getTools().tmux_new_session.execute({
        sessionName: "coding",
        firstWindowName: "cursor-1",
        startDirectory: "/tmp/project",
      });
      expect(result.ok).toBe(true);
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        expect.arrayContaining(["-n", "cursor-1"]),
        expect.any(Object),
      );
    });
  });

  describe("tmux_kill_session", () => {
    it("kills a session successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_kill_session.execute({
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
      const result = await getTools().tmux_kill_session.execute({
        sessionName: "coding",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("can't find session");
    });
  });

  describe("tmux_rename_session", () => {
    it("renames a session successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_rename_session.execute({
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

  describe("tmux_new_window", () => {
    it("creates a new window in a session", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_new_window.execute({
        target: "coding",
        windowName: "cursor-2",
      });
      expect(result.ok).toBe(true);
      expect(result.session).toBe("coding");
      expect(result.windowName).toBe("cursor-2");
    });

    it("sends command to new window when specified", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      await getTools().tmux_new_window.execute({
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

  describe("tmux_kill_window", () => {
    it("kills a window successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_kill_window.execute({
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

  describe("tmux_rename_window", () => {
    it("renames a window successfully", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_rename_window.execute({
        target: "coding:1",
        newName: "dev-server",
      });
      expect(result.ok).toBe(true);
      expect(result.newName).toBe("dev-server");
      expect(spawnSyncMock).toHaveBeenCalledWith(
        "tmux",
        ["rename-window", "-t", "coding:1", "dev-server"],
        expect.any(Object),
      );
    });
  });

  describe("tmux_split_pane", () => {
    it("splits a pane horizontally by default", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_split_pane.execute({
        target: "coding:1",
      });
      expect(result.ok).toBe(true);
      // Should not include -h (vertical flag)
      expect(spawnSyncMock.mock.calls[0][1]).not.toContain("-h");
    });

    it("splits vertically when vertical=true", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      await getTools().tmux_split_pane.execute({
        target: "coding:1",
        vertical: true,
      });
      expect(spawnSyncMock.mock.calls[0][1]).toContain("-h");
    });
  });

  describe("tmux_send_keys", () => {
    it("sends keys with Enter by default", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      const result = await getTools().tmux_send_keys.execute({
        target: "coding:1",
        keys: "npm test",
      });
      expect(result.ok).toBe(true);
      expect(spawnSyncMock.mock.calls[0][1]).toContain("Enter");
    });

    it("omits Enter when pressEnter=false", async () => {
      spawnSyncMock.mockReturnValue({ status: 0 });
      await getTools().tmux_send_keys.execute({
        target: "coding:1",
        keys: "C-c",
        pressEnter: false,
      });
      expect(spawnSyncMock.mock.calls[0][1]).not.toContain("Enter");
    });
  });

  describe("tmux_capture_pane", () => {
    it("captures pane output", async () => {
      execSyncMock.mockReturnValue("$ npm test\nPASS all tests\n");
      const result = await getTools().tmux_capture_pane.execute({
        target: "coding:1.0",
      });
      expect(result.ok).toBe(true);
      expect(result.output).toContain("PASS all tests");
      expect(result.lines).toBe(200);
    });

    it("uses custom line count", async () => {
      execSyncMock.mockReturnValue("output\n");
      const result = await getTools().tmux_capture_pane.execute({
        target: "coding:1",
        lines: 500,
      });
      expect(result.ok).toBe(true);
      expect(result.lines).toBe(500);
      // Verify the capture command includes the custom line count
      expect(execSyncMock.mock.calls[0][0]).toContain("-S -500");
    });

    it("returns error when capture fails", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("can't find pane");
      });
      const result = await getTools().tmux_capture_pane.execute({
        target: "nonexistent:1.0",
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("can't find pane");
    });
  });

  describe("tmux_list", () => {
    it("lists all sessions when no sessionName given", async () => {
      execSyncMock.mockReturnValue("coding\ndev\n");
      const result = await getTools().tmux_list.execute({});
      expect(result.ok).toBe(true);
      expect(result.sessions).toEqual(["coding", "dev"]);
    });

    it("lists windows and panes for a given session", async () => {
      execSyncMock
        .mockReturnValueOnce("0 bash\n1 cursor")
        .mockReturnValueOnce("0.0 bash\n1.0 agent");
      const result = await getTools().tmux_list.execute({
        sessionName: "coding",
      });
      expect(result.ok).toBe(true);
      expect(result.windows).toEqual(["0 bash", "1 cursor"]);
      expect(result.panes).toEqual(["0.0 bash", "1.0 agent"]);
    });

    it("returns empty arrays when no sessions exist", async () => {
      execSyncMock.mockReturnValue("");
      const result = await getTools().tmux_list.execute({});
      expect(result.ok).toBe(true);
      expect(result.sessions).toEqual([]);
    });
  });

  describe("tmux_run", () => {
    it("runs a command and captures output", async () => {
      // First execSync: has-session or create
      execSyncMock.mockReturnValue("$ echo hello\nhello\n");
      // spawnSync: cd + send-keys
      spawnSyncMock.mockReturnValue({ status: 0 });

      const result = await getTools().tmux_run.execute({
        sessionName: "test",
        command: "echo hello",
        waitSeconds: 1,
      });
      expect(result.ok).toBe(true);
      expect(result.sessionName).toBe("test");
    });

    it("returns error when tmux fails", async () => {
      execSyncMock.mockImplementation(() => {
        throw new Error("tmux not found");
      });
      const result = await getTools().tmux_run.execute({
        sessionName: "test",
        command: "echo hello",
        waitSeconds: 1,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain("tmux not found");
    });
  });

  describe("tool registry completeness", () => {
    it("exports all 12 expected tools", () => {
      const tools = getTools();
      const expectedTools = [
        "tmux_install_check",
        "tmux_new_session",
        "tmux_kill_session",
        "tmux_rename_session",
        "tmux_new_window",
        "tmux_kill_window",
        "tmux_rename_window",
        "tmux_split_pane",
        "tmux_send_keys",
        "tmux_capture_pane",
        "tmux_list",
        "tmux_run",
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
