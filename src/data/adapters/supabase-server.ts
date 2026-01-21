/**
 * SupabaseDatabaseAdapter - Direct Supabase/PostgreSQL database access
 * SERVER-ONLY VERSION - Uses dynamic imports to avoid bundling in client
 * 
 * This file should ONLY be imported from server-side code (API routes).
 * For client-side code, use DatabaseDataAdapter which calls API routes.
 */

import type { DataAdapter } from "../adapter";
import type {
  Agent,
  Tool,
  Space,
  Artifact,
  Conversation,
  Task,
  ModelProvider,
  Datasource,
} from "../types";
import { getSupabaseServiceRoleClient } from "../../config";

/**
 * Convert camelCase object keys to snake_case for database
 */
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== "object") return obj;

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(
      /[A-Z]/g,
      (letter) => `_${letter.toLowerCase()}`
    );
    result[snakeKey] =
      typeof value === "object" && value !== null ? toSnakeCase(value) : value;
  }
  return result;
}

/**
 * Convert snake_case object keys to camelCase for TypeScript
 */
function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== "object") return obj;

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    );
    result[camelKey] =
      typeof value === "object" && value !== null ? toCamelCase(value) : value;
  }
  return result;
}

export class SupabaseDatabaseAdapter implements DataAdapter {
  private supabase: any;
  private supabasePromise: Promise<any> | null = null;

  constructor() {
    // Lazy load Supabase client to avoid bundling server code in client
    if (typeof window !== 'undefined') {
      throw new Error('SupabaseDatabaseAdapter can only be used on the server');
    }
    // Initialize Supabase client lazily
    this.supabasePromise = this.initSupabase();
  }

