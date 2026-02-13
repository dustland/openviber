import { env } from "$env/dynamic/private";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_GOAL_PREVIEW_CHARS = 1200;

/**
 * Build a concise, user-facing task title from a raw goal message.
 * Falls back to first non-empty line when no model is available.
 */
export async function summarizeTaskTitle(
  goal: string,
  preferredModel?: string,
): Promise<string> {
  const fallback = extractDisplayName(goal);
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) return fallback;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://openviber.local",
        "X-Title": "OpenViber task title summarizer",
      },
      body: JSON.stringify({
        model: pickSummaryModel(preferredModel),
        temperature: 0.2,
        max_tokens: 40,
        messages: [
          {
            role: "system",
            content:
              "You create short task titles for a task list UI. Reply with only the title. Keep it specific, actionable, and under 8 words.",
          },
          {
            role: "user",
            content: `Task request:\n${goal.slice(0, MAX_GOAL_PREVIEW_CHARS)}\n\nReturn only the title.`,
          },
        ],
      }),
    });

    if (!response.ok) return fallback;

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return fallback;

    const sanitized = content
      .replace(/^"|"$/g, "")
      .replace(/[\r\n]+/g, " ")
      .trim();

    return sanitized ? limitWords(sanitized, 8) : fallback;
  } catch {
    return fallback;
  }
}

/** Extract a short display name from a potentially long goal text. */
export function extractDisplayName(goal: string): string {
  const firstLine = goal
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine || goal;
}

function limitWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function pickSummaryModel(preferredModel?: string): string {
  const model = preferredModel?.trim();
  if (model && model.includes("/")) return model;
  return "google/gemini-2.5-flash";
}
