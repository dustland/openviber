/**
 * Local filesystem adapter for storage
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter, ArtifactInfo } from '../base';

/**
 * Local filesystem adapter
 */
export class LocalStorageAdapter implements StorageAdapter {
  async readFile(filepath: string): Promise<Buffer> {
    return fs.readFile(filepath);
  }

  async readTextFile(filepath: string): Promise<string> {
    return fs.readFile(filepath, 'utf8');
  }

  async writeFile(filepath: string, data: Buffer | string): Promise<void> {
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filepath, data, typeof data === 'string' ? 'utf8' : undefined);
  }

  async deleteFile(filepath: string): Promise<void> {
    await fs.unlink(filepath);
  }

  async exists(filepath: string): Promise<boolean> {
    try {
      await fs.access(filepath);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirpath: string): Promise<void> {
    await fs.mkdir(dirpath, { recursive: true });
  }

  async readdir(dirpath: string): Promise<string[]> {
    return fs.readdir(dirpath);
  }

  async stat(filepath: string): Promise<any> {
    return fs.stat(filepath);
  }

  // ==================== Artifact Operations ====================
  
  async saveArtifact(spaceId: string, artifact: ArtifactInfo, buffer: Buffer): Promise<ArtifactInfo> {
    // Determine base directory for this space
    const baseDir = path.join(process.cwd(), '.viber', 'spaces', spaceId);
    
    // Save file
    const filePath = path.join(baseDir, 'artifacts', artifact.storageKey);
    await this.writeFile(filePath, buffer);
    
    // Save metadata to artifacts.json
    const metadataPath = path.join(baseDir, 'artifacts.json');
    let artifacts: ArtifactInfo[] = [];
    
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      artifacts = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }
    
    // Add or update artifact
    const index = artifacts.findIndex(a => a.id === artifact.id);
    const artifactInfo: ArtifactInfo = {
      ...artifact,
      createdAt: artifact.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    if (index >= 0) {
      artifacts[index] = artifactInfo;
    } else {
      artifacts.push(artifactInfo);
    }
    
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(artifacts, null, 2));
    
    return artifactInfo;
  }
  
  async getArtifact(spaceId: string, artifactId: string): Promise<{ info: ArtifactInfo; buffer: Buffer } | null> {
    const info = await this.getArtifactInfo(spaceId, artifactId);
    if (!info) return null;
    
    const baseDir = path.join(process.cwd(), '.viber', 'spaces', spaceId);
    const filePath = path.join(baseDir, 'artifacts', info.storageKey);
    const buffer = await fs.readFile(filePath);
    
    return { info, buffer };
  }
  
  async getArtifactInfo(spaceId: string, artifactId: string): Promise<ArtifactInfo | null> {
    const baseDir = path.join(process.cwd(), '.viber', 'spaces', spaceId);
    const metadataPath = path.join(baseDir, 'artifacts.json');
    
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      const artifacts: ArtifactInfo[] = JSON.parse(content);
      return artifacts.find(a => a.id === artifactId) || null;
    } catch {
      return null;
    }
  }
  
  async listArtifacts(spaceId: string): Promise<ArtifactInfo[]> {
    const baseDir = path.join(process.cwd(), '.viber', 'spaces', spaceId);
    const metadataPath = path.join(baseDir, 'artifacts.json');
    
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
  
  async deleteArtifact(spaceId: string, artifactId: string): Promise<void> {
    const info = await this.getArtifactInfo(spaceId, artifactId);
    if (!info) throw new Error('Artifact not found');
    
    const baseDir = path.join(process.cwd(), '.viber', 'spaces', spaceId);
    
    // Delete file
    const filePath = path.join(baseDir, 'artifacts', info.storageKey);
    await fs.unlink(filePath);
    
    // Update metadata
    const metadataPath = path.join(baseDir, 'artifacts.json');
    const content = await fs.readFile(metadataPath, 'utf-8');
    const artifacts: ArtifactInfo[] = JSON.parse(content);
    const filtered = artifacts.filter(a => a.id !== artifactId);
    await fs.writeFile(metadataPath, JSON.stringify(filtered, null, 2));
  }
}