import { defaultRegistry } from "./registry";
import { getTools as getAntigravityTools } from "./antigravity";

// Register default skills and their tools
// This is called during module initialization to pre-register tools
// that would otherwise fail to load at runtime (Node.js can't import .ts files)
export function registerDefaultSkills() {
  // Pre-register antigravity tools so they're available at runtime
  defaultRegistry.preRegisterTools("antigravity", getAntigravityTools());
}

// Auto-register on import
registerDefaultSkills();

