/**
 * Desktop Tool - GUI Automation via UI-TARS
 *
 * Enables agents to control desktop applications through visual understanding.
 * Uses UI-TARS (or compatible VLM) to analyze screenshots and perform actions.
 *
 * @requires UI_TARS_BASE_URL environment variable (or configured via tool config)
 * @requires UI_TARS_API_KEY environment variable (optional if using local model)
 */

import { z } from "zod";
import { Tool, ToolFunction, ToolMetadata, ConfigSchema } from "./base";
import * as os from "os";

// ==================== Types ====================

export interface DesktopAction {
  type: "click" | "type" | "scroll" | "key" | "drag" | "wait" | "finished";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  direction?: "up" | "down" | "left" | "right";
  duration?: number;
  toX?: number;
  toY?: number;
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  path?: string;
}

export interface DesktopConfig {
  modelBaseURL: string;
  modelApiKey?: string;
  modelName: string;
  maxSteps: number;
  screenshotDelay: number;
}

// ==================== Desktop Tool ====================

export class DesktopTool extends Tool {
  private config: DesktopConfig;

  constructor() {
    super();
    this.config = {
      modelBaseURL: process.env.UI_TARS_BASE_URL || "http://localhost:8000",
      modelApiKey: process.env.UI_TARS_API_KEY,
      modelName: process.env.UI_TARS_MODEL || "UI-TARS-1.5-7B",
      maxSteps: 20,
      screenshotDelay: 500,
    };
  }

  getMetadata(): ToolMetadata {
    return {
      id: "desktop",
      name: "Desktop Tool",
      description: "Control desktop applications through GUI automation",
      category: "Desktop",
      requiresApiKey: false, // Optional - can use local models
      apiKeyName: "UI_TARS_API_KEY",
    };
  }

  getConfigSchema(): ConfigSchema {
    return {
      modelBaseURL: {
        type: "string",
        name: "Model Base URL",
        description: "UI-TARS model API endpoint",
        envVar: "UI_TARS_BASE_URL",
        defaultValue: "http://localhost:8000",
      },
      modelApiKey: {
        type: "string",
        name: "Model API Key",
        description: "API key for UI-TARS service (optional for local)",
        envVar: "UI_TARS_API_KEY",
      },
      modelName: {
        type: "select",
        name: "Model",
        description: "Vision-language model to use",
        options: [
          { value: "UI-TARS-1.5-7B", label: "UI-TARS 1.5 7B", description: "Recommended for desktop automation" },
          { value: "Qwen2-VL-7B", label: "Qwen2-VL 7B", description: "Good for general GUI understanding" },
        ],
        defaultValue: "UI-TARS-1.5-7B",
      },
      maxSteps: {
        type: "number",
        name: "Max Steps",
        description: "Maximum number of actions per task",
        min: 1,
        max: 50,
        defaultValue: 20,
      },
    };
  }

  // ==================== Tool Functions ====================

  /**
   * Execute a natural language command on the desktop GUI
   */
  @ToolFunction({
    name: "desktop_execute",
    description: "Execute a natural language instruction on the desktop. The agent will analyze the screen and perform the necessary actions to complete the task.",
    input: z.object({
      instruction: z.string().describe("What to do on the desktop (e.g., 'Open Chrome and search for AI news')"),
      maxSteps: z.number().optional().describe("Maximum number of actions to take (default: 20)"),
    }),
  })
  async execute(input: { instruction: string; maxSteps?: number }): Promise<{
    success: boolean;
    steps: number;
    actions: string[];
    error?: string;
  }> {
    const maxSteps = input.maxSteps || this.config.maxSteps;
    const actions: string[] = [];
    let step = 0;

    try {
      while (step < maxSteps) {
        step++;

        // 1. Capture screenshot
        const screenshot = await this.captureScreen();

        // 2. Send to model for analysis
        const action = await this.analyzeAndDecide(screenshot, input.instruction, actions);

        if (action.type === "finished") {
          return { success: true, steps: step, actions };
        }

        // 3. Execute the action
        await this.executeAction(action);
        actions.push(this.actionToString(action));

        // 4. Wait for UI to update
        await this.sleep(this.config.screenshotDelay);
      }

      return { success: true, steps: step, actions };
    } catch (error: any) {
      return { success: false, steps: step, actions, error: error.message };
    }
  }

