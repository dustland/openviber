import { Command } from "commander";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import * as readline from "readline";
import { isInteractiveTerminal, question, sleep, runSubcommand } from "../common";
import { gatewayGetVibers, gatewaySubmitTask, pollGatewayTask, GatewayViberListResponse, GatewayTask } from "../gateway-client";

const SAFE_SESSION_NAME_RE = /[^a-zA-Z0-9_.-]/g;

function sanitizeSessionName(name: string): string {
  const trimmed = String(name || "").trim();
  const replaced = trimmed.replace(SAFE_SESSION_NAME_RE, "-").replace(/-+/g, "-");
  const safe = replaced.length > 0 ? replaced : "chat";
  return safe.slice(0, 120);
}

async function promptNoVibersAction(
  gatewayUrl: string,
): Promise<"start" | "onboard" | "exit"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  try {
    console.log(
      `\n[Chat] No vibers connected to gateway at ${gatewayUrl}\n`,
    );
    console.log("Choose next step:");
    console.log("  1) Start local daemon now");
    console.log("  2) Run onboarding setup");
    console.log("  3) Exit\n");

    const answer = (await question(rl, "Select [1-3] (Enter for 1): "))
      .trim()
      .toLowerCase();

    if (answer === "" || answer === "1" || answer === "start") return "start";
    if (answer === "2" || answer === "onboard") return "onboard";
    return "exit";
  } finally {
    rl.close();
  }
}

async function handleChatCommand(
  input: string,
  ctx: {
    gatewayUrl: string;
    vibers: GatewayViberListResponse;
    getActiveViberId: () => string;
    setActiveViberId: (id: string) => void;
    resetHistory: () => Promise<void>;
  },
): Promise<"continue" | "exit"> {
  const [cmd, ...rest] = input.slice(1).trim().split(/\s+/);

  switch (cmd) {
    case "exit":
    case "quit":
      return "exit";
    case "help":
      console.log(
        [
          "Commands:",
          "  /help                 Show help",
          "  /exit                 Exit chat",
          "  /vibers               List connected tasks",
          "  /use <viberId>        Switch active task runtime",
          "  /reset                Clear local history (and session file)",
        ].join("\n"),
      );
      return "continue";
    case "vibers": {
      const vibers = await gatewayGetVibers(ctx.gatewayUrl);
      if (!vibers.connected || vibers.vibers.length === 0) {
        console.log("No tasks connected.");
        return "continue";
      }
      console.log("Connected tasks:");
      for (const v of vibers.vibers) {
        const active = v.id === ctx.getActiveViberId() ? " (active)" : "";
        console.log(`  - ${v.id} (${v.name})${active}`);
      }
      return "continue";
    }
    case "use": {
      const next = rest[0];
      if (!next) {
        console.log("Usage: /use <viberId>");
        return "continue";
      }
      const vibers = await gatewayGetVibers(ctx.gatewayUrl);
      const exists = vibers.vibers.some((v) => v.id === next);
      if (!exists) {
        console.log(`Task runtime not found: ${next}`);
        return "continue";
      }
      ctx.setActiveViberId(next);
      console.log(`Active task runtime: ${next}`);
      return "continue";
    }
    case "reset":
      await ctx.resetHistory();
      console.log("History cleared.");
      return "continue";
    default:
      console.log(`Unknown command: /${cmd}. Try /help`);
      return "continue";
  }
}

type JsonlMessage = { role: "user" | "assistant" | "system"; content: string };

