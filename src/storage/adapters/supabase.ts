import { StorageAdapter, ArtifactInfo } from "../base";
import { getSupabaseClient, getSupabaseServiceRoleClient } from "../../config";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseStorageConfig {
  defaultBucket: string;
  bucketMappings?: Record<string, string>; // pathPrefix -> bucketName
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient | null = null;
  private config: SupabaseStorageConfig;

  constructor(private userId: string, config?: Partial<SupabaseStorageConfig>) {
    this.config = {
      defaultBucket: "spaces",
      ...config,
    };
  }

  private async getClient(): Promise<SupabaseClient> {
    if (!this.client) {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Supabase client not configured");
      }
      this.client = client;
    }
    return this.client;
  }

  private getServiceRoleClient(): SupabaseClient {
    const client = getSupabaseServiceRoleClient();
    if (!client) {
      throw new Error("Supabase service role client not configured");
    }
    return client;
  }

  // Helper to normalize path for object storage
  // Removes leading slashes and ensures forward slashes
  private normalizePath(p: string): string {
    return p.replace(/^[\/\\]+/, "").replace(/\\/g, "/");
  }

  // Determine which bucket to use based on path
  private getBucket(path: string): string {
    const normalized = this.normalizePath(path);
    if (this.config.bucketMappings) {
      for (const [prefix, bucket] of Object.entries(this.config.bucketMappings)) {
        if (normalized.startsWith(prefix) || path.startsWith(prefix)) {
          return bucket;
        }
      }
    }
    return this.config.defaultBucket;
  }

  async readFile(path: string): Promise<Buffer> {
    const client = await this.getClient();
    const normalizedPath = this.normalizePath(path);
    const bucket = this.getBucket(path);

    const { data, error } = await client.storage
      .from(bucket)
      .download(normalizedPath);

    if (error) {
      // Supabase Storage returns 400 for missing files sometimes
      if ((error as any).statusCode === '400' || (error as any).status === 400) {
        const enoentError = new Error('File not found');
        (enoentError as any).code = 'ENOENT';
        throw enoentError;
      }
      throw error;
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async readTextFile(path: string): Promise<string> {
    const buffer = await this.readFile(path);
    return buffer.toString("utf-8");
  }

  async writeFile(path: string, data: Buffer | string): Promise<void> {
    const client = await this.getClient();
    const normalizedPath = this.normalizePath(path);
    const bucket = this.getBucket(path);

    const { error } = await client.storage
      .from(bucket)
      .upload(normalizedPath, data, {
        upsert: true,
      });

    if (error) throw error;
  }

  async deleteFile(path: string): Promise<void> {
    const client = await this.getClient();
    const normalizedPath = this.normalizePath(path);
    const bucket = this.getBucket(path);

    const { error } = await client.storage.from(bucket).remove([normalizedPath]);
    if (error) throw error;
  }

  async exists(path: string): Promise<boolean> {
    try {
      const client = await this.getClient();
      const normalizedPath = this.normalizePath(path);
      const bucket = this.getBucket(path);
      const dir = normalizedPath.split("/").slice(0, -1).join("/");
      const filename = normalizedPath.split("/").pop();

      const { data } = await client.storage.from(bucket).list(dir, {
        search: filename,
      });

      return !!data && data.some(item => item.name === filename);
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    // Supabase storage is object storage, directories are virtual.
    // No-op.
  }

  async readdir(path: string): Promise<string[]> {
    const client = await this.getClient();
    const normalizedPath = this.normalizePath(path);
    const bucket = this.getBucket(path);

    const { data, error } = await client.storage.from(bucket).list(normalizedPath);
    if (error) throw error;
    return data.map((item) => item.name);
  }

  async stat(path: string): Promise<any> {
    // Basic stat implementation
    return {
      isDirectory: () => false, // Hard to tell without listing, assume file for now
      size: 0,
    };
  }

  // ==================== Artifact Operations ====================

  async saveArtifact(spaceId: string, artifact: ArtifactInfo, buffer: Buffer): Promise<ArtifactInfo> {
    const client = await this.getClient();
    const serviceClient = this.getServiceRoleClient();

    // Save file to storage bucket
    const filePath = `${spaceId}/artifacts/${artifact.storageKey}`;
    const { error: storageError } = await client.storage
      .from(this.config.defaultBucket)
      .upload(filePath, buffer, { upsert: true });

    if (storageError) throw storageError;

    // Get current user for ownership
    const { data: { user } } = await client.auth.getUser();

    // Save metadata to database using service role client (bypasses RLS)
    const { data, error: dbError } = await serviceClient
      .from('artifacts')
      .insert({
        id: artifact.id,
        space_id: spaceId,
        user_id: user?.id || this.userId,
        storage_key: artifact.storageKey,
        original_name: artifact.originalName,
        mime_type: artifact.mimeType,
        size_bytes: artifact.sizeBytes,
        category: artifact.category || 'input',
        metadata: artifact.metadata || {},
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file on metadata save failure
      await client.storage.from(this.config.defaultBucket).remove([filePath]);
      throw dbError;
    }

    // Return standardized artifact info
    return {
      id: data.id,
      storageKey: data.storage_key,
      originalName: data.original_name,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
      category: data.category,
      metadata: data.metadata,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getArtifact(spaceId: string, artifactId: string): Promise<{ info: ArtifactInfo; buffer: Buffer } | null> {
    const info = await this.getArtifactInfo(spaceId, artifactId);
    if (!info) return null;

    const filePath = `${spaceId}/artifacts/${info.storageKey}`;
    const buffer = await this.readFile(filePath);

    return { info, buffer };
  }

  async getArtifactInfo(spaceId: string, artifactId: string): Promise<ArtifactInfo | null> {
    const serviceClient = this.getServiceRoleClient();

    const { data, error } = await serviceClient
      .from('artifacts')
      .select('*')
      .eq('id', artifactId)
      .eq('space_id', spaceId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      storageKey: data.storage_key,
      originalName: data.original_name,
      mimeType: data.mime_type,
      sizeBytes: data.size_bytes,
      category: data.category,
      metadata: data.metadata,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async listArtifacts(spaceId: string): Promise<ArtifactInfo[]> {
    const serviceClient = this.getServiceRoleClient();

    const { data, error } = await serviceClient
      .from('artifacts')
      .select('*')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      storageKey: row.storage_key,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      category: row.category,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async deleteArtifact(spaceId: string, artifactId: string): Promise<void> {
    const client = await this.getClient();
    const serviceClient = this.getServiceRoleClient();

    // Get artifact info first to know the storage key
    const info = await this.getArtifactInfo(spaceId, artifactId);
    if (!info) throw new Error('Artifact not found');

    // Delete from storage
    const filePath = `${spaceId}/artifacts/${info.storageKey}`;
    await client.storage.from(this.config.defaultBucket).remove([filePath]);

    // Delete from database
    const { error } = await serviceClient
      .from('artifacts')
      .delete()
      .eq('id', artifactId)
      .eq('space_id', spaceId);

    if (error) throw error;
  }
}
