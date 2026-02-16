/**
 * Viber Framework - Main Entry Point
 *
 * Complete data management and multi-agent collaboration engine
 */

// Core
export * from "./worker/space";
export * from "./worker/viber-agent";
export * from "./worker/agent";
export * from "./worker/collaboration";
// Export config types but avoid ModelConfig duplicate
export type {
  SpaceConfig,
  SpaceState,
  SpaceModel,
  ViberConfig,
} from "./worker/config";
export * from "./worker/message";
export * from "./worker/plan";
export * from "./worker/task";

// Export provider but avoid ModelConfig duplicate (it's in types)
export { getModelProvider, parseModelString } from "./worker/provider";
export type { ModelProvider } from "./worker/provider";
export * from "./worker/tool";

// AI SDK Core - re-export from AI SDK v6
export { streamText, generateText, Output, ToolLoopAgent, stepCountIs } from "ai";

// Types
export * from "./types";
