import * as path from "path";

/**
 * Security utilities for OpenViber
 * Handles path sandboxing and command sanitization
 */

export class SecurityGuard {
  private workspaceRoot: string;
  private allowedCommands: RegExp[] | null = null; // null means all allowed except blocked
  private blockedCommands: RegExp[] = [
    // Dangerous system modification
    /\brm\s+(-r|-f|-rf|-fr)\s+\//, // rm -rf /
    /\bmkfs/, // format disk
    /\bdd\b/, // low-level copy
    /\bchown\b/, // change ownership
    /\bchmod\b/, // change permissions (broadly)
    /:(){:|:&};:/, // fork bomb
    /\bwget\b/, // download (use specialized tool instead)
    /\bcurl\b/, // download (use specialized tool instead)
    /\bssh\b/, // remote connection (use specialized tool)
    /\bsudo\b/, // privilege escalation
  ];

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Validate that a path is within the workspace
   * Returns the resolved absolute path if valid, throws error if not
   */
  validatePath(targetPath: string, allowAbsolute = false): string {
    if (targetPath.includes("\0")) {
      throw new Error("Security Error: Path contains null byte");
    }

    if (/%2e|%2f|%5c/i.test(targetPath)) {
      throw new Error("Security Error: Path contains encoded traversal");
    }

    const resolved = path.resolve(this.workspaceRoot, targetPath);

    // Check if path is within workspace
    if (!allowAbsolute) {
      const relative = path.relative(this.workspaceRoot, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(
          `Security Error: Path '${targetPath}' is outside the allowed workspace '${this.workspaceRoot}'`
        );
      }
    }

    if (!resolved.startsWith(this.workspaceRoot) && !allowAbsolute) {
      throw new Error(
        `Security Error: Path '${targetPath}' is outside the allowed workspace '${this.workspaceRoot}'`
      );
    }

    return resolved;
  }

  /**
   * Check if a shell command is safe to execute
   * Throws error if command matches denied patterns
   */
  validateCommand(command: string): void {
    const normalized = command.trim();

    // Check blocked patterns
    for (const pattern of this.blockedCommands) {
      if (pattern.test(normalized)) {
        throw new Error(
          `Security Error: Command contains blocked pattern: ${pattern}`
        );
      }
    }
  }

  /**
   * Add a custom blocked command pattern
   */
  addBlockedCommand(pattern: RegExp): void {
    this.blockedCommands.push(pattern);
  }
}