  /**
   * Capture a screenshot of the current desktop
   */
  @ToolFunction({
    name: "desktop_screenshot",
    description: "Capture a screenshot of the current desktop state",
    input: z.object({
      saveTo: z.string().optional().describe("Filename to save in artifacts (e.g., 'screenshot.png')"),
    }),
  })
  async screenshot(input: { saveTo?: string }): Promise<ScreenshotResult> {
    const result = await this.captureScreen();

    if (input.saveTo && this.spaceId) {
      await this.writeArtifactFile(input.saveTo, result.base64);
      result.path = input.saveTo;
    }

    return result;
  }

  /**
   * Click at specific screen coordinates
   */
  @ToolFunction({
    name: "desktop_click",
    description: "Click at specific screen coordinates",
    input: z.object({
      x: z.number().describe("X coordinate"),
      y: z.number().describe("Y coordinate"),
      button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button (default: left)"),
      doubleClick: z.boolean().optional().describe("Whether to double-click"),
    }),
  })
  async click(input: { x: number; y: number; button?: "left" | "right" | "middle"; doubleClick?: boolean }): Promise<{ success: boolean }> {
    const action: DesktopAction = {
      type: "click",
      x: input.x,
      y: input.y,
    };

    await this.executeClick(input.x, input.y, input.button || "left", input.doubleClick || false);
    return { success: true };
  }

  /**
   * Type text at current cursor position
   */
  @ToolFunction({
    name: "desktop_type",
    description: "Type text at the current cursor position",
    input: z.object({
      text: z.string().describe("Text to type"),
      pressEnter: z.boolean().optional().describe("Press Enter after typing"),
    }),
  })
  async type(input: { text: string; pressEnter?: boolean }): Promise<{ success: boolean }> {
    await this.executeType(input.text);

    if (input.pressEnter) {
      await this.executeKey("Enter");
    }

    return { success: true };
  }

  /**
   * Press a keyboard key or combination
   */
  @ToolFunction({
    name: "desktop_key",
    description: "Press a keyboard key or key combination (e.g., 'Enter', 'Cmd+C', 'Ctrl+Alt+Delete')",
    input: z.object({
      key: z.string().describe("Key or key combination to press"),
    }),
  })
  async key(input: { key: string }): Promise<{ success: boolean }> {
    await this.executeKey(input.key);
    return { success: true };
  }

  /**
   * Scroll in a direction
   */
  @ToolFunction({
    name: "desktop_scroll",
    description: "Scroll the mouse wheel in a direction",
    input: z.object({
      direction: z.enum(["up", "down", "left", "right"]).describe("Direction to scroll"),
      amount: z.number().optional().describe("Amount to scroll (default: 3)"),
    }),
  })
  async scroll(input: { direction: "up" | "down" | "left" | "right"; amount?: number }): Promise<{ success: boolean }> {
    await this.executeScroll(input.direction, input.amount || 3);
    return { success: true };
  }

  // ==================== Internal Methods ====================

  private async captureScreen(): Promise<ScreenshotResult> {
    // Platform-specific screenshot capture
    // Will use native APIs or external tools
    const platform = os.platform();

    try {
      if (platform === "darwin") {
        // macOS: Use screencapture
        return await this.captureScreenMac();
      } else if (platform === "win32") {
        // Windows: Use PowerShell
        return await this.captureScreenWindows();
      } else {
        // Linux: Use scrot or import
        return await this.captureScreenLinux();
      }
    } catch (error: any) {
      throw new Error(`Screenshot capture failed: ${error.message}`);
    }
  }

