/**
 * Core Storage Bridge
 * Simple bridge to storage implementations
 * NO business logic here - just storage access
 */

import path from "path";
import { getViberRoot } from "../config";
import { BaseStorage, StorageAdapter } from "../storage/base";
// LocalStorageAdapter is imported dynamically to avoid bundling Node.js fs module in client

/**
 * Storage factory and manager
 * Creates appropriate storage instances for different purposes
 */
export class Storage {
  private static adapter: StorageAdapter;
  private static rootPath: string;

  /**
   * Initialize storage system
   */
  static initialize(adapter?: StorageAdapter, rootPath?: string) {
    if (adapter) {
      this.adapter = adapter;
    } else {
      // Only create LocalStorageAdapter on server
      if (typeof window === "undefined") {
        // Dynamic import to avoid bundling fs in client
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { LocalStorageAdapter } = require("../storage/adapters/local");
        this.adapter = new LocalStorageAdapter();
      } else {
        throw new Error(
          "LocalStorageAdapter cannot be used in client code. Provide a client-compatible adapter."
        );
      }
    }
    this.rootPath = rootPath || getViberRoot();
  }

  /**
   * Get storage adapter
   */
  static getAdapter(): StorageAdapter {
    if (!this.adapter) {
      this.initialize();
    }
    return this.adapter;
  }

  /**
   * Get root path
   */
  static getRootPath(): string {
    if (!this.rootPath) {
      this.initialize();
    }
    return this.rootPath;
  }

  /**
   * Create a storage instance for a specific subdirectory
   */
  static create(subPath: string = ""): BaseStorage {
    const fullPath = path.join(this.getRootPath(), subPath);
    return new BaseStorage(fullPath, this.getAdapter());
  }

  /**
   * Get root storage (for top-level directories like agents)
   */
  static getRootStorage(): BaseStorage {
    return this.create("");
  }

  /**
   * Get config storage (for all configuration files)
   */
  static getConfigStorage(): BaseStorage {
    return this.create("config");
  }

  /**
   * Get defaults storage (for default templates, agents, etc.)
   */
  static getDefaultsStorage(): BaseStorage {
    return this.create("defaults");
  }

  /**
   * @deprecated Use getDefaultsStorage() instead
   */
  static getHubStorage(): BaseStorage {
    return this.getDefaultsStorage();
  }

  /**
   * Get space storage (for space-specific files)
   */
  static getSpaceStorage(spaceId: string): BaseStorage {
    return this.create(path.join("spaces", spaceId));
  }
}
