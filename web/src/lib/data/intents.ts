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
}

/**
 * Built-in intents that ship with OpenViber.
 * Users can create their own in Settings → Intents.
 */
export const BUILTIN_INTENTS: Intent[] = [
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
