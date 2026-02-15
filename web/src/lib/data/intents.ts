/**
 * Intents — simple markdown-style descriptions of what a viber should do.
 * Each intent is a short document the user picks to pre-fill the goal.
 * The viber node resolves which skills to use based on the intent text.
 */

export interface Intent {
  id: string;
  name: string;
  /** Short one-liner shown on the card */
  description: string;
  /** Lucide icon hint */
  icon: "palette" | "sparkles" | "heart-pulse" | "users" | "shield-check" | "file-text" | "code-2" | "bug" | "train-front";
  /** The full markdown body — pasted into the goal textarea */
  body: string;
  /** Whether this is a built-in intent (vs user-created) */
  builtin?: boolean;
  /** Skills required by this intent — merged into agent config at viber creation */
  skills?: string[];
}

const KNOWN_SKILL_IDS = [
  "cursor-agent",
  "codex-cli",
  "gemini-cli",
  "github",
  "railway",
  "gmail",
  "tmux",
] as const;

const SKILL_KEYWORD_PATTERNS: Record<string, RegExp[]> = {
  "cursor-agent": [/\bcursor[-\s]?agent\b/i, /\buse cursor\b/i],
  "codex-cli": [/\bcodex(?:\s*cli)?\b/i, /\bopenai codex\b/i],
  "gemini-cli": [/\bgemini(?:\s*cli)?\b/i],
  github: [/\bgithub\b/i, /\bgh auth\b/i],
  railway: [/\brailway\b/i],
  gmail: [/\bgmail\b/i],
  tmux: [/\btmux\b/i],
};

function normalizeSkillToken(raw: string): string | null {
  const token = raw.trim().toLowerCase();
  if (!token) return null;

  if (KNOWN_SKILL_IDS.includes(token as (typeof KNOWN_SKILL_IDS)[number])) {
    return token;
  }
  if (token === "cursor" || token === "cursor agent") return "cursor-agent";
  if (token === "codex" || token === "codex cli") return "codex-cli";
  if (token === "gemini" || token === "gemini cli") return "gemini-cli";
  return null;
}

function parseDeclaredSkillsFromBody(body: string): string[] {
  const out: string[] = [];
  const lines = body.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const inlineMatch = line.match(/^(?:required\s+)?skills?\s*:\s*(.*)$/i);
    if (!inlineMatch) continue;

    const inlineValue = inlineMatch[1]?.trim() || "";
    if (inlineValue.length > 0) {
      for (const part of inlineValue.split(/[,\s]+/g)) {
        const normalized = normalizeSkillToken(part);
        if (normalized) out.push(normalized);
      }
      continue;
    }

    // Supports:
    // skills:
    // - cursor-agent
    // - github
    for (let j = i + 1; j < lines.length; j++) {
      const item = lines[j].trim();
      if (!item.startsWith("-")) break;
      const normalized = normalizeSkillToken(item.slice(1).trim());
      if (normalized) out.push(normalized);
      i = j;
    }
  }

  return out;
}

/**
 * Infer required skills from intent template data.
 * Priority:
 * 1) explicit intent.skills
 * 2) declared "skills:" section in body
 * 3) keyword detection from body text
 */
export function inferIntentSkills(intent: Pick<Intent, "skills" | "body">): string[] {
  const merged = new Set<string>();

  for (const explicit of intent.skills || []) {
    const normalized = normalizeSkillToken(explicit);
    if (normalized) merged.add(normalized);
  }

  for (const declared of parseDeclaredSkillsFromBody(intent.body || "")) {
    merged.add(declared);
  }

  const body = intent.body || "";
  for (const [skillId, patterns] of Object.entries(SKILL_KEYWORD_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(body))) {
      merged.add(skillId);
    }
  }

  return Array.from(merged);
}

/**
 * Built-in intents that ship with OpenViber.
 * Users can create their own in Settings → Intents.
 */
