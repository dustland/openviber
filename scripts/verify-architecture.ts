import fs from "fs";
import path from "path";

interface BoundaryRule {
  fromPrefix: string;
  forbiddenPrefixes: string[];
  reason: string;
}

const RULES: BoundaryRule[] = [
  {
    fromPrefix: "src/viber/",
    forbiddenPrefixes: ["src/channels/", "src/gateway/", "web/"],
    reason: "viber core should not depend on transport/UI layers",
  },
  {
    fromPrefix: "src/tools/",
    forbiddenPrefixes: ["src/channels/", "web/"],
    reason: "tools should remain runtime-capability focused",
  },
  {
    fromPrefix: "src/channels/",
    forbiddenPrefixes: ["web/"],
    reason: "channel adapters should not import web app code",
  },
  {
    fromPrefix: "src/daemon/",
    forbiddenPrefixes: ["web/"],
    reason: "daemon runtime should not import web app code directly",
  },
];

const SOURCE_ROOTS = ["src", "web/src"];
const IMPORT_RE = /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](.+)["'];?\s*$/gm;

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") || fullPath.endsWith(".svelte")) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function resolveImportTarget(filePath: string, importPath: string): string | null {
  if (importPath.startsWith(".") || importPath.startsWith("..")) {
    return toPosix(path.normalize(path.join(path.dirname(filePath), importPath)));
  }
  return null;
}

function isUnderPrefix(filePath: string, prefix: string): boolean {
  return filePath.startsWith(prefix);
}

function main(): void {
  const files = SOURCE_ROOTS.flatMap((root) => (fs.existsSync(root) ? walk(root) : []));
  const violations: string[] = [];

  for (const file of files) {
    const filePosix = toPosix(file);
    const activeRules = RULES.filter((rule) => isUnderPrefix(filePosix, rule.fromPrefix));
    if (activeRules.length === 0) continue;

    const content = fs.readFileSync(file, "utf8");
    const matches = content.matchAll(IMPORT_RE);

    for (const match of matches) {
      const importPath = match[1];
      const target = resolveImportTarget(filePosix, importPath);
      if (!target) continue;

      for (const rule of activeRules) {
        for (const forbiddenPrefix of rule.forbiddenPrefixes) {
          if (target.includes(`/${forbiddenPrefix}`) || target.startsWith(forbiddenPrefix)) {
            violations.push(
              `${filePosix} imports "${importPath}" -> ${target} (forbidden: ${forbiddenPrefix}; ${rule.reason})`,
            );
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error("Architecture boundary check failed:\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log(`Architecture boundary check passed (${files.length} files scanned).`);
}

main();
