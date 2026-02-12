/**
 * Viber Framework - Main Entry Point
 *
 * Complete data management and multi-agent collaboration engine
 */

// Core
export * from "./viber/space";
export * from "./viber/viber-agent";
export * from "./viber/agent";
export * from "./viber/collaboration";
// Export config types but avoid ModelConfig duplicate
export type {
  SpaceConfig,
  SpaceState,
  SpaceModel,
  AgentConfig,
} from "./viber/config";
export * from "./viber/message";
export * from "./viber/plan";
export * from "./viber/task";

// Export provider but avoid ModelConfig duplicate (it's in types)
export { getModelProvider, parseModelString } from "./viber/provider";
export type { ModelProvider } from "./viber/provider";
export * from "./viber/tool";

// AI SDK Core - re-export from AI SDK v6
export { streamText, generateText, Output, ToolLoopAgent, stepCountIs } from "ai";

// Types
export * from "./types";
