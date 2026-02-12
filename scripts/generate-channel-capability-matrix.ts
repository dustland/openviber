import fs from "fs";
import path from "path";
import { registerBuiltinChannels } from "../src/channels/builtin";
import { channelRegistry } from "../src/channels/registry";

const OUTPUT_PATH = path.join("docs", "reference", "channel-capability-matrix.md");

/**
 * Render markdown table content from registered channel capabilities.
 */
function buildMarkdown(): string {
  registerBuiltinChannels();
  const channels = channelRegistry
    .listCapabilities()
    .sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [];
  lines.push("# Channel Capability Matrix");
  lines.push("");
  lines.push(
    "This matrix is generated from built-in channel registry metadata. Run `pnpm docs:channels` after capability updates.",
  );
  lines.push("");
  lines.push(
    "| Channel | Display name | Transport | Inbound attachments | Auth summary | Controls | Production readiness |",
  );
  lines.push("|---|---|---|---|---|---|---|");

  for (const channel of channels) {
    lines.push(
      `| \`${channel.id}\` | ${channel.displayName} | \`${channel.capabilities.transport}\` | ${channel.capabilities.supportsInboundAttachments ? "yes" : "no"} | ${channel.capabilities.auth} | ${(channel.capabilities.controls ?? []).join(", ") || "—"} | ${channel.capabilities.productionReadiness} |`,
    );
  }

  lines.push("");
  lines.push("## Source");
  lines.push("");
  lines.push("- `src/channels/registry.ts`");
  lines.push("- `src/channels/builtin.ts`");

  return `${lines.join("\n")}\n`;
}

function main(): void {
  const markdown = buildMarkdown();
  fs.writeFileSync(OUTPUT_PATH, markdown, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main();
