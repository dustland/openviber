/**
 * Integration tests for terminal runtime adapters.
 *
 * Verifies tmux-first behavior and fallback adapter support for extending
 * Viber Board use cases across terminal-like app runtimes.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { TerminalManager } from "./terminal";

function hasTmux(): boolean {
  try {
    execSync("tmux -V", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("terminal manager integration", () => {
  it("lists app metadata and keeps tmux as the primary adapter", () => {
    const manager = new TerminalManager();
    const result = manager.list();

    expect(result.apps.length).toBeGreaterThanOrEqual(2);
    expect(result.apps.some((app) => app.id === "tmux")).toBe(true);
    expect(result.apps.some((app) => app.id === "shell")).toBe(true);
  });

  it("creates and drives shell sessions as fallback app", async () => {
    const manager = new TerminalManager();
    const created = manager.createSession("integration-shell", "main", process.cwd(), "shell");

    expect(created.ok).toBe(true);
    expect(created.appId).toBe("shell");

    const listed = manager.list();
    const pane = listed.panes.find((p) => p.appId === "shell" && p.session === created.sessionName);
    expect(pane).toBeDefined();

    const attached = await manager.attach(
      pane!.target,
      () => {
        // no-op
      },
      () => {
        // no-op
      },
      "shell",
    );

    expect(attached).toBe(true);
    expect(manager.sendInput(pane!.target, "echo VIBER_SHELL_TEST\n", "shell")).toBe(true);
    expect(manager.resize(pane!.target, 120, 40, "shell")).toBe(true);

    manager.detachAll();
  });

  it.skipIf(!hasTmux())("creates tmux session and routes input/resize", async () => {
    const manager = new TerminalManager();
    const created = manager.createSession("integration-tmux", "main", process.cwd(), "tmux");
    expect(created.ok).toBe(true);

    const listed = manager.list();
    const pane = listed.panes.find((p) => p.appId === "tmux" && p.session === created.sessionName);
    expect(pane).toBeDefined();

    const attached = await manager.attach(
      pane!.target,
      () => {
        // no-op
      },
      () => {
        // no-op
      },
      "tmux",
    );
    expect(attached).toBe(true);

    expect(manager.sendInput(pane!.target, "echo VIBER_TMUX_TEST\n", "tmux")).toBe(true);
    expect(manager.resize(pane!.target, 120, 40, "tmux")).toBe(true);

    manager.detachAll();
    execSync(`tmux kill-session -t '${created.sessionName}'`, { stdio: "pipe" });
  });
});
