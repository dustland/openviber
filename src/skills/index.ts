import { defaultRegistry } from "./registry";
import { getTools as getAntigravityTools } from "./antigravity";
import { getTools as getCursorAgentTools } from "./cursor-agent";
import { getTools as getCodexCliTools } from "./codex-cli";
import { getTools as getGithubTools } from "./github";
import { getTools as getTmuxTools } from "./tmux";

// Register default skills and their tools
// This is called during module initialization to pre-register tools
// that would otherwise fail to load at runtime (Node.js can't import .ts files)
export function registerDefaultSkills() {
  // Pre-register antigravity tools so they're available at runtime
  defaultRegistry.preRegisterTools("antigravity", getAntigravityTools());
  // Pre-register cursor-agent tools (run Cursor CLI via tmux)
  defaultRegistry.preRegisterTools("cursor-agent", getCursorAgentTools());
  // Pre-register codex-cli tools (run Codex CLI via tmux)
  defaultRegistry.preRegisterTools("codex-cli", getCodexCliTools());
  // Pre-register github tools (gh CLI for issues, PRs, branches)
  defaultRegistry.preRegisterTools("github", getGithubTools());
  // Pre-register tmux tools (run commands in tmux, check install)
  defaultRegistry.preRegisterTools("tmux", getTmuxTools());
}

// Auto-register on import
registerDefaultSkills();

