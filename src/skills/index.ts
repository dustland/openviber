import { defaultRegistry } from "./registry";
import { getTools as getAntigravityTools } from "./antigravity";
import { getTools as getCursorAgentTools } from "./cursor-agent";
import { getTools as getCodexCliTools } from "./codex-cli";
import { getTools as getGeminiCliTools } from "./gemini-cli";
import { getTools as getGithubTools } from "./github";
import { getTools as getTerminalTools } from "./terminal";
import { getTools as getRailwayTools } from "./railway";
import { getTools as getGmailTools } from "./gmail";
import { getTools as getPlaygroundTools } from "./playground";
import { getTools as getSystemInfoTools } from "./system-info";
import { getTools as getSysTelemetryTools } from "./sys-telemetry";

// Register default skills and their tools
// This is called during module initialization to pre-register tools
// that would otherwise fail to load at runtime (Node.js can't import .ts files)
export function registerDefaultSkills() {
  // Pre-register antigravity tools so they're available at runtime
  defaultRegistry.preRegisterTools("antigravity", getAntigravityTools());
  // Pre-register cursor-agent tools (run Cursor CLI in a terminal session)
  defaultRegistry.preRegisterTools("cursor-agent", getCursorAgentTools());
  // Pre-register codex-cli tools (run Codex CLI via non-interactive codex exec)
  defaultRegistry.preRegisterTools("codex-cli", getCodexCliTools());
  // Pre-register gemini-cli tools (run Gemini CLI via headless gemini --prompt)
  defaultRegistry.preRegisterTools("gemini-cli", getGeminiCliTools());
  // Pre-register github tools (gh CLI for issues, PRs, branches)
  defaultRegistry.preRegisterTools("github", getGithubTools());
  // Pre-register terminal tools (persistent terminal sessions, backed by tmux)
  defaultRegistry.preRegisterTools("terminal", getTerminalTools());
  // Pre-register railway tools (deployment status, logs, build logs)
  defaultRegistry.preRegisterTools("railway", getRailwayTools());
  // Pre-register gmail tools (Gmail search, read, send via Google API + OAuth)
  defaultRegistry.preRegisterTools("gmail", getGmailTools());
  // Pre-register skill playground tools (verify skills end-to-end)
  defaultRegistry.preRegisterTools("skill-playground", getPlaygroundTools());
  // Pre-register system-info tools (CPU, memory, disk, processes, network)
  defaultRegistry.preRegisterTools("system-info", getSystemInfoTools());
  // Pre-register sys-telemetry alias tools (same surface as system-info)
  defaultRegistry.preRegisterTools("sys-telemetry", getSysTelemetryTools());
}