  private async initSupabase() {
    // Use config module for Supabase client
    const client = getSupabaseServiceRoleClient();
    if (!client) {
      throw new Error('Supabase service role client not configured. Call configure() first.');
    }
    return client;
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await this.supabasePromise;
    }
    return this.supabase;
  }

  // ==================== Agents ====================

  async getAgents(): Promise<Agent[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch agents: ${error.message}`);

    // Transform database format to Agent type
    return (data || []).map((agent: any) => {
      const camelCased = toCamelCase(agent);
      return {
        ...camelCased,
        llm: {
          provider: camelCased.llmProvider,
          model: camelCased.llmModel,
          settings: camelCased.llmSettings,
        },
        // Remove the flat fields
        llmProvider: undefined,
        llmModel: undefined,
        llmSettings: undefined,
      };
    });
  }

  async getAgent(id: string): Promise<Agent | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch agent: ${error.message}`);
    }

    // Transform database format to Agent type
    const camelCased = toCamelCase(data);

    return {
      ...camelCased,
      llm: {
        provider: camelCased.llmProvider,
        model: camelCased.llmModel,
        settings: camelCased.llmSettings,
      },
      // Remove the flat fields to avoid confusion
      llmProvider: undefined,
      llmModel: undefined,
      llmSettings: undefined,
    };
  }

  async saveAgent(agent: Agent): Promise<Agent> {
    const supabase = await this.getSupabase();
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Transform Agent type to database format
    // Convert llm object to flat fields
    const { llm, ...restAgent } = agent;
    const flatAgent = {
      ...restAgent,
      llmProvider: llm?.provider,
      llmModel: llm?.model,
      llmSettings: llm?.settings,
      userId: agent.userId || user?.id,
      updatedAt: new Date().toISOString(),
    };

    const dbAgent = toSnakeCase(flatAgent);

    const { data, error } = await supabase
      .from("agents")
      .upsert(dbAgent)
      .select()
      .single();

    if (error) throw new Error(`Failed to save agent: ${error.message}`);

    // Transform back to Agent type with llm object
    const camelCased = toCamelCase(data);
    return {
      ...camelCased,
      llm: {
        provider: camelCased.llmProvider,
        model: camelCased.llmModel,
        settings: camelCased.llmSettings,
      },
      llmProvider: undefined,
      llmModel: undefined,
      llmSettings: undefined,
    };
  }

  async deleteAgent(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("agents").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete agent: ${error.message}`);
  }

  async cloneAgent(id: string): Promise<Agent> {
    const original = await this.getAgent(id);
    if (!original) {
      throw new Error(`Agent ${id} not found`);
    }

    const cloned = {
      ...original,
      id: `${original.id}-copy-${Date.now()}`,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveAgent(cloned);
  }

  // ==================== Tools ====================

  async getTools(): Promise<Tool[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("tools")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch tools: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getTool(id: string): Promise<Tool | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("tools")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch tool: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveTool(tool: Tool): Promise<Tool> {
    const supabase = await this.getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dbTool = toSnakeCase({
      ...tool,
      userId: tool.userId || user?.id,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("tools")
      .upsert(dbTool)
      .select()
      .single();

    if (error) throw new Error(`Failed to save tool: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteTool(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("tools").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete tool: ${error.message}`);
  }

  async cloneTool(id: string): Promise<Tool> {
    const original = await this.getTool(id);
    if (!original) {
      throw new Error(`Tool ${id} not found`);
    }

    const cloned = {
      ...original,
      id: `${original.id}-copy-${Date.now()}`,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveTool(cloned);
  }

  // ==================== Spaces ====================

  async getSpaces(): Promise<Space[]> {
    const supabase = await this.getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("spaces")
      .select("*")
      .eq("user_id", user?.id || "")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch spaces: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getSpace(id: string): Promise<Space | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("spaces")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch space: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveSpace(space: Space): Promise<Space> {
    const supabase = await this.getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dbSpace = toSnakeCase({
      ...space,
      userId: space.userId || user?.id,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("spaces")
      .upsert(dbSpace)
      .select()
      .single();

    if (error) throw new Error(`Failed to save space: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteSpace(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("spaces").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete space: ${error.message}`);
  }

  // ==================== Artifacts ====================

  async getArtifacts(spaceId: string): Promise<Artifact[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getArtifact(id: string): Promise<Artifact | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch artifact: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    const supabase = await this.getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dbArtifact = toSnakeCase({
      ...artifact,
      userId: artifact.userId || user?.id,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("artifacts")
      .upsert(dbArtifact)
      .select()
      .single();

    if (error) throw new Error(`Failed to save artifact: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteArtifact(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("artifacts").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete artifact: ${error.message}`);
  }

  // Artifact queries
  async getArtifactsBySpace(spaceId: string): Promise<Artifact[]> {
    return this.getArtifacts(spaceId);
  }

  async getArtifactsByTask(taskId: string): Promise<Artifact[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getArtifactsByCategory(
    spaceOrTaskId: string,
    category: 'input' | 'intermediate' | 'output',
    isTask?: boolean
  ): Promise<Artifact[]> {
    const supabase = await this.getSupabase();
    let query = supabase
      .from("artifacts")
      .select("*")
      .eq("category", category);

    if (isTask) {
      query = query.eq("task_id", spaceOrTaskId);
    } else {
      query = query.eq("space_id", spaceOrTaskId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  // ==================== Tasks/Conversations ====================

  async getTasks(spaceId: string): Promise<Task[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getTask(id: string): Promise<Task | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch task: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveTask(task: Task): Promise<Task> {
    const supabase = await this.getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dbTask = toSnakeCase({
      ...task,
      userId: task.userId || user?.id,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("tasks")
      .upsert(dbTask)
      .select()
      .single();

    if (error) throw new Error(`Failed to save task: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteTask(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete task: ${error.message}`);
  }

  // Legacy conversation methods
  async getConversations(spaceId: string): Promise<Conversation[]> {
    return this.getTasks(spaceId) as Promise<Conversation[]>;
  }

  async getConversation(id: string, spaceId?: string): Promise<Conversation | null> {
    const supabase = await this.getSupabase();
    let query = supabase.from("tasks").select("*").eq("id", id);

    if (spaceId) {
      query = query.eq("space_id", spaceId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch conversation: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveConversation(conversation: Conversation): Promise<Conversation> {
    const supabase = await this.getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dbConversation = toSnakeCase({
      ...conversation,
      userId: conversation.userId || user?.id,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("tasks")
      .upsert(dbConversation)
      .select()
      .single();

    if (error) throw new Error(`Failed to save conversation: ${error.message}`);
    return toCamelCase(data);
  }

  async deleteConversation(id: string, spaceId?: string): Promise<void> {
    const supabase = await this.getSupabase();
    let query = supabase.from("tasks").delete().eq("id", id);

    if (spaceId) {
      query = query.eq("space_id", spaceId);
    }

    const { error } = await query;

    if (error)
      throw new Error(`Failed to delete conversation: ${error.message}`);
  }

  // ==================== Model Providers ====================

  async getModelProviders(): Promise<ModelProvider[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("model_providers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch model providers: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getModelProvider(id: string): Promise<ModelProvider | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("model_providers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch model provider: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveModelProvider(provider: ModelProvider): Promise<ModelProvider> {
    const supabase = await this.getSupabase();
    const dbProvider = toSnakeCase({
      ...provider,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("model_providers")
      .upsert(dbProvider)
      .select()
      .single();

    if (error) throw new Error(`Failed to save model provider: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteModelProvider(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("model_providers").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete model provider: ${error.message}`);
  }

  // ==================== Datasources ====================

  async getDatasources(): Promise<Datasource[]> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("datasources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch datasources: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getDatasource(id: string): Promise<Datasource | null> {
    const supabase = await this.getSupabase();
    const { data, error } = await supabase
      .from("datasources")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch datasource: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveDatasource(datasource: Datasource): Promise<Datasource> {
    const supabase = await this.getSupabase();
    const dbDatasource = toSnakeCase({
      ...datasource,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await supabase
      .from("datasources")
      .upsert(dbDatasource)
      .select()
      .single();

    if (error) throw new Error(`Failed to save datasource: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteDatasource(id: string): Promise<void> {
    const supabase = await this.getSupabase();
    const { error } = await supabase.from("datasources").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete datasource: ${error.message}`);
  }
}

