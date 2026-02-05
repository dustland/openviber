/**
 * FileTool - File system operations
 *
 * Provides tools for reading, writing, and managing files on the local filesystem.
 * Operates directly on the filesystem without space-aware storage.
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
    allowedExtensions: null,
    excludedPaths: [".git", "node_modules", ".env"],
  };

  getMetadata(): ToolMetadata {
    return {
      id: "file",
      name: "File System Tools",
      description: "Read, write, and manage files on the local filesystem",
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
        description: "Allow operations on absolute paths outside the base directory",
        defaultValue: false,
        required: false,
      },
      maxFileSize: {
        name: "Max File Size",
        type: "number",
        description: "Maximum file size in bytes",
        defaultValue: 10485760,
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
    return this.config.basePath || process.cwd();
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      if (!this.config.allowAbsolutePaths) {
        throw new Error(
          "Absolute paths are not allowed. Please use relative paths or enable allowAbsolutePaths."
        );
      }
      return filePath;
    }
    return path.join(this.getBasePath(), filePath);
  }

  @ToolFunction({
    description: "Create a new file or overwrite an existing file with content",
    input: z.object({
      path: z.string().describe("The file path to create or overwrite"),
      content: z.string().describe("The content to write to the file"),
      encoding: z
        .enum(["utf8", "base64"])
        .optional()
        .default("utf8")
        .describe("The encoding format (utf8 for text, base64 for binary)"),
    }),
  })
  async create_file(input: {
    path: string;
    content: string;
    encoding?: "utf8" | "base64";
  }) {
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
    description: "Read the contents of a file",
    input: z.object({
      path: z.string().describe("The file path to read"),
      encoding: z
        .enum(["utf8", "base64"])
        .optional()
        .default("utf8")
        .describe("The encoding to use when reading"),
    }),
  })
  async read_file(input: { path: string; encoding?: "utf8" | "base64" }) {
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
    description: "Delete a file from the file system",
    input: z.object({
      path: z.string().describe("The file path to delete"),
    }),
  })
  async delete_file(input: { path: string }) {
    const fullPath = this.resolvePath(input.path);

    await fs.unlink(fullPath);

    return {
      success: true,
      path: fullPath,
    };
  }

  @ToolFunction({
    description: "List all files in a directory",
    input: z.object({
      directory: z.string().describe("The directory path to list files from"),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to recursively list files in subdirectories"),
      pattern: z
        .string()
        .optional()
        .describe("Optional pattern to filter files"),
    }),
  })
  async list_files(input: {
    directory: string;
    recursive?: boolean;
    pattern?: string;
  }) {
    const fullPath = this.resolvePath(input.directory);

    const files: string[] = [];

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory() && input.recursive) {
          await walk(entryPath);
        } else if (entry.isFile()) {
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
    description: "Move or rename a file",
    input: z.object({
      source: z.string().describe("The source file path"),
      destination: z.string().describe("The destination file path"),
    }),
  })
  async move_file(input: { source: string; destination: string }) {
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
    description: "Copy a file from one location to another",
    input: z.object({
      source: z.string().describe("The source file path"),
      destination: z.string().describe("The destination file path"),
    }),
  })
  async copy_file(input: { source: string; destination: string }) {
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
    description: "Check if a file or directory exists",
    input: z.object({
      path: z.string().describe("The file or directory path to check"),
    }),
  })
  async file_exists(input: { path: string }) {
    const fullPath = this.resolvePath(input.path);

    try {
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
