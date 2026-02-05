/**
 * FileTool using unified decorator for cleaner code
 */

import { z } from "zod";
import { promises as fs } from "fs";
import * as path from "path";
import {
  Tool,
  ToolFunction,
  ToolMetadata,
  ToolConfig,
  ConfigSchema,
} from "./base";

export class FileTool extends Tool {
  private config: ToolConfig = {
    basePath: process.cwd(),
    allowAbsolutePaths: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedExtensions: null, // null means all extensions allowed
    excludedPaths: [".git", "node_modules", ".env"],
  };

  getMetadata(): ToolMetadata {
    return {
      id: "file",
      name: "File System Tools",
      description:
        "Read, write, manage and manipulate files and directories in the local file system",
      category: "file",
    };
  }

  getConfigSchema(): ConfigSchema {
    return {
      basePath: {
        name: "Base Path",
        type: "string",
        description: "Base directory for file operations",
        defaultValue: process.cwd(),
        required: false,
      },
      allowAbsolutePaths: {
        name: "Allow Absolute Paths",
        type: "boolean",
        description:
          "Allow operations on absolute paths outside the base directory",
        defaultValue: false,
        required: false,
      },
      maxFileSize: {
        name: "Max File Size",
        type: "number",
        description: "Maximum file size in bytes",
        defaultValue: 10485760, // 10MB
        required: false,
      },
      allowedExtensions: {
        name: "Allowed Extensions",
        type: "array",
        description:
          "List of allowed file extensions (leave empty to allow all)",
        defaultValue: null,
        required: false,
      },
      excludedPaths: {
        name: "Excluded Paths",
        type: "array",
        description: "Directories and paths to exclude from operations",
        defaultValue: [".git", "node_modules", ".env"],
        required: false,
      },
    };
  }

  getConfig(): ToolConfig {
    return this.config;
  }

  setConfig(config: ToolConfig): void {
    this.config = { ...this.config, ...config };
  }

  private getBasePath(): string {
    // If we have a space ID, use the space's artifacts directory
    if (this.spaceId) {
      return this.getSpaceArtifactsPath();
    }
    return this.config.basePath || process.cwd();
  }

  private resolvePath(filePath: string): string {
    // If we have space context, use artifact-aware path resolution
    if (this.spaceId) {
      return this.resolveArtifactPath(filePath);
    }

    // Fallback to original logic for non-space context
    if (path.isAbsolute(filePath)) {
      if (!this.config.allowAbsolutePaths) {
        throw new Error(
          "Absolute paths are not allowed. Please use relative paths or enable allowAbsolutePaths in configuration."
        );
      }
      return filePath;
    }
    return path.join(this.getBasePath(), filePath);
  }

  @ToolFunction({
    description:
      "Create a new file or overwrite an existing file with the specified content. Creates parent directories if they don't exist.",
    input: z.object({
      path: z
        .string()
        .describe(
          "The file path to create or overwrite (relative or absolute)"
        ),
      content: z.string().describe("The content to write to the file"),
      encoding: z
        .enum(["utf8", "base64"])
        .optional()
        .default("utf8")
        .describe(
          "The encoding format for the file content (utf8 for text, base64 for binary)"
        ),
    }),
  })
  async create_file(input: {
    path: string;
    content: string;
    encoding?: "utf8" | "base64";
  }) {
    // Use base class method for space context
    if (this.spaceId) {
      await this.writeArtifactFile(input.path, input.content, input.encoding || "utf8");
      return {
        success: true,
        path: input.path,
        size: Buffer.byteLength(input.content, input.encoding || "utf8"),
      };
    }

    // Fallback to fs for non-space operations
    const fullPath = this.resolvePath(input.path);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, input.content, input.encoding || "utf8");

