/**
 * Regression test: web app Svelte check (layout $state fix).
 *
 * Runs the web app's svelte-check to ensure:
 * 1. No Svelte/TypeScript errors (validates e.g. bind:this vars use $state).
 * 2. The specific "non_reactive_update" error we fixed does not reappear.
 *
 * Run from repo root: pnpm test scripts/web-check.test.ts
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const webDir = path.join(repoRoot, "web");

describe("Web app Svelte check (layout reactive fix)", () => {
  it(
    "runs svelte-check on web app with 0 errors and no non_reactive_update",
    () => {
      const sync = spawnSync("pnpm", ["exec", "svelte-kit", "sync"], {
        cwd: webDir,
        encoding: "utf-8",
      });
      expect(sync.status, sync.stderr || sync.stdout).toBe(0);

      // Run without --threshold error so full diagnostics are printed to stdout/stderr
      const check = spawnSync("pnpm", ["exec", "svelte-check", "--tsconfig", "./tsconfig.json"], {
        cwd: webDir,
        encoding: "utf-8",
      });
      const combined = (check.stderr || "") + (check.stdout || "");
      expect(combined, "svelte-check should report 0 errors").toContain("0 errors");
      // Regression for +layout.svelte: bind:this={skillsButtonEl} must use $state()
      expect(
        combined,
        "+layout.svelte: skillsButtonEl must be declared with $state()",
      ).not.toContain("`skillsButtonEl` is updated");
    },
    30_000,
  );
});
