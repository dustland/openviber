/**
 * Viber Stories — pre-built one-time workflows for new vibers.
 */
import type { TemplateParam } from "$lib/data/template-utils";

export interface TaskTemplate {
  id: string;
  label: string;
  description: string;
  /** Lucide icon name hint (rendered by the consumer) */
  icon: "palette" | "sparkles";
  promptTemplate: string;
  params?: TemplateParam[];
}

const PRIMARY_TOOL_OPTIONS = [
  { value: "cursor-agent", label: "Cursor Agent CLI" },
  { value: "codex-cli", label: "Codex CLI" },
  { value: "gemini-cli", label: "Gemini CLI" },
];

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "beautify-homepage",
    label: "Beautify Homepage",
    description: "One-time homepage polish with modern UI improvements",
    icon: "palette",
    params: [
      {
        id: "targetRepo",
        label: "Target GitHub repo",
        description: "Owner/name or full GitHub URL",
        type: "text",
        required: true,
        placeholder: "acme/website",
      },
      {
        id: "primaryTool",
        label: "Primary AI coding tool",
        type: "select",
        options: PRIMARY_TOOL_OPTIONS,
        defaultValue: "cursor-agent",
      },
    ],
    promptTemplate: `You are running a one-time design polish task.

Target repo: {{targetRepo}}
Primary AI coding tool: {{primaryTool}}

Goal: Beautify the homepage while preserving existing content and functionality.

Workflow:
1. Open the repo and locate the homepage entry (e.g. pages/index, app/page).
2. Review layout, typography, spacing, and color usage.
3. Implement a clean visual refresh (improve hierarchy, spacing, CTA emphasis, responsive tweaks).
4. Use the {{primaryTool}} skill for code changes when helpful; otherwise edit directly.
5. Run available tests or lint, then summarize changes with files touched.

Constraints:
- Keep changes scoped to the homepage and shared styles.
- Avoid new dependencies without approval.
- Check mobile layout and accessibility basics (contrast, focus states).`,
  },
];
