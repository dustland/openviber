/**
 * Artifact Management for Viber
 *
 * Provides a simple interface for managing space artifacts
 * (documents, images, and other files) within the Viber system
 */

import { SpaceStorage } from "../storage/space";
import path from "path";

export interface ArtifactMetadata {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  description?: string;
}

export class ArtifactManager {
  constructor(private spaceStorage: SpaceStorage) { }

  /**
   * Save an artifact to the space
   */
  async saveArtifact(
    filename: string,
    content: Buffer | string,
    metadata?: Partial<ArtifactMetadata>
  ): Promise<ArtifactMetadata> {
    const buffer =
      typeof content === "string" ? Buffer.from(content, "utf8") : content;

    const artifactPath = `artifacts/${filename}`;
    const mimeType = metadata?.mimeType || this.getMimeType(filename);

    await this.spaceStorage.saveArtifact(filename, buffer, {
      mimeType,
      size: buffer.length,
    });

    return {
      name: filename,
      path: artifactPath,
      mimeType,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      ...metadata,
    };
  }

  /**
   * Get an artifact from the space
   */
  async getArtifact(filename: string): Promise<Buffer | null> {
    try {
      const artifactPath = `artifacts/${filename}`;
      const fullPath = path.join(
        this.spaceStorage.getSpacePath(),
        artifactPath
      );
      const fs = await import("fs/promises");
      return await fs.readFile(fullPath);
    } catch (error) {
      console.error(
        `[ArtifactManager] Failed to get artifact ${filename}:`,
        error
      );
      return null;
    }
  }

  /**
   * List all artifacts in the space
   */
  async listArtifacts(): Promise<ArtifactMetadata[]> {
    const metadata = await this.spaceStorage.getMetadata();
    return metadata?.artifacts || [];
  }

  /**
   * Delete an artifact
   */
  async deleteArtifact(filename: string): Promise<boolean> {
    try {
      const artifactPath = `artifacts/${filename}`;
      const fullPath = path.join(
        this.spaceStorage.getSpacePath(),
        artifactPath
      );
      const fs = await import("fs/promises");
      await fs.unlink(fullPath);

      // Update metadata
      const metadata = await this.spaceStorage.getMetadata();
      if (metadata?.artifacts) {
        metadata.artifacts = metadata.artifacts.filter(
          (a: any) => a.name !== filename
        );
        await this.spaceStorage.saveMetadata(metadata);
      }

      return true;
    } catch (error) {
      console.error(
        `[ArtifactManager] Failed to delete artifact ${filename}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }
}
