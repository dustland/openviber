import type { AgentConfig } from "./config";
import type { CoreTool } from "./tool";

export type WorkingMode = "always_ask" | "agent_decides" | "always_execute";

const MODE_ALIASES: Record<string, WorkingMode> = {
  "always_ask": "always_ask",
  "always-ask": "always_ask",
  "agent_decides": "agent_decides",
  "agent-decides": "agent_decides",
  "always_execute": "always_execute",
  "always-execute": "always_execute",
};

/**
 * Resolve the configured working mode from supported config keys.
 */
export function resolveWorkingMode(config: AgentConfig): WorkingMode {
  const rawMode = config.mode ?? config.workingMode;

  if (typeof rawMode !== "string") {
    return "agent_decides";
  }

  return MODE_ALIASES[rawMode] ?? "agent_decides";
}

/**
 * Resolve tools that require explicit approval in agent_decides mode.
 */
export function resolveRequireApprovalTools(config: AgentConfig): Set<string> {
  const configured = config.require_approval ?? config.requireApproval;
  if (!Array.isArray(configured)) {
    return new Set<string>();
  }

  return new Set(
    configured.filter((item): item is string => typeof item === "string")
  );
}

/**
 * Check whether the current request metadata includes approval for a tool.
 */
export function hasToolApproval(
  metadata: Record<string, unknown> | undefined,
  toolName: string
): boolean {
  const approvedTools = metadata?.approvedTools;
  if (!Array.isArray(approvedTools)) {
    return false;
  }

  return approvedTools.includes(toolName);
}

/**
 * Wrap tools with working-mode approval checks.
 */
export function applyWorkingModeToTools(
  tools: Record<string, CoreTool> | undefined,
  options: {
    mode: WorkingMode;
    requireApproval: Set<string>;
    metadata?: Record<string, unknown>;
  }
): Record<string, CoreTool> | undefined {
  if (!tools) return undefined;

  const { mode, requireApproval, metadata } = options;

  if (mode === "always_execute") {
    return tools;
  }

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const shouldAsk =
        mode === "always_ask" ||
        (mode === "agent_decides" && requireApproval.has(toolName));

      if (!shouldAsk) {
        return [toolName, tool];
      }

      return [
        toolName,
        {
          ...tool,
          execute: async (args: unknown, context?: unknown) => {
            if (hasToolApproval(metadata, toolName)) {
              return tool.execute(args, context);
            }

            throw new Error(
              `Approval required for tool '${toolName}'. Ask the user for confirmation and retry with metadata.approvedTools including '${toolName}'.`
            );
          },
        } satisfies CoreTool,
      ];
    })
  );
}
