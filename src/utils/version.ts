import { existsSync, readFileSync } from "fs";
import path from "path";
import { getModuleDirname } from "./module-path";

interface PackageJsonVersion {
  name?: string;
  version?: string;
}

let cachedVersion: string | null = null;

/**
 * Resolve the OpenViber package version from the nearest package.json.
 */
export function getOpenViberVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  let currentDir = getModuleDirname();

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const raw = readFileSync(packageJsonPath, "utf8");
        const parsed = JSON.parse(raw) as PackageJsonVersion;
        if (parsed.version && (!parsed.name || parsed.name === "openviber")) {
          cachedVersion = parsed.version;
          return cachedVersion;
        }
      } catch {
        // Keep walking up the directory tree.
      }
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  cachedVersion = "0.0.0";
  return cachedVersion;
}
