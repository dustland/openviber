/**
 * Base Storage - Abstract storage interface for all Viber storage needs
 */

import path from "path";
import { getViberRoot } from "../config";
// LocalStorageAdapter is imported dynamically to avoid bundling Node.js fs module in client

export interface ArtifactInfo {
  id: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category?: "input" | "intermediate" | "output";
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface StorageAdapter {
  // Low-level file operations
  readFile(path: string): Promise<Buffer>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<any>;

  // High-level artifact operations (encapsulates file + metadata)
  saveArtifact(
    spaceId: string,
    artifact: ArtifactInfo,
    buffer: Buffer
  ): Promise<ArtifactInfo>;
  getArtifact(
    spaceId: string,
    artifactId: string
  ): Promise<{ info: ArtifactInfo; buffer: Buffer } | null>;
  getArtifactInfo(
    spaceId: string,
    artifactId: string
  ): Promise<ArtifactInfo | null>;
  listArtifacts(spaceId: string): Promise<ArtifactInfo[]>;
  deleteArtifact(spaceId: string, artifactId: string): Promise<void>;
}

/**
 * Base storage class with common operations
 */
export class BaseStorage {
  protected adapter: StorageAdapter;
  protected basePath: string;

  constructor(basePath?: string, adapter?: StorageAdapter) {
    this.basePath = basePath || getViberRoot();
    // If no adapter provided, we'll create one lazily (only on server)
    // For client-side, adapter must be provided explicitly
    if (adapter) {
      this.adapter = adapter;
    } else {
      // Only create LocalStorageAdapter on server
      if (typeof window === "undefined") {
        // Dynamic import to avoid bundling fs in client
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { LocalStorageAdapter } = require("./adapters/local");
        this.adapter = new LocalStorageAdapter();
      } else {
        throw new Error(
          "LocalStorageAdapter cannot be used in client code. Provide a client-compatible adapter."
        );
      }
    }
  }

  /**
   * Get full path relative to base
   */
  protected getPath(...segments: string[]): string {
    return path.join(this.basePath, ...segments);
  }

  /**
   * Initialize storage (ensure directories exist)
   */
  async initialize(): Promise<void> {
    await this.adapter.mkdir(this.basePath);
  }

  /**
   * Read JSON file
   */
  async readJSON<T = any>(relativePath: string): Promise<T | null> {
    try {
      const fullPath = this.getPath(relativePath);
      const content = await this.adapter.readTextFile(fullPath);
      return JSON.parse(content) as T;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Read YAML file
   */
  async readYaml<T = any>(relativePath: string): Promise<T | null> {
    try {
      const fullPath = this.getPath(relativePath);
      const content = await this.adapter.readTextFile(fullPath);
      const yaml = await import("yaml");
      return yaml.parse(content) as T;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write JSON file
   */
  async writeJSON(relativePath: string, data: any): Promise<void> {
    const fullPath = this.getPath(relativePath);
    const content = JSON.stringify(data, null, 2);
    await this.adapter.writeFile(fullPath, content);
  }

  /**
   * Write YAML file
   */
  async writeYaml(relativePath: string, data: any): Promise<void> {
    const fullPath = this.getPath(relativePath);
    const yaml = await import("yaml");
    const content = yaml.stringify(data);
    await this.adapter.writeFile(fullPath, content);
  }

  /**
   * Check if file exists
   */
  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.getPath(relativePath);
    return this.adapter.exists(fullPath);
  }

  /**
   * Read text file
   */
  async readTextFile(relativePath: string): Promise<string> {
    const fullPath = this.getPath(relativePath);
    return this.adapter.readTextFile(fullPath);
  }

  /**
   * Write file (text or binary)
   */
  async writeFile(relativePath: string, data: Buffer | string): Promise<void> {
    const fullPath = this.getPath(relativePath);
    await this.adapter.writeFile(fullPath, data);
  }

  /**
   * Delete file
   */
  async delete(relativePath: string): Promise<void> {
    const fullPath = this.getPath(relativePath);
    await this.adapter.deleteFile(fullPath);
  }

  /**
   * List files in directory
   */
  async list(relativePath: string = ""): Promise<string[]> {
    const fullPath = this.getPath(relativePath);
    try {
      return await this.adapter.readdir(fullPath);
    } catch {
      return [];
    }
  }

  /**
   * Create directory
   */
  async mkdir(relativePath: string): Promise<void> {
    const fullPath = this.getPath(relativePath);
    await this.adapter.mkdir(fullPath);
  }

  /**
   * Read binary file
   */
  async readFile(relativePath: string): Promise<Buffer> {
    const fullPath = this.getPath(relativePath);
    return this.adapter.readFile(fullPath);
  }

  /**
   * Copy file from one storage to another
   */
  async copyFileTo(
    relativePath: string,
    targetStorage: BaseStorage,
    targetPath: string
  ): Promise<void> {
    const fileData = await this.readFile(relativePath);
    await targetStorage.writeFile(targetPath, fileData);
  }

  /**
   * Get file statistics (size, timestamps, etc.)
   */
  async getArtifactFileStats(relativePath: string): Promise<any> {
    const fullPath = this.getPath(relativePath);
    return this.adapter.stat(fullPath);
  }
}
