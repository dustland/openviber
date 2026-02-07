/**
 * Dev Setup Script
 *
 * Ensures the local development environment has a default agent config
 * so that `pnpm dev` works out-of-the-box without requiring `openviber onboard`
 * or publishing the package to npm.
 *
 * Creates ~/.openviber/agents/default.yaml if it doesn't exist.
 */

import fs from "fs";
import path from "path";
import { homedir } from "os";

const OPENVIBER_DIR = process.env.OPENVIBER_DATA_DIR || path.join(homedir(), ".openviber");
const VIBERS_DIR = path.join(OPENVIBER_DIR, "vibers");
const DEFAULT_CONFIG = path.join(VIBERS_DIR, "default.yaml");

const DEFAULT_AGENT_YAML = `# OpenViber default agent config (auto-generated for dev)
name: default
provider: openrouter
model: anthropic/claude-sonnet-4-20250514

tools:
  - file
  - terminal
  - search
  - web

skills: []
`;

function main() {
  // Create directories if needed
  if (!fs.existsSync(VIBERS_DIR)) {
    fs.mkdirSync(VIBERS_DIR, { recursive: true });
    console.log(`📁 Created ${VIBERS_DIR}`);
  }

  // Write default config if missing
  if (!fs.existsSync(DEFAULT_CONFIG)) {
    fs.writeFileSync(DEFAULT_CONFIG, DEFAULT_AGENT_YAML, "utf8");
    console.log(`✅ Created default agent config: ${DEFAULT_CONFIG}`);
  } else {
    console.log(`✅ Agent config already exists: ${DEFAULT_CONFIG}`);
  }
}

main();
