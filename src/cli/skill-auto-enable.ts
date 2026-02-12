import type { SkillHealthReport } from "../skills/health";

/**
 * Collect skill IDs whose required OAuth checks are satisfied.
 *
 * This lets standalone startup enable OAuth-backed skills generically
 * after tokens are configured, without hard-coding specific skill IDs.
 */
export function collectOauthReadySkillIds(report: SkillHealthReport): string[] {
  return report.skills
    .filter((skill) =>
      skill.checks.some(
        (check) =>
          check.actionType === "oauth" &&
          (check.required ?? true) &&
          check.ok,
      ),
    )
    .map((skill) => skill.id);
}
