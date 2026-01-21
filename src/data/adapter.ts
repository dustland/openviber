/**
 * DataAdapter interface for accessing agents, tools, spaces, etc.
 * This is an internal interface used by ViberDataManager.
 * External code should use ViberDataManager, not DataAdapter directly.
 */

import type {
  Agent,
  Tool,
  Space,
  Artifact,
  Conversation,
  Task,
  ModelProvider,
  Datasource,
} from "./types";

/**
 * Internal adapter interface for data persistence
 * Implementations handle local files or remote database/API
 */
export interface DataAdapter {
  // Agents
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  saveAgent(agent: Agent): Promise<Agent>;
  deleteAgent(id: string): Promise<void>;
  cloneAgent(id: string): Promise<Agent>;

  // Tools
  getTools(): Promise<Tool[]>;
  getTool(id: string): Promise<Tool | null>;
  saveTool(tool: Tool): Promise<Tool>;
  deleteTool(id: string): Promise<void>;
  cloneTool(id: string): Promise<Tool>;

  // Spaces
  getSpaces(): Promise<Space[]>;
  getSpace(id: string): Promise<Space | null>;
  saveSpace(space: Space): Promise<Space>;
  deleteSpace(id: string): Promise<void>;

  // Artifacts (metadata only, files stored in storage bucket)
  getArtifacts(spaceId: string): Promise<Artifact[]>;
  getArtifact(id: string): Promise<Artifact | null>;
  saveArtifact(artifact: Artifact): Promise<Artifact>;
  deleteArtifact(id: string): Promise<void>;

  // Artifact queries by ownership and category
  getArtifactsBySpace(spaceId: string): Promise<Artifact[]>;
  getArtifactsByTask(taskId: string): Promise<Artifact[]>;
  getArtifactsByCategory(
    spaceOrTaskId: string,
    category: "input" | "intermediate" | "output",
    isTask?: boolean
  ): Promise<Artifact[]>;

  // Tasks (formerly Conversations)
  getTasks(spaceId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  saveTask(task: Task): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Legacy conversation methods (map to Task internally)
  getConversations(spaceId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  saveConversation(conversation: Conversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // Model Providers
  getModelProviders(): Promise<ModelProvider[]>;
  getModelProvider(id: string): Promise<ModelProvider | null>;
  saveModelProvider(provider: ModelProvider): Promise<ModelProvider>;
  deleteModelProvider(id: string): Promise<void>;

  // Datasources
  getDatasources(): Promise<Datasource[]>;
  getDatasource(id: string): Promise<Datasource | null>;
  saveDatasource(datasource: Datasource): Promise<Datasource>;
  deleteDatasource(id: string): Promise<void>;
}
