/**
 * SupabaseDatabaseAdapter - Direct Supabase/PostgreSQL database access
 * Used by API routes in database mode to avoid circular dependencies
 *
 * Architecture:
 * - Client code → DatabaseDataAdapter → API routes
 * - API routes → SupabaseDatabaseAdapter → PostgreSQL (this file)
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
  private supabase;

  constructor() {
    const client = getSupabaseServiceRoleClient();
    if (!client) {
      throw new Error("Supabase service role client not configured");
    }
    this.supabase = client;
  }

  // ==================== Agents ====================

  async getAgents(): Promise<Agent[]> {
    const { data, error } = await this.supabase
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch agents: ${error.message}`);

    // Transform database format to Agent type
    return (data || []).map((agent) => {
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
    const { data, error } = await this.supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch agent: ${error.message}`);
    }

    // Transform database format to Agent type
    // Database stores llm_provider, llm_model, llm_settings separately
    // Agent type expects them in an llm object
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
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

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

    const { data, error } = await this.supabase
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
    const { error } = await this.supabase.from("agents").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete agent: ${error.message}`);
  }

  async cloneAgent(id: string): Promise<Agent> {
    const original = await this.getAgent(id);
    if (!original) throw new Error(`Agent ${id} not found`);

    const cloned = {
      ...original,
      id: `${original.id}-copy-${Date.now()}`,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return await this.saveAgent(cloned);
  }

  // ==================== Tools ====================

  async getTools(): Promise<Tool[]> {
    const { data, error } = await this.supabase
      .from("tools")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch tools: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getTool(id: string): Promise<Tool | null> {
    const { data, error } = await this.supabase
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
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    const dbTool = toSnakeCase({
      ...tool,
      userId: tool.userId || user?.id, // Set user_id from auth context if not provided
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from("tools")
      .upsert(dbTool)
      .select()
      .single();

    if (error) throw new Error(`Failed to save tool: ${error.message}`);
    return toCamelCase(data);
  }

  async deleteTool(id: string): Promise<void> {
    const { error } = await this.supabase.from("tools").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete tool: ${error.message}`);
  }

  async cloneTool(id: string): Promise<Tool> {
    const original = await this.getTool(id);
    if (!original) throw new Error(`Tool ${id} not found`);

    const cloned = {
      ...original,
      id: `${original.id}-copy-${Date.now()}`,
      name: `${original.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return await this.saveTool(cloned);
  }

  // ==================== Spaces ====================

  async getSpaces(): Promise<Space[]> {
    const { data, error } = await this.supabase
      .from("spaces")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch spaces: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getSpace(id: string): Promise<Space | null> {
    const { data, error } = await this.supabase
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
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    // Only include fields that exist in the database schema
    // Exclude runtime-only fields like activeArtifactId
    const { activeArtifactId, ...spaceData } = space as any;

    // Convert camelCase to snake_case for database
    const dbSpace = toSnakeCase({
      ...spaceData,
      userId: spaceData.userId || user?.id, // Set user_id from auth context if not provided
      updatedAt: new Date().toISOString(),
    });

    // If ID is empty string (from creation), remove it to let DB generate UUID
    if (dbSpace.id === "") {
      delete dbSpace.id;
    }

    const { data, error } = await this.supabase
      .from("spaces")
      .upsert(dbSpace)
      .select()
      .single();

    if (error) throw new Error(`Failed to save space: ${error.message}`);

    // Convert snake_case back to camelCase for TypeScript
    return toCamelCase(data);
  }

  async deleteSpace(id: string): Promise<void> {
    const { error } = await this.supabase.from("spaces").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete space: ${error.message}`);
  }

  // ==================== Artifacts ====================

  async getArtifacts(spaceId: string): Promise<Artifact[]> {
    const { data, error } = await this.supabase
      .from("artifacts")
      .select("*")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch artifacts: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getArtifact(id: string, spaceId?: string): Promise<Artifact | null> {
    let query = this.supabase.from("artifacts").select("*").eq("id", id);

    if (spaceId) {
      query = query.eq("space_id", spaceId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") return null; // Not found
      throw new Error(`Failed to fetch artifact: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveArtifact(artifact: Artifact): Promise<Artifact> {
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    const dbArtifact = toSnakeCase({
      ...artifact,
      userId: artifact.userId || user?.id, // Set user_id from auth context if not provided
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from("artifacts")
      .upsert(dbArtifact)
      .select()
      .single();

    if (error) throw new Error(`Failed to save artifact: ${error.message}`);
    return toCamelCase(data);
  }

  async deleteArtifact(id: string, spaceId?: string): Promise<void> {
    let query = this.supabase.from("artifacts").delete().eq("id", id);

    if (spaceId) {
      query = query.eq("space_id", spaceId);
    }

    const { error } = await query;

    if (error) throw new Error(`Failed to delete artifact: ${error.message}`);
  }

  // NEW: Artifact queries
  async getArtifactsBySpace(spaceId: string): Promise<Artifact[]> {
    const { data, error } = await this.supabase
      .from("artifacts")
      .select("*")
      .eq("space_id", spaceId)
      .is("task_id", null)
      .order("created_at", { ascending: false });

    if (error)
      throw new Error(`Failed to fetch space artifacts: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getArtifactsByTask(taskId: string): Promise<Artifact[]> {
    const { data, error } = await this.supabase
      .from("artifacts")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error)
      throw new Error(`Failed to fetch task artifacts: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getArtifactsByCategory(
    spaceOrTaskId: string,
    category: "input" | "intermediate" | "output",
    isTask = false
  ): Promise<Artifact[]> {
    const field = isTask ? "task_id" : "space_id";
    const { data, error } = await this.supabase
      .from("artifacts")
      .select("*")
      .eq(field, spaceOrTaskId)
      .eq("category", category)
      .order("created_at", { ascending: false });

    if (error)
      throw new Error(
        `Failed to fetch artifacts by category: ${error.message}`
      );
    return (data || []).map(toCamelCase);
  }

  // ==================== Tasks ====================

  async getTasks(spaceId: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("space_id", spaceId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getTask(id: string): Promise<Task | null> {
    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch task: ${error.message}`);
    }

    return toCamelCase(data);
  }

  async saveTask(task: Task): Promise<Task> {
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    const dbTask = toSnakeCase({
      ...task,
      userId: task.userId || user?.id, // Set user_id from auth context if not provided
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from("tasks")
      .upsert(dbTask)
      .select()
      .single();

    if (error) throw new Error(`Failed to save task: ${error.message}`);
    return toCamelCase(data);
  }

  async deleteTask(id: string): Promise<void> {
    const { error } = await this.supabase.from("tasks").delete().eq("id", id);

    if (error) throw new Error(`Failed to delete task: ${error.message}`);
  }

  // ==================== Conversations ====================

  async getConversations(spaceId: string): Promise<Conversation[]> {
    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("space_id", spaceId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch tasks: ${error.message}`);
    return (data || []).map(toCamelCase);
  }

  async getConversation(
    id: string,
    spaceId?: string
  ): Promise<Conversation | null> {
    let query = this.supabase.from("tasks").select("*").eq("id", id);

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
    // Get authenticated user to set user_id if not already set
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    const dbConversation = toSnakeCase({
      ...conversation,
      userId: conversation.userId || user?.id, // Set user_id from auth context if not provided
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from("tasks")
      .upsert(dbConversation)
      .select()
      .single();

    if (error) throw new Error(`Failed to save conversation: ${error.message}`);
    return toCamelCase(data);
  }

  async deleteConversation(id: string, spaceId?: string): Promise<void> {
    let query = this.supabase.from("tasks").delete().eq("id", id);

    if (spaceId) {
      query = query.eq("space_id", spaceId);
    }

    const { error } = await query;

    if (error)
      throw new Error(`Failed to delete conversation: ${error.message}`);
  }

  // ==================== Model Providers ====================

  async getModelProviders(): Promise<ModelProvider[]> {
    const { data, error } = await this.supabase
      .from("model_providers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error)
      throw new Error(`Failed to fetch model providers: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getModelProvider(id: string): Promise<ModelProvider | null> {
    const { data, error } = await this.supabase
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
    const dbProvider = toSnakeCase({
      ...provider,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from("model_providers")
      .upsert(dbProvider)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to save model provider: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteModelProvider(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("model_providers")
      .delete()
      .eq("id", id);

    if (error)
      throw new Error(`Failed to delete model provider: ${error.message}`);
  }

  // ==================== Datasources ====================

  async getDatasources(): Promise<Datasource[]> {
    const { data, error } = await this.supabase
      .from("datasources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch datasources: ${error.message}`);

    return (data || []).map(toCamelCase);
  }

  async getDatasource(id: string): Promise<Datasource | null> {
    const { data, error } = await this.supabase
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
    const dbDatasource = toSnakeCase({
      ...datasource,
      updatedAt: new Date().toISOString(),
    });

    const { data, error } = await this.supabase
      .from("datasources")
      .upsert(dbDatasource)
      .select()
      .single();

    if (error) throw new Error(`Failed to save datasource: ${error.message}`);

    return toCamelCase(data);
  }

  async deleteDatasource(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("datasources")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Failed to delete datasource: ${error.message}`);
  }
}
