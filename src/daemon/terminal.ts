/**
 * Terminal runtime abstraction.
 *
 * tmux remains the primary backend, while additional app adapters can be
 * plugged in for other execution surfaces.
 */

import { spawn, spawnSync, execSync, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export interface TerminalPane {
  appId: string;
  session: string;
  window: string;
  windowName: string;
  pane: string;
  command: string;
  target: string;
}

export interface TerminalSession {
  appId: string;
  name: string;
  windows: number;
  attached: boolean;
}

export interface CreateSessionResult {
  ok: boolean;
  appId: string;
  sessionName: string;
  created: boolean;
  error?: string;
}

export interface TerminalApp {
  id: string;
  label: string;
  isAvailable(): boolean;
  listSessions(): TerminalSession[];
  listPanes(): TerminalPane[];
  attach(
    target: string,
    onData: (data: string) => void,
    onClose: () => void,
  ): Promise<boolean>;
  detach(target: string): void;
  sendInput(target: string, keys: string): boolean;
  resize(target: string, cols: number, rows: number): boolean;
  createSession(sessionName: string, windowName?: string, cwd?: string): CreateSessionResult;
  detachAll(): void;
}

const SAFE_NAME_RE = /[^a-zA-Z0-9_.:-]/g;

function sanitizeName(input: string): string {
  return input.replace(SAFE_NAME_RE, "-");
}

function resolveAppTarget(target: string, appHint?: string): { appId: string; rawTarget: string } {
  if (target.includes("::")) {
    const [appId, ...rest] = target.split("::");
    return { appId, rawTarget: rest.join("::") };
  }
  return { appId: appHint || "tmux", rawTarget: target };
}

/** tmux app adapter */
class TmuxTerminalStream extends EventEmitter {
  private catProcess: ChildProcess | null = null;
  private pipePath: string;
  private isAttached = false;

  constructor(private target: string) {
    super();
    this.pipePath = `/tmp/viber-term-${target.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}`;
  }

  async attach(): Promise<boolean> {
    if (this.isAttached) return true;

    try {
      const history = captureTmuxPane(this.target, 200);
      if (history) {
        this.emit("data", history);
      }

      execSync(`mkfifo '${this.pipePath}' 2>/dev/null || true`, { stdio: "pipe" });

      this.catProcess = spawn("cat", [this.pipePath], {
        stdio: ["ignore", "pipe", "ignore"],
      });

      this.catProcess.stdout?.on("data", (chunk: Buffer) => {
        this.emit("data", chunk.toString());
      });

      this.catProcess.on("close", () => {
        this.cleanup();
      });

      this.catProcess.on("error", (err) => {
        this.emit("error", err);
        this.cleanup();
      });

      execSync(`tmux pipe-pane -t '${this.target}' -o 'cat >> ${this.pipePath}'`, {
        encoding: "utf8",
        stdio: "pipe",
      });

      this.isAttached = true;
      return true;
    } catch (err) {
      this.emit("error", err);
      this.cleanup();
      return false;
    }
  }

  detach(): void {
    if (!this.isAttached) return;
    try {
      execSync(`tmux pipe-pane -t '${this.target}'`, { stdio: "pipe" });
    } catch {
      // ignore
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isAttached = false;
    if (this.catProcess) {
      this.catProcess.kill();
      this.catProcess = null;
    }
    try {
      execSync(`rm -f '${this.pipePath}'`, { stdio: "pipe" });
    } catch {
      // ignore
    }
    this.emit("close");
  }

  get attached(): boolean {
    return this.isAttached;
  }
}

class TmuxTerminalApp implements TerminalApp {
  id = "tmux";
  label = "tmux";
  private streams: Map<string, TmuxTerminalStream> = new Map();

  isAvailable(): boolean {
    try {
      execSync("tmux -V", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): TerminalSession[] {
    try {
      const out = execSync(
        "tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_attached}' 2>/dev/null",
        { encoding: "utf8", stdio: "pipe" },
      ).trim();
      if (!out) return [];
      return out.split("\n").map((line) => {
        const [name, windows, attached] = line.split("|");
        return {
          appId: this.id,
          name,
          windows: parseInt(windows, 10) || 0,
          attached: attached === "1",
        };
      });
    } catch {
      return [];
    }
  }

  listPanes(): TerminalPane[] {
    try {
      const out = execSync(
        "tmux list-panes -a -F '#{session_name}|#{window_index}|#{window_name}|#{pane_index}|#{pane_current_command}' 2>/dev/null",
        { encoding: "utf8", stdio: "pipe" },
      ).trim();
      if (!out) return [];
      return out.split("\n").map((line) => {
        const [session, window, windowName, pane, command] = line.split("|");
        return {
          appId: this.id,
          session,
          window,
          windowName,
          pane,
          command,
          target: `${session}:${window}.${pane}`,
        };
      });
    } catch {
      return [];
    }
  }

  async attach(
    target: string,
    onData: (data: string) => void,
    onClose: () => void,
  ): Promise<boolean> {
    let stream = this.streams.get(target);
    if (stream && stream.attached) {
      stream.on("data", onData);
      stream.on("close", onClose);
      return true;
    }

    stream = new TmuxTerminalStream(target);
    stream.on("data", onData);
    stream.on("close", () => {
      this.streams.delete(target);
      onClose();
    });

    const ok = await stream.attach();
    if (ok) {
      this.streams.set(target, stream);
    }
    return ok;
  }

  detach(target: string): void {
    const stream = this.streams.get(target);
    if (!stream) return;
    stream.detach();
    this.streams.delete(target);
  }

  sendInput(target: string, keys: string): boolean {
    return sendTmuxKeys(target, keys);
  }

  resize(target: string, cols: number, rows: number): boolean {
    try {
      execSync(`tmux resize-pane -t '${target}' -x ${cols} -y ${rows}`, {
        encoding: "utf8",
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  createSession(sessionName: string, windowName = "main", cwd?: string): CreateSessionResult {
    const safeSession = sanitizeName(sessionName || "coding");
    const safeWindow = sanitizeName(windowName || "main");

    try {
      execSync(`tmux has-session -t '${safeSession}' 2>/dev/null`, { stdio: "pipe" });
      return { ok: true, appId: this.id, sessionName: safeSession, created: false };
    } catch {
      // create
    }

    const args = ["new-session", "-d", "-s", safeSession, "-n", safeWindow];
    if (cwd) {
      args.push("-c", cwd);
    }

    const result = spawnSync("tmux", args, {
      encoding: "utf8",
      stdio: "pipe",
    });

    if (result.error) {
      return {
        ok: false,
        appId: this.id,
        sessionName: safeSession,
        created: false,
        error: `Failed to start tmux: ${result.error.message}`,
      };
    }

    if (result.status !== 0) {
      return {
        ok: false,
        appId: this.id,
        sessionName: safeSession,
        created: false,
        error: (result.stderr || result.stdout || "Failed to create tmux session").trim(),
      };
    }

    return { ok: true, appId: this.id, sessionName: safeSession, created: true };
  }

  detachAll(): void {
    for (const stream of this.streams.values()) {
      stream.detach();
    }
    this.streams.clear();
  }
}

interface ShellProcessState {
  proc: ChildProcess;
  sessionName: string;
  windowName: string;
  pane: string;
  history: string[];
  listeners: Set<(data: string) => void>;
  closeListeners: Set<() => void>;
}

/**
 * Lightweight process-based adapter that keeps shell sessions available for
 * environments where tmux is unavailable.
 */
class ShellTerminalApp implements TerminalApp {
  id = "shell";
  label = "shell";
  private sessions = new Map<string, ShellProcessState>();

  isAvailable(): boolean {
    return true;
  }

  listSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((state) => ({
      appId: this.id,
      name: state.sessionName,
      windows: 1,
      attached: state.listeners.size > 0,
    }));
  }

  listPanes(): TerminalPane[] {
    return Array.from(this.sessions.entries()).map(([id, state]) => ({
      appId: this.id,
      session: state.sessionName,
      window: "0",
      windowName: state.windowName,
      pane: state.pane,
      command: process.env.SHELL || "sh",
      target: id,
    }));
  }

  async attach(target: string, onData: (data: string) => void, onClose: () => void): Promise<boolean> {
    const state = this.sessions.get(target);
    if (!state) return false;

    state.listeners.add(onData);
    state.closeListeners.add(onClose);
    if (state.history.length > 0) {
      onData(state.history.join(""));
    }
    return true;
  }

  detach(target: string): void {
    const state = this.sessions.get(target);
    if (!state) return;
    state.listeners.clear();
    state.closeListeners.clear();
  }

  sendInput(target: string, keys: string): boolean {
    const state = this.sessions.get(target);
    if (!state || !state.proc.stdin?.writable) return false;
    state.proc.stdin.write(keys);
    return true;
  }

  resize(_target: string, _cols: number, _rows: number): boolean {
    return true;
  }

  createSession(sessionName: string, windowName = "main", cwd?: string): CreateSessionResult {
    const safeSession = sanitizeName(sessionName || `shell-${Date.now()}`);
    const shell = process.env.SHELL || "sh";
    const target = `${safeSession}:${randomUUID().slice(0, 8)}`;

    if (this.sessions.has(target)) {
      return { ok: true, appId: this.id, sessionName: safeSession, created: false };
    }

    const proc = spawn(shell, [], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    if (!proc.pid) {
      return {
        ok: false,
        appId: this.id,
        sessionName: safeSession,
        created: false,
        error: "Failed to start shell process",
      };
    }

    const state: ShellProcessState = {
      proc,
      sessionName: safeSession,
      windowName,
      pane: "0",
      history: [],
      listeners: new Set(),
      closeListeners: new Set(),
    };

    const pushChunk = (chunk: Buffer): void => {
      const text = chunk.toString();
      state.history.push(text);
      if (state.history.length > 200) {
        state.history.shift();
      }
      for (const listener of state.listeners) {
        listener(text);
      }
    };

    proc.stdout?.on("data", pushChunk);
    proc.stderr?.on("data", pushChunk);
    proc.on("close", () => {
      for (const onClose of state.closeListeners) {
        onClose();
      }
      this.sessions.delete(target);
    });

    this.sessions.set(target, state);

    return { ok: true, appId: this.id, sessionName: safeSession, created: true };
  }

  detachAll(): void {
    for (const [id, state] of this.sessions.entries()) {
      state.proc.kill();
      this.sessions.delete(id);
    }
  }
}

function sendTmuxKeys(target: string, keys: string, pressEnter = false): boolean {
  try {
    const args = ["send-keys", "-t", target, keys];
    if (pressEnter) args.push("Enter");
    execSync(`tmux ${args.map((a) => `'${a}'`).join(" ")}`, {
      encoding: "utf8",
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

function captureTmuxPane(target: string, lines = 500): string {
  const cmds = [
    `tmux capture-pane -t '${target}' -pae -S -${lines}`,
    `tmux capture-pane -t '${target}' -pe -S -${lines}`,
  ];
  for (const cmd of cmds) {
    try {
      return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
    } catch {
      // try next fallback
    }
  }
  return "";
}

export interface TerminalListResponse {
  apps: Array<{ id: string; label: string; available: boolean }>;
  sessions: TerminalSession[];
  panes: TerminalPane[];
}

/**
 * TerminalManager multiplexes app adapters and routes operations by app id.
 */
export class TerminalManager {
  private readonly apps = new Map<string, TerminalApp>();

  constructor(adapters?: TerminalApp[]) {
    const defaultAdapters = adapters ?? [new TmuxTerminalApp(), new ShellTerminalApp()];
    for (const adapter of defaultAdapters) {
      this.apps.set(adapter.id, adapter);
    }
  }

  list(): TerminalListResponse {
    const metadata = Array.from(this.apps.values()).map((app) => ({
      id: app.id,
      label: app.label,
      available: app.isAvailable(),
    }));

    const sessions: TerminalSession[] = [];
    const panes: TerminalPane[] = [];

    for (const app of this.apps.values()) {
      if (!app.isAvailable()) continue;
      sessions.push(...app.listSessions());
      panes.push(...app.listPanes());
    }

    return { apps: metadata, sessions, panes };
  }

  async attach(
    target: string,
    onData: (data: string) => void,
    onClose: () => void,
    appHint?: string,
  ): Promise<boolean> {
    const { appId, rawTarget } = resolveAppTarget(target, appHint);
    const app = this.apps.get(appId);
    if (!app || !app.isAvailable()) return false;
    return app.attach(rawTarget, onData, onClose);
  }

  detach(target: string, appHint?: string): void {
    const { appId, rawTarget } = resolveAppTarget(target, appHint);
    this.apps.get(appId)?.detach(rawTarget);
  }

  sendInput(target: string, keys: string, appHint?: string): boolean {
    const { appId, rawTarget } = resolveAppTarget(target, appHint);
    const app = this.apps.get(appId);
    return !!app && app.isAvailable() ? app.sendInput(rawTarget, keys) : false;
  }

  resize(target: string, cols: number, rows: number, appHint?: string): boolean {
    const { appId, rawTarget } = resolveAppTarget(target, appHint);
    const app = this.apps.get(appId);
    return !!app && app.isAvailable() ? app.resize(rawTarget, cols, rows) : false;
  }

  createSession(
    sessionName: string,
    windowName = "main",
    cwd?: string,
    appId = "tmux",
  ): CreateSessionResult {
    const app = this.apps.get(appId);
    if (!app || !app.isAvailable()) {
      return {
        ok: false,
        appId,
        sessionName,
        created: false,
        error: `Terminal app '${appId}' is not available`,
      };
    }
    return app.createSession(sessionName, windowName, cwd);
  }

  detachAll(): void {
    for (const app of this.apps.values()) {
      app.detachAll();
    }
  }
}

export { TmuxTerminalApp, ShellTerminalApp };
