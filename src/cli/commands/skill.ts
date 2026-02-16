import { Command } from "commander";

export const skillCommand = new Command("skill")
  .description("Explore, import, and manage skills from external sources")
  .addHelpText(
    "after",
    `
Sources:
  openclaw      OpenClaw Skill Hub (community registry)
  github        GitHub repositories (tagged with openviber-skill topic)
  npm           npm packages (with openviber-skill keyword)
  huggingface   Hugging Face models/spaces
  smithery      Smithery MCP server registry
  composio      Composio tool integrations (250+ SaaS)
  glama         Glama MCP server directory

Examples:
  openviber skill search "web scraping"
  openviber skill search --source github "browser automation"
  openviber skill search --source smithery "filesystem"
  openviber skill info github dustland/openviber-skill-web
  openviber skill import dustland/openviber-skill-web
  openviber skill import npm:@openviber-skills/web-search
  openviber skill import smithery:@anthropic/mcp-server-filesystem
  openviber skill list
  openviber skill remove my-skill
  openviber skill verify cursor-agent
`,
  );

skillCommand
  .command("search [query]")
  .description("Search for skills across external hubs")
  .option("-s, --source <source>", "Source to search (openclaw, github, npm, huggingface, smithery, composio, glama)")
  .option("--tags <tags>", "Filter by tags (comma-separated)")
  .option("--author <author>", "Filter by author")
  .option("--sort <sort>", "Sort order: relevance, popularity, recent, name", "relevance")
  .option("-n, --limit <limit>", "Results per page", "20")
  .option("-p, --page <page>", "Page number", "1")
  .action(async (query, options) => {
    const { getSkillHubManagerWithSettings } = await import("../../skills/hub/manager");
    const manager = await getSkillHubManagerWithSettings();

    const source = options.source as any;
    const searchQuery = {
      query: query || undefined,
      tags: options.tags ? options.tags.split(",").map((t: string) => t.trim()) : undefined,
      author: options.author,
      sort: options.sort as any,
      limit: parseInt(options.limit, 10),
      page: parseInt(options.page, 10),
    };

    console.log(`\nSearching for skills${query ? ` matching "${query}"` : ""}${source ? ` on ${source}` : " across all sources"}...\n`);

    const result = await manager.search(searchQuery, source);

    if (result.skills.length === 0) {
      console.log("No skills found. Try a different query or source.");
      console.log("\nTip: Use --source github to search GitHub repositories");
      console.log("     Use --source npm to search npm packages");
      return;
    }

    // Display results in a table-like format
    console.log(`Found ${result.total} skill(s) (page ${result.page}/${result.totalPages}):\n`);

    const maxNameLen = Math.max(20, ...result.skills.map((s) => s.name.length));
    const nameCol = Math.min(maxNameLen, 35);

    for (const skill of result.skills) {
      const name = skill.name.padEnd(nameCol).slice(0, nameCol);
      const desc = (skill.description || "(no description)").slice(0, 50);
      const source = skill.source.padEnd(8);
      const stars = skill.popularity ? `★${skill.popularity}` : "";
      const version = skill.version !== "latest" ? `v${skill.version}` : "";
      const meta = [source, stars, version].filter(Boolean).join(" ");

      console.log(`  ${name}  ${desc}`);
      console.log(`  ${"".padEnd(nameCol)}  ${meta}  ${skill.author}`);
      console.log("");
    }

    if (result.totalPages > result.page) {
      console.log(`\nPage ${result.page}/${result.totalPages}. Use --page ${result.page + 1} to see more.`);
    }

    console.log(`\nTo import: openviber skill import <skill-id>`);
    console.log(`For details: openviber skill info <source> <skill-id>`);
  });

skillCommand
  .command("info <source> <skillId>")
  .description("Get detailed info about a skill (source: openclaw, github, npm)")
  .action(async (source, skillId) => {
    const { getSkillHubManager } = await import("../../skills/hub");
    const manager = getSkillHubManager();

    console.log(`\nFetching info for '${skillId}' from ${source}...\n`);

    const info = await manager.getSkillInfo(skillId, source as any);

    if (!info) {
      console.error(`Skill not found: ${skillId} on ${source}`);
      process.exit(1);
    }

    console.log(`╭─────────────────────────────────────────────────────╮`);
    console.log(`│ ${info.name.padEnd(52)}│`);
    console.log(`├─────────────────────────────────────────────────────┤`);
    console.log(`│ Source:       ${info.source.padEnd(38)}│`);
    console.log(`│ Author:       ${info.author.padEnd(38)}│`);
    console.log(`│ Version:      ${info.version.padEnd(38)}│`);
    if (info.license) {
      console.log(`│ License:      ${info.license.padEnd(38)}│`);
    }
    if (info.popularity) {
      console.log(`│ Popularity:   ${String(info.popularity).padEnd(38)}│`);
    }
    if (info.tags?.length) {
      console.log(`│ Tags:         ${info.tags.slice(0, 5).join(", ").padEnd(38)}│`);
    }
    if (info.url) {
      console.log(`│ URL:          ${info.url.slice(0, 38).padEnd(38)}│`);
    }
    if (info.updatedAt) {
      console.log(`│ Updated:      ${info.updatedAt.slice(0, 10).padEnd(38)}│`);
    }
    console.log(`╰─────────────────────────────────────────────────────╯`);

    if (info.description) {
      console.log(`\n${info.description}`);
    }

    if (info.readme) {
      console.log(`\n--- README ---\n`);
      // Show first 40 lines of readme
      const lines = info.readme.split("\n");
      console.log(lines.slice(0, 40).join("\n"));
      if (lines.length > 40) {
        console.log(`\n... (${lines.length - 40} more lines)`);
      }
    }

    if (info.dependencies?.length) {
      console.log(`\nDependencies: ${info.dependencies.join(", ")}`);
    }

    console.log(`\nTo import: openviber skill import ${info.source === "npm" ? "npm:" : info.source === "github" ? "" : "openclaw:"}${info.id}`);
  });