  private async captureScreenMac(): Promise<ScreenshotResult> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const { readFile, unlink } = await import("fs/promises");
    const path = await import("path");
    const os = await import("os");

    const execAsync = promisify(exec);
    const tmpFile = path.join(os.tmpdir(), `viber-screenshot-${Date.now()}.png`);

    await execAsync(`screencapture -x ${tmpFile}`);
    const buffer = await readFile(tmpFile);
    await unlink(tmpFile);

    // Get dimensions (simplified - would need image parsing for accurate values)
    return {
      base64: buffer.toString("base64"),
      width: 1920, // Placeholder
      height: 1080,
    };
  }

  private async captureScreenWindows(): Promise<ScreenshotResult> {
    // Placeholder - would use PowerShell or .NET
    throw new Error("Windows screenshot not yet implemented");
  }

  private async captureScreenLinux(): Promise<ScreenshotResult> {
    // Placeholder - would use scrot or import
    throw new Error("Linux screenshot not yet implemented");
  }

  private async analyzeAndDecide(
    screenshot: ScreenshotResult,
    instruction: string,
    previousActions: string[]
  ): Promise<DesktopAction> {
    // Call UI-TARS or compatible VLM

    const prompt = this.buildPrompt(instruction, previousActions);

    try {
      const response = await fetch(`${this.config.modelBaseURL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.modelApiKey && { Authorization: `Bearer ${this.config.modelApiKey}` }),
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${screenshot.base64}` },
                },
              ],
            },
          ],
          max_tokens: 256,
        }),
      });

      if (!response.ok) {
        throw new Error(`Model API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";

      return this.parseModelResponse(content);
    } catch (error: any) {
      throw new Error(`Model analysis failed: ${error.message}`);
    }
  }

  private buildPrompt(instruction: string, previousActions: string[]): string {
    return `You are a desktop automation agent. Analyze the screenshot and determine the next action to complete the task.

TASK: ${instruction}

PREVIOUS ACTIONS:
${previousActions.length > 0 ? previousActions.join("\n") : "None yet"}

RESPOND with ONLY ONE of these actions (use exact format):
- click(x, y) - Click at screen coordinates
- type("text") - Type text at current cursor
- key("key_name") - Press a key (e.g., "Enter", "Cmd+C")
- scroll("up"|"down"|"left"|"right") - Scroll in a direction
- finished - If the task is complete

RESPOND with the single best action to take next.`;
  }

  private parseModelResponse(content: string): DesktopAction {
    // Parse action from model response
    const trimmed = content.trim().toLowerCase();

    if (trimmed.includes("finished")) {
      return { type: "finished" };
    }

    // Parse click(x, y)
    const clickMatch = content.match(/click\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (clickMatch) {
      return { type: "click", x: parseInt(clickMatch[1]), y: parseInt(clickMatch[2]) };
    }

    // Parse type("text")
    const typeMatch = content.match(/type\s*\(\s*["'](.+?)["']\s*\)/i);
    if (typeMatch) {
      return { type: "type", text: typeMatch[1] };
    }

    // Parse key("key_name")
    const keyMatch = content.match(/key\s*\(\s*["'](.+?)["']\s*\)/i);
    if (keyMatch) {
      return { type: "key", key: keyMatch[1] };
    }

    // Parse scroll("direction")
    const scrollMatch = content.match(/scroll\s*\(\s*["'](up|down|left|right)["']\s*\)/i);
    if (scrollMatch) {
      return { type: "scroll", direction: scrollMatch[1] as "up" | "down" | "left" | "right" };
    }

    // Default: assume finished if no action parsed
    return { type: "finished" };
  }

  private async executeAction(action: DesktopAction): Promise<void> {
    switch (action.type) {
      case "click":
        await this.executeClick(action.x!, action.y!, "left", false);
        break;
      case "type":
        await this.executeType(action.text!);
        break;
      case "key":
        await this.executeKey(action.key!);
        break;
      case "scroll":
        await this.executeScroll(action.direction!, 3);
        break;
      case "wait":
        await this.sleep(action.duration || 1000);
        break;
    }
  }

  private async executeClick(x: number, y: number, button: string, doubleClick: boolean): Promise<void> {
    const platform = os.platform();

    if (platform === "darwin") {
      // macOS: Use cliclick or AppleScript
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const clickArg = doubleClick ? "dc" : "c";
      try {
        // Try cliclick first (needs to be installed: brew install cliclick)
        await execAsync(`cliclick ${clickArg}:${x},${y}`);
      } catch {
        // Fallback to AppleScript
        const script = doubleClick
          ? `tell application "System Events" to click at {${x}, ${y}}`
          : `tell application "System Events" to click at {${x}, ${y}}`;
        await execAsync(`osascript -e '${script}'`);
      }
    } else {
      throw new Error(`Click not implemented for ${platform}`);
    }
  }

  private async executeType(text: string): Promise<void> {
    const platform = os.platform();

    if (platform === "darwin") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // Escape text for shell
      const escaped = text.replace(/"/g, '\\"').replace(/'/g, "\\'");

      try {
        await execAsync(`cliclick t:"${escaped}"`);
      } catch {
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
      }
    } else {
      throw new Error(`Type not implemented for ${platform}`);
    }
  }

  private async executeKey(key: string): Promise<void> {
    const platform = os.platform();

    if (platform === "darwin") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // Map common keys to AppleScript key codes
      const keyMap: Record<string, string> = {
        enter: "return",
        return: "return",
        tab: "tab",
        escape: "escape",
        esc: "escape",
        space: "space",
        backspace: "delete",
        delete: "delete",
      };

      const mappedKey = keyMap[key.toLowerCase()] || key;

      // Handle modifier combinations like Cmd+C
      if (key.includes("+")) {
        const parts = key.split("+");
        const modifiers = parts.slice(0, -1).map((m) => m.toLowerCase());
        const mainKey = parts[parts.length - 1];

        let modifierStr = "";
        if (modifiers.includes("cmd") || modifiers.includes("command")) modifierStr += "command down, ";
        if (modifiers.includes("ctrl") || modifiers.includes("control")) modifierStr += "control down, ";
        if (modifiers.includes("alt") || modifiers.includes("option")) modifierStr += "option down, ";
        if (modifiers.includes("shift")) modifierStr += "shift down, ";

        modifierStr = modifierStr.slice(0, -2); // Remove trailing ", "

        await execAsync(
          `osascript -e 'tell application "System Events" to keystroke "${mainKey}" using {${modifierStr}}'`
        );
      } else {
        await execAsync(`osascript -e 'tell application "System Events" to key code ${mappedKey}'`);
      }
    } else {
      throw new Error(`Key press not implemented for ${platform}`);
    }
  }

  private async executeScroll(direction: "up" | "down" | "left" | "right", amount: number): Promise<void> {
    const platform = os.platform();

    if (platform === "darwin") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const scrollAmount = direction === "up" || direction === "left" ? amount : -amount;
      const axis = direction === "up" || direction === "down" ? "y" : "x";

      try {
        if (axis === "y") {
          await execAsync(`cliclick "kd:shift" "m:+0,${scrollAmount * 10}" "ku:shift"`);
        }
      } catch {
        // AppleScript fallback (limited scroll support)
        await execAsync(
          `osascript -e 'tell application "System Events" to scroll area 1 of window 1 scroll {${axis === "x" ? scrollAmount : 0
          }, ${axis === "y" ? scrollAmount : 0}}'`
        );
      }
    } else {
      throw new Error(`Scroll not implemented for ${platform}`);
    }
  }

  private actionToString(action: DesktopAction): string {
    switch (action.type) {
      case "click":
        return `click(${action.x}, ${action.y})`;
      case "type":
        return `type("${action.text}")`;
      case "key":
        return `key("${action.key}")`;
      case "scroll":
        return `scroll("${action.direction}")`;
      case "wait":
        return `wait(${action.duration}ms)`;
      default:
        return `${action.type}(...)`;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
