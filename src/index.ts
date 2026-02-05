/**
 * OpenViber - Stateless AI Agent Framework
 *
 * A workspace-first platform where each viber is a subordinate working unit.
 * The daemon is stateless; context is managed by the Viber Board.
 */

// Core exports
export * from "./core/viber";
export * from "./core/agent";
export * from "./core/message";
export { getModelProvider, parseModelString } from "./core/provider";
export type { ModelProvider } from "./core/provider";
export * from "./core/tool";

// Config types
export type { AgentConfig } from "./core/config";

// AI SDK Core - re-export commonly used functions
export { streamText, generateText } from "ai";

// Daemon exports
export * from "./daemon";

// Types (excluding ModelConfig which is in provider)
export type {
  ViberError,
  StreamChunk,
  ViberConfig,
  TaskResult,
  ArtifactRef,
  PlanContext,
  StructuredPlan,
} from "./types";