skillCommand
  .command("import <skillId>")
  .description("Import a skill from an external source")
  .option("-s, --source <source>", "Source override (openclaw, github, npm)")
  .option("-d, --dir <dir>", "Custom install directory (default: ~/.openviber/skills)")
  .action(async (skillId, options) => {
    const { getSkillHubManager } = await import("../../skills/hub");
    const manager = getSkillHubManager();

    console.log(`\nImporting skill '${skillId}'...\n`);

    const result = await manager.importSkill(skillId, {
      source: options.source as any,
      targetDir: options.dir,
    });

    if (result.ok) {
      console.log(`\n✓ ${result.message}`);
      console.log(`\nThe skill is now available in your local skills directory.`);
      console.log(`Restart your viber to load the new skill.\n`);
    } else {
      console.error(`\n✗ ${result.message}`);
      if (result.error) {
        console.error(`  Error: ${result.error}`);
      }
      process.exit(1);
    }
  });

skillCommand
  .command("list")
  .description("List locally installed skills")
  .action(async () => {
    const { getSkillHubManager } = await import("../../skills/hub");
    const manager = getSkillHubManager();

    const installed = await manager.listInstalled();

    if (installed.length === 0) {
      console.log("\nNo external skills installed.\n");
      console.log("Search for skills:    openviber skill search <query>");
      console.log("Import from GitHub:   openviber skill import owner/repo");
      console.log("Import from npm:      openviber skill import npm:<package>\n");
      return;
    }

    console.log(`\nInstalled skills (${installed.length}):\n`);

    const maxNameLen = Math.max(15, ...installed.map((s) => s.name.length));
    const nameCol = Math.min(maxNameLen, 30);

    for (const skill of installed) {
      const name = skill.name.padEnd(nameCol).slice(0, nameCol);
      const source = (skill.source || "local").padEnd(10);
      const version = skill.version || "";
      console.log(`  ${name}  ${source}  ${version}`);
      console.log(`  ${"".padEnd(nameCol)}  ${skill.dir}`);
      console.log("");
    }
  });

skillCommand
  .command("remove <name>")
  .description("Remove a locally installed skill")
  .action(async (name) => {
    const { getSkillHubManager } = await import("../../skills/hub");
    const manager = getSkillHubManager();

    const result = await manager.removeSkill(name);

    if (result.ok) {
      console.log(`\n✓ ${result.message}\n`);
    } else {
      console.error(`\n✗ ${result.message}\n`);
      process.exit(1);
    }
  });

skillCommand
  .command("verify <skillId>")
  .description("Run a skill playground scenario to verify a skill works")
  .option("-w, --wait <seconds>", "Max seconds to wait for verification", "120")
  .option("--no-refresh", "Skip updating the playground repo before running")
  .action(async (skillId, options) => {
    // Ensure skill tools are pre-registered
    await import("../../skills");
    const { getTools } = await import("../../tools/playground");
    const tool = getTools().skill_playground_verify;

    const waitSeconds = parseInt(options.wait, 10);
    const payload = {
      skillId,
      waitSeconds: Number.isNaN(waitSeconds) ? undefined : waitSeconds,
      refreshRepo: options.refresh,
    };

    console.log(`\nRunning playground for '${skillId}'...\n`);
    const result = await tool.execute(payload);

    if (result.ok) {
      console.log(`✓ Playground completed for '${skillId}'`);
    } else {
      console.error(`✗ Playground failed for '${skillId}'`);
      if (result.error) {
        console.error(`  Error: ${result.error}`);
      }
    }

    if (result.playground) {
      console.log(`\nRepo: ${result.playground.repo}`);
      console.log(`File: ${result.playground.file}`);
      if (result.playground.repoPath) {
        console.log(`Path: ${result.playground.repoPath}`);
      }
      if (result.playground.repoStatus) {
        console.log(`Repo status: ${result.playground.repoStatus}`);
      }
    }

    if (result.run?.summary) {
      console.log(`\nSummary: ${result.run.summary}`);
    }
    if (result.run?.outputTail) {
      console.log(`\n--- Output tail ---\n${result.run.outputTail}`);
    }
    if (result.verification) {
      const markerStatus = result.verification.markerFound ? "found" : "missing";
      console.log(`\nMarker: ${result.verification.marker} (${markerStatus})`);
      if (result.verification.warning) {
        console.log(`Warning: ${result.verification.warning}`);
      }
    }

    if (!result.ok) {
      process.exit(1);
    }
  });
