import { sleep } from "./common";

export interface GatewayViberListResponse {
  connected: boolean;
  vibers: Array<{ id: string; name: string }>;
}

export interface GatewayTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  result?: unknown;
  error?: string;
}

export function normalizeGatewayUrl(gatewayUrl: string): string {
  return String(gatewayUrl || "").trim().replace(/\/$/, "");
}

export async function gatewayGetVibers(gatewayUrl: string): Promise<GatewayViberListResponse> {
  try {
    const res = await fetch(`${normalizeGatewayUrl(gatewayUrl)}/api/vibers`);
    if (!res.ok) {
      return { connected: false, vibers: [] };
    }
    const json = (await res.json()) as any;
    return {
      connected: !!json?.connected,
      vibers: Array.isArray(json?.vibers) ? json.vibers
        : Array.isArray(json?.nodes) ? json.nodes
          : [],
    };
  } catch {
    return { connected: false, vibers: [] };
  }
}

export async function gatewaySubmitTask(
  gatewayUrl: string,
  args: {
    goal: string;
    viberId: string;
    messages: Array<{ role: string; content: string }>;
  },
): Promise<{ taskId: string } | null> {
  try {
    const res = await fetch(`${normalizeGatewayUrl(gatewayUrl)}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal: args.goal,
        viberId: args.viberId,
        messages: args.messages,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  }
}

export async function gatewayGetTask(gatewayUrl: string, taskId: string): Promise<GatewayTask | null> {
  try {
    const res = await fetch(`${normalizeGatewayUrl(gatewayUrl)}/api/tasks/${taskId}`);
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  }
}

export async function pollGatewayTask(
  gatewayUrl: string,
  taskId: string,
  options: { pollIntervalMs: number; maxAttempts: number },
): Promise<GatewayTask | null> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const task = await gatewayGetTask(gatewayUrl, taskId);
    if (task && (task.status === "completed" || task.status === "error")) {
      return task;
    }
    await sleep(options.pollIntervalMs);
  }
  return await gatewayGetTask(gatewayUrl, taskId);
}