async function readJsonlMessages(filePath: string): Promise<JsonlMessage[]> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
    const out: JsonlMessage[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as any;
        if (
          parsed &&
          (parsed.role === "user" ||
            parsed.role === "assistant" ||
            parsed.role === "system") &&
          typeof parsed.content === "string"
        ) {
          out.push({ role: parsed.role, content: parsed.content });
        }
      } catch {
        // ignore bad lines
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function appendJsonlMessage(filePath: string, msg: JsonlMessage): Promise<void> {
  const line = JSON.stringify({ ...msg, ts: Date.now() });
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

export const chatCommand = new Command("chat")
  .description(
    "Chat with a running task via the local gateway (works great inside a terminal session)",
  )
  .option(
    "--gateway <url>",
    "Gateway URL (defaults to VIBER_GATEWAY_URL or http://localhost:6007)",
  )
  .option(
    "--board <url>",
    "(deprecated: use --gateway) Gateway URL",
  )
  .option(
    "--hub <url>",
    "(deprecated: use --gateway) Gateway URL",
  )
  .option("-v, --viber <id>", "Target task runtime ID (defaults to first connected)")
  .option(
    "-s, --session <name>",
    "Session name for local history (saved under ~/.openviber/tasks/default/sessions/)",
  )
  .option("--no-save", "Do not write chat history to disk")
  .action(async (options) => {
    const gatewayUrl: string =
      options.gateway || options.board || options.hub || process.env.VIBER_GATEWAY_URL || process.env.VIBER_BOARD_URL || process.env.VIBER_HUB_URL || "http://localhost:6009";
    const agentId = "default";

    const sessionsDir = path.join(
      os.homedir(),
      ".openviber",
      "tasks",
      agentId,
      "sessions",
    );
    const rawSessionName =
      options.session || `chat-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const sessionName = sanitizeSessionName(rawSessionName);
    const sessionPath = path.join(sessionsDir, `${sessionName}.jsonl`);

    if (options.save !== false) {
      await fs.mkdir(sessionsDir, { recursive: true });
    }

    const vibers = await gatewayGetVibers(gatewayUrl);
    if (!vibers.connected || vibers.vibers.length === 0) {
      if (isInteractiveTerminal()) {
        const action = await promptNoVibersAction(gatewayUrl);
        if (action === "start") {
          process.exit(await runSubcommand(["start"]));
        }
        if (action === "onboard") {
          process.exit(await runSubcommand(["onboard"]));
        }
      }
      console.error(`[Chat] No tasks connected to gateway at ${gatewayUrl}`);
      console.error("[Chat] Start setup with one of:");
      console.error("  openviber onboard");
      console.error("  openviber start");
      console.error("  pnpm dev  (or: pnpm dev:gateway + pnpm dev:viber)");
      process.exit(1);
    }

    let activeViberId: string | undefined = options.viber;
    if (activeViberId) {
      const exists = vibers.vibers.some((v) => v.id === activeViberId);
      if (!exists) {
        console.error(`[Chat] Task runtime not found: ${activeViberId}`);
        console.error(
          `[Chat] Connected tasks:\n${vibers.vibers.map((v) => `  - ${v.id} (${v.name})`).join("\n")}`,
        );
        process.exit(1);
      }
    } else {
      activeViberId = vibers.vibers[0]?.id;
    }

    const persistedMessages =
      options.save !== false ? await readJsonlMessages(sessionPath) : [];
    const messages: { role: "user" | "assistant" | "system"; content: string }[] =
      [...persistedMessages];

    console.log(
      `[Chat] Gateway: ${gatewayUrl}\n[Chat] Viber: ${activeViberId}\n[Chat] Session: ${options.save !== false ? sessionPath : "(not saved)"}\n`,
    );
    console.log("Type your message and press Enter.");
    console.log("Commands: /help, /exit, /vibers, /use <viberId>, /reset\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const cleanup = () => {
      try {
        rl.close();
      } catch {
        // ignore
      }
    };

    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });

    while (true) {
      const line = await question(rl, "you> ");
      const input = line.trim();
      if (!input) continue;

      if (input.startsWith("/")) {
        const handled = await handleChatCommand(input, {
          gatewayUrl: gatewayUrl,
          vibers,
          getActiveViberId: () => activeViberId!,
          setActiveViberId: (id) => {
            activeViberId = id;
          },
          resetHistory: async () => {
            messages.length = 0;
            if (options.save !== false) {
              await fs.writeFile(sessionPath, "", "utf8");
            }
          },
        });
        if (handled === "exit") break;
        continue;
      }

      messages.push({ role: "user", content: input });
      if (options.save !== false) {
        await appendJsonlMessage(sessionPath, { role: "user", content: input });
      }

      const submit = await gatewaySubmitTask(gatewayUrl, {
        goal: input,
        viberId: activeViberId!,
        messages,
      });
      if (!submit) {
        console.error("[Chat] Failed to submit task");
        continue;
      }

      process.stdout.write("viber> ");
      const result = await pollGatewayTask(gatewayUrl, submit.taskId, {
        pollIntervalMs: 1200,
        maxAttempts: 120,
      });

      if (!result) {
        console.log("Task timed out. No response received.");
        continue;
      }

      if (result.status === "error") {
        const errText = `Error: ${result.error || "Task failed"}`;
        console.log(errText);
        messages.push({ role: "assistant", content: errText });
        if (options.save !== false) {
          await appendJsonlMessage(sessionPath, {
            role: "assistant",
            content: errText,
          });
        }
        continue;
      }

      const text =
        (typeof (result.result as any)?.text === "string"
          ? ((result.result as any).text as string).trim()
          : "") ||
        (typeof (result.result as any)?.summary === "string"
          ? ((result.result as any).summary as string).trim()
          : "") ||
        "(No response text)";

      console.log(text);
      messages.push({ role: "assistant", content: text });
      if (options.save !== false) {
        await appendJsonlMessage(sessionPath, {
          role: "assistant",
          content: text,
        });
      }
    }

    cleanup();
  });
