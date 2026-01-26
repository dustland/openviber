/**
 * Viber Framework - Main Entry Point
 *
 * Complete data management and multi-agent collaboration engine
 */

// Core
export * from "./core/space";
export * from "./core/viber-agent";
export * from "./core/agent";
export * from "./core/collaboration";
// Export config types but avoid ModelConfig duplicate
export type {
  SpaceConfig,
  SpaceState,
  SpaceModel,
  AgentConfig,
} from "./core/config";
export * from "./core/message";
export * from "./core/plan";
export * from "./core/task";
// Export provider but avoid ModelConfig duplicate (it's in types)
export { getModelProvider, parseModelString } from "./core/provider";
export type { ModelProvider } from "./core/provider";
export * from "./core/tool";

// AI SDK Core - re-export from AI SDK v6
export { streamText, generateText, Output, ToolLoopAgent, stepCountIs } from "ai";

// Data Management
export * from "./data/manager";

// State Management  
export * from "./state/store";

// Storage
export * from "./storage/space";
export * from "./storage/base";

// Types
export * from "./types";

// Daemon
export * from "./daemon";
