import { sleep } from "./common";

export interface HubViberListResponse {
  connected: boolean;
  vibers: Array<{ id: string; name: string }>;
}

export interface HubTask {
  id: string;
  viberId: string;
  goal: string;
  status: "pending" | "running" | "completed" | "error" | "stopped";
  result?: unknown;
  error?: string;
}

export function normalizeHubUrl(hubUrl: string): string {
  return String(hubUrl || "").trim().replace(/\/$/, "");
}

export async function hubGetVibers(hubUrl: string): Promise<HubViberListResponse> {
  try {
    const res = await fetch(`${normalizeHubUrl(hubUrl)}/api/vibers`);
    if (!res.ok) {
      return { connected: false, vibers: [] };
    }
    const json = (await res.json()) as any;
    return {
      connected: !!json?.connected,
      vibers: Array.isArray(json?.vibers) ? json.vibers : [],
    };
  } catch {
    return { connected: false, vibers: [] };
  }
}

export async function hubSubmitTask(
  hubUrl: string,
  args: {
    goal: string;
    viberId: string;
    messages: Array<{ role: string; content: string }>;
  },
): Promise<{ taskId: string } | null> {
  try {
    const res = await fetch(`${normalizeHubUrl(hubUrl)}/api/vibers`, {
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

export async function hubGetTask(hubUrl: string, taskId: string): Promise<HubTask | null> {
  try {
    const res = await fetch(`${normalizeHubUrl(hubUrl)}/api/tasks/${taskId}`);
    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch {
    return null;
  }
}

export async function pollHubTask(
  hubUrl: string,
  taskId: string,
  options: { pollIntervalMs: number; maxAttempts: number },
): Promise<HubTask | null> {
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    const task = await hubGetTask(hubUrl, taskId);
    if (task && (task.status === "completed" || task.status === "error")) {
      return task;
    }
    await sleep(options.pollIntervalMs);
  }
  return await hubGetTask(hubUrl, taskId);
}