export const BUILTIN_INTENTS: Intent[] = [
  {
    id: "check-system-info",
    name: "Check System Info",
    description: "Inspect the viber's environment and system details",
    icon: "heart-pulse",
    builtin: true,
    body: `Check and report the system information of the current environment.

- Operating system name, version, and architecture
- Node.js / runtime version
- Available disk space and memory
- Current working directory and user
- Installed CLI tools (git, node, pnpm, etc.)
- Network connectivity status
- Any environment variables relevant to the project`,
  },
  {
    id: "beautify-homepage",
    name: "Beautify Homepage",
    description: "Polish a homepage with modern UI improvements",
    icon: "palette",
    builtin: true,
    body: `Review and polish the homepage of the target repository.

- Improve layout, typography, and spacing
- Strengthen CTA hierarchy and responsive behavior
- Preserve existing content and functionality
- Use the repo's existing framework and design system
- Keep changes scoped to the homepage and shared styles`,
  },
  {
    id: "code-review",
    name: "Code Review",
    description: "Review recent changes and suggest improvements",
    icon: "shield-check",
    builtin: true,
    body: `Review the most recent changes in this repository.

- Check for bugs, logic errors, and edge cases
- Suggest improvements to readability and maintainability
- Flag any security concerns or performance issues
- Summarize findings with file references`,
  },
  {
    id: "write-tests",
    name: "Write Tests",
    description: "Add test coverage for existing code",
    icon: "file-text",
    builtin: true,
    body: `Analyze the codebase and add meaningful test coverage.

- Identify modules and functions that lack tests
- Write unit tests for core business logic
- Add integration tests for key user flows
- Use the project's existing test framework and conventions`,
  },
  {
    id: "fix-bugs",
    name: "Fix Bugs",
    description: "Find and fix issues in the codebase",
    icon: "bug",
    builtin: true,
    body: `Investigate and fix bugs in the codebase.

- Check for common error patterns and edge cases
- Review open issues or error logs if available
- Apply targeted fixes with minimal side effects
- Verify fixes don't break existing functionality`,
  },
  {
    id: "build-feature",
    name: "Build a Feature",
    description: "Implement a new capability from scratch",
    icon: "code-2",
    builtin: true,
    body: `Build a new feature for this project.

- Understand the existing architecture and patterns
- Implement the feature following project conventions
- Add appropriate error handling and validation
- Include basic tests for the new functionality`,
  },
  {
    id: "health-monitor",
    name: "Health Monitor",
    description: "Set up periodic health checks for a service",
    icon: "heart-pulse",
    builtin: true,
    body: `Set up health monitoring for the target service.

- Check that the service is reachable and responding correctly
- Verify key endpoints return expected status codes
- Report any errors or degraded performance
- Suggest auto-recovery steps when issues are detected`,
  },
  {
    id: "railway-deploy-failures",
    name: "Railway Deploy Failures",
    description: "Check Railway deployments and summarize failures",
    icon: "train-front",
    builtin: true,
    body: `Check recent Railway deployments and summarize any failures.

- List recent deployments across services in the Railway project
- Identify any failed or crashed deployments
- Pull build logs and runtime logs for each failure
- Summarize root causes (build errors, missing env vars, OOM, crash loops, etc.)
- Suggest concrete fixes or next steps for each failure
- If all deployments are healthy, confirm the current status`,
  },
  {
    id: "gmail-deployment-errors",
    name: "Gmail Deployment Error Triage",
    description: "Scan Gmail alerts and summarize deployment failures",
    icon: "bug",
    builtin: true,
    skills: ["gmail"],
    body: `Check my Gmail for recent deployment failure alerts and summarize what is broken.

- Use gmail_search with targeted queries like:
  - newer_than:7d (subject:(deploy OR deployment OR build OR failed OR error OR crashed) OR from:(noreply@railway.app OR notifications@github.com OR alerts@))
  - Add is:unread when needed to focus on new incidents
- Read the most relevant messages with gmail_read (prioritize newest and clearly failed runs)
- Extract key details for each incident:
  - service/app name
  - environment (prod/staging/dev)
  - timestamp
  - error signature and likely root cause
  - direct links or IDs (run/deploy/build) if present
- Group duplicate alerts for the same failure chain to avoid noise
- Produce a concise triage report with:
  - active failures
  - probable causes
  - immediate next actions
  - what appears resolved or stale
- If no deployment errors are found, state that clearly and include which query windows were checked`,
  },
];