    return {
      success: true,
      path: fullPath,
      size: Buffer.byteLength(input.content, input.encoding || "utf8"),
    };
  }

  @ToolFunction({
    description:
      "Read the contents of a file from the file system. Returns the file content along with metadata like size and modification time.",
    input: z.object({
      path: z.string().describe("The file path to read (relative or absolute)"),
      encoding: z
        .enum(["utf8", "base64"])
        .optional()
        .default("utf8")
        .describe(
          "The encoding to use when reading the file (utf8 for text files, base64 for binary files)"
        ),
    }),
  })
  async read_file(input: { path: string; encoding?: "utf8" | "base64" }) {
    // Use base class method for space context
    if (this.spaceId) {
      const content = await this.readArtifactFile(input.path, input.encoding || "utf8");
      const stats = await this.getArtifactFileStats(input.path);
      return {
        content,
        path: input.path,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    }

    // Fallback to fs for non-space operations
    const fullPath = this.resolvePath(input.path);

    const content = await fs.readFile(fullPath, input.encoding || "utf8");
    const stats = await fs.stat(fullPath);

    return {
      content,
      path: fullPath,
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };
  }

  @ToolFunction({
    description:
      "Delete a file from the file system. This operation is irreversible. The file must exist or an error will be thrown.",
    input: z.object({
      path: z
        .string()
        .describe("The file path to delete (relative or absolute)"),
    }),
  })
  async delete_file(input: { path: string }) {
    // Use base class method for space context
    if (this.spaceId) {
      await this.deleteArtifactFile(input.path);
      return {
        success: true,
        path: input.path,
      };
    }

    // Fallback to fs for non-space operations
    const fullPath = this.resolvePath(input.path);

    await fs.unlink(fullPath);

    return {
      success: true,
      path: fullPath,
    };
  }

  @ToolFunction({
    description:
      "List all files in a directory with optional recursive traversal and pattern filtering. Returns an array of file paths.",
    input: z.object({
      directory: z
        .string()
        .describe(
          "The directory path to list files from (relative or absolute)"
        ),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to recursively list files in subdirectories"),
      pattern: z
        .string()
        .optional()
        .describe(
          "Optional pattern to filter files (simple string matching, not full glob)"
        ),
    }),
  })
  async list_files(input: {
    directory: string;
    recursive?: boolean;
    pattern?: string;
  }) {
    // Use base class method for space context
    if (this.spaceId) {
      let files = await this.listArtifactFiles(input.directory, input.recursive || false);

      // Apply pattern filter if provided
      if (input.pattern) {
        files = files.filter((file) => file.includes(input.pattern!));
      }

      return {
        directory: input.directory,
        files,
        count: files.length,
      };
    }

    // Fallback to fs for non-space operations
    const fullPath = this.resolvePath(input.directory);

    const files: string[] = [];

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory() && input.recursive) {
          await walk(entryPath);
        } else if (entry.isFile()) {
          // Apply pattern filter if provided
          if (!input.pattern || entryPath.includes(input.pattern)) {
            files.push(entryPath);
          }
        }
      }
    }

    await walk(fullPath);

    return {
      directory: fullPath,
      files,
      count: files.length,
    };
  }

  @ToolFunction({
    description:
      "Move or rename a file from one location to another. Creates parent directories if needed. The source file will no longer exist after this operation.",
    input: z.object({
      source: z
        .string()
        .describe("The source file path to move from (relative or absolute)"),
      destination: z
        .string()
        .describe(
          "The destination file path to move to (relative or absolute)"
        ),
    }),
  })
  async move_file(input: { source: string; destination: string }) {
    // Use base class method for space context
    if (this.spaceId) {
      await this.moveArtifactFile(input.source, input.destination);
      return {
        success: true,
        source: input.source,
        destination: input.destination,
      };
    }

    // Fallback to fs for non-space operations
    const sourcePath = this.resolvePath(input.source);
    const destPath = this.resolvePath(input.destination);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(sourcePath, destPath);

    return {
      success: true,
      source: sourcePath,
      destination: destPath,
    };
  }

  @ToolFunction({
    description:
      "Copy a file from one location to another. Creates parent directories if needed. The source file remains unchanged.",
    input: z.object({
      source: z
        .string()
        .describe("The source file path to copy from (relative or absolute)"),
      destination: z
        .string()
        .describe(
          "The destination file path to copy to (relative or absolute)"
        ),
    }),
  })
  async copy_file(input: { source: string; destination: string }) {
    // Use base class method for space context
    if (this.spaceId) {
      await this.copyArtifactFile(input.source, input.destination);
      return {
        success: true,
        source: input.source,
        destination: input.destination,
      };
    }

    // Fallback to fs for non-space operations
    const sourcePath = this.resolvePath(input.source);
    const destPath = this.resolvePath(input.destination);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.copyFile(sourcePath, destPath);

    return {
      success: true,
      source: sourcePath,
      destination: destPath,
    };
  }

  @ToolFunction({
    description:
      "Check if a file or directory exists at the specified path. Returns existence status and file metadata if it exists.",
    input: z.object({
      path: z
        .string()
        .describe("The file or directory path to check (relative or absolute)"),
    }),
  })
  async file_exists(input: { path: string }) {
    const fullPath = this.resolvePath(input.path);

    try {
      // Use base class method for space-aware file existence check when in space context
      if (this.spaceId) {
        const exists = await this.artifactFileExists(input.path);
        if (exists) {
          const stats = await this.getArtifactFileStats(input.path);
          return {
            exists: true,
            path: fullPath,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            size: stats.size,
          };
        } else {
          return {
            exists: false,
            path: fullPath,
          };
        }
      }

      // Fallback for non-space context
      await fs.access(fullPath);
      const stats = await fs.stat(fullPath);

      return {
        exists: true,
        path: fullPath,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
      };
    } catch {
      return {
        exists: false,
        path: fullPath,
      };
    }
  }
}
