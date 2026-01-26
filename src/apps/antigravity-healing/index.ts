/**
 * Antigravity Healing App
 * 
 * App-level service for monitoring and auto-recovering Antigravity windows.
 * Detects "Agent terminated" errors and automatically clicks Retry.
 */

export {
  AntigravityMonitor,
  type MonitorConfig,
  type MonitorStatus,
  type ScreenAnalysis,
  type AntigravityWindowStatus,
} from "./monitor";
