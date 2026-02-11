import path from "path";
import { fileURLToPath } from "url";

/**
 * Resolve the current module directory in both ESM and CJS runtimes.
 */
export function getModuleDirname(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }

  try {
    const metaUrl = (0, eval)("import.meta.url") as string | undefined;
    if (metaUrl) {
      return path.dirname(fileURLToPath(metaUrl));
    }
  } catch {
    // Ignore environments where import.meta is unavailable.
  }

  return process.cwd();
}
