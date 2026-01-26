/**
 * AntigravityMonitor - Desktop monitoring daemon for Antigravity IDE
 *
 * Monitors the Antigravity (Claude Code Assistant) UI for errors and
 * automatically clicks the Retry button when detected. Reports status
 * to the command center and can stream output or accept input commands.
 *
 * Detection methods (in priority order):
 * 1. CDP (Chrome DevTools Protocol) - Query Electron's DOM directly
 * 2. VLM fallback - Screenshot + GPT-4o analysis
 */

import { EventEmitter } from "events";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import WebSocket from "ws";

// ==================== Types ====================

export interface MonitorConfig {
  /** Screenshot interval in milliseconds */
  interval: number;
  /** OpenRouter API key (for VLM fallback) */
  apiKey?: string;
  /** VLM model to use (default: openai/gpt-4o) */
  model: string;
  /** Maximum retries before alerting */
  maxRetries: number;
  /** CDP port for Electron DevTools (default: 9222) */
  cdpPort: number;
  /** Use VLM for detection instead of CDP */
  useVlm: boolean;
  /** Callback for status updates */
  onStatus?: (status: MonitorStatus) => void;
  /** Callback for requesting input */
  onInputRequest?: (prompt: string) => Promise<string>;
}

export interface MonitorStatus {
  state: "idle" | "monitoring" | "error_detected" | "retrying" | "waiting_input";
  timestamp: number;
  errorCount: number;
  retryCount: number;
  lastScreenshot?: string;
  lastAnalysis?: ScreenAnalysis;
  message?: string;
  detectionMethod?: "cdp" | "vlm";
}

export interface ScreenAnalysis {
  hasError: boolean;
  errorMessage?: string;
  hasRetryButton: boolean;
  retryButtonCoords?: { x: number; y: number };
  isWaitingForInput: boolean;
  inputPrompt?: string;
  currentOutput?: string;
  confidence: number;
}

// CDP types
interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

// Window status for command center
export interface AntigravityWindowStatus {
  windowTitle: string;
  windowId: string;
  state: "idle" | "monitoring" | "error_detected" | "retrying";
  hasError: boolean;
  errorCount: number;
  retryCount: number;
  lastChecked: number; // timestamp
}

// ==================== Monitor ====================

export class AntigravityMonitor extends EventEmitter {
  private config: MonitorConfig;
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private errorCount = 0;
  private retryCount = 0;
  private cdpWs: WebSocket | null = null;
  private cdpMessageId = 0;
  private currentErrorTarget: CDPTarget | null = null;
  private windowStatuses: Map<string, AntigravityWindowStatus> = new Map();

  constructor(config: Partial<MonitorConfig> = {}) {
    super();
    this.config = {
      interval: config.interval || 3000, // 3 seconds for CDP (faster)
      apiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
      model: config.model || "openai/gpt-4o",
      maxRetries: config.maxRetries || 3,
      cdpPort: config.cdpPort || 9333,
      useVlm: config.useVlm || false,
      onStatus: config.onStatus,
      onInputRequest: config.onInputRequest,
    };
  }

  /**
   * Start the monitoring loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[Monitor] Already running");
      return;
    }

    const method = this.config.useVlm ? "VLM (GPT-4o)" : "CDP (DOM query)";
    console.log("[Monitor] Starting Antigravity monitor...");
    console.log(`[Monitor] Detection: ${method}`);
    console.log(`[Monitor] Interval: ${this.config.interval}ms`);

    if (this.config.useVlm && !this.config.apiKey) {
      throw new Error("VLM mode requires OPENROUTER_API_KEY environment variable.");
    }

    this.isRunning = true;
    this.updateStatus({ state: "monitoring", message: "Monitor started", detectionMethod: this.config.useVlm ? "vlm" : "cdp" });

    // Run first check immediately
    await this.runCheck();

    // Start interval loop
    this.intervalTimer = setInterval(() => {
      this.runCheck().catch((err) => {
        console.error("[Monitor] Check failed:", err.message);
      });
    }, this.config.interval);
  }

  /**
   * Stop the monitoring loop
   */
  async stop(): Promise<void> {
    console.log("[Monitor] Stopping monitor...");
    this.isRunning = false;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.updateStatus({ state: "idle", message: "Monitor stopped" });
    this.emit("stopped");
  }

  /**
   * Run a single monitoring check
   */
  private async runCheck(): Promise<void> {
    if (!this.isRunning) return;

    try {
      let analysis: ScreenAnalysis;

      if (this.config.useVlm) {
        // VLM-based detection (fallback)
        const screenshot = await this.captureScreen();
        analysis = await this.analyzeScreen(screenshot);
      } else {
        // CDP-based detection (primary - fast & free)
        analysis = await this.detectViaCDP();
      }

      // Handle based on analysis
      if (analysis.hasError && analysis.hasRetryButton) {
        this.updateStatus({
          state: "error_detected",
          lastAnalysis: analysis,
          message: `Error: ${analysis.errorMessage || "Agent terminated"}`,
          detectionMethod: this.config.useVlm ? "vlm" : "cdp",
        });

        // Auto-retry if under limit
        if (this.retryCount < this.config.maxRetries) {
          if (this.config.useVlm && analysis.retryButtonCoords) {
            await this.clickRetry(analysis.retryButtonCoords);
          } else {
            await this.clickRetryViaCDP();
          }
          this.retryCount++;
        } else {
          this.updateStatus({
            state: "error_detected",
            message: `Max retries (${this.config.maxRetries}) reached. Manual intervention needed.`,
          });
          this.emit("max_retries_reached");
        }
      } else if (analysis.isWaitingForInput) {
        this.updateStatus({
          state: "waiting_input",
          lastAnalysis: analysis,
          message: `Input requested: ${analysis.inputPrompt || "Waiting for input"}`,
        });

        if (this.config.onInputRequest) {
          const input = await this.config.onInputRequest(analysis.inputPrompt || "");
          if (input) {
            await this.typeInput(input);
          }
        }
      } else {
        // All good - reset retry count
        this.retryCount = 0;
        this.updateStatus({
          state: "monitoring",
          lastAnalysis: analysis,
          message: "Running normally",
        });
      }

      if (analysis.currentOutput) {
        this.emit("output", analysis.currentOutput);
      }
    } catch (error: any) {
      this.errorCount++;
      console.error("[Monitor] Check error:", error.message);
      this.updateStatus({
        state: "error_detected",
        message: `Monitor error: ${error.message}`,
      });
    }
  }

  // ==================== CDP Detection (Primary) ====================

  /**
   * Detect errors via Chrome DevTools Protocol
   * Queries Electron's DOM directly for the error dialog
   */
  private async detectViaCDP(): Promise<ScreenAnalysis> {
    try {
      // Get list of targets from CDP
      const targetsRes = await fetch(`http://localhost:${this.config.cdpPort}/json`);
      if (!targetsRes.ok) {
        throw new Error(`CDP not available on port ${this.config.cdpPort}`);
      }

      const targets: CDPTarget[] = await targetsRes.json();

      // Find ALL page targets - we'll check each for the error dialog
      // (Antigravity window title varies, so check all pages)
      const agTargets = targets.filter(t =>
        t.type === "page" &&
        !t.url.startsWith("chrome://") &&
        !t.url.startsWith("chrome-extension://")
      );

      if (agTargets.length === 0) {
        // No Antigravity windows found - assume OK
        this.windowStatuses.clear();
        return { hasError: false, hasRetryButton: false, isWaitingForInput: false, confidence: 0.5 };
      }

      console.log(`[Monitor] Checking ${agTargets.length} Antigravity window(s)...`);

      // Track seen windows for cleanup
      const seenWindowIds = new Set<string>();
      let foundError: ScreenAnalysis | null = null;

      // Check each window for errors
      for (const target of agTargets) {
        if (!target.webSocketDebuggerUrl) continue;

        const windowId = target.id;
        seenWindowIds.add(windowId);

        const result = await this.queryCDPDom(target.webSocketDebuggerUrl);

        // Get or create window status
        const existing = this.windowStatuses.get(windowId) || {
          windowTitle: target.title,
          windowId,
          state: "monitoring" as const,
          hasError: false,
          errorCount: 0,
          retryCount: 0,
          lastChecked: Date.now(),
        };

        // Update status based on result
        const newStatus: AntigravityWindowStatus = {
          ...existing,
          windowTitle: target.title,
          lastChecked: Date.now(),
          hasError: result.hasError,
          state: result.hasError
            ? (existing.state === "retrying" ? "retrying" : "error_detected")
            : "monitoring",
          errorCount: result.hasError ? existing.errorCount + 1 : existing.errorCount,
        };

        this.windowStatuses.set(windowId, newStatus);

        // If this window has an error, save for return
        if (result.hasError && result.hasRetryButton && !foundError) {
          console.log(`[Monitor] Error found in window: ${target.title}`);
          this.currentErrorTarget = target;
          foundError = result;
        }
      }

      // Remove stale windows
      for (const id of this.windowStatuses.keys()) {
        if (!seenWindowIds.has(id)) {
          this.windowStatuses.delete(id);
        }
      }

      // Return error if found
      if (foundError) {
        return foundError;
      }

      // No errors in any window
      return { hasError: false, hasRetryButton: false, isWaitingForInput: false, confidence: 1.0 };
    } catch (error: any) {
      // CDP failed - might not be running with remote debugging
      console.warn("[Monitor] CDP detection failed:", error.message);
      console.warn("[Monitor] Tip: Start Antigravity with --remote-debugging-port=9222");

      // Return no error (don't spam if CDP not available)
      return { hasError: false, hasRetryButton: false, isWaitingForInput: false, confidence: 0 };
    }
  }

  /**
   * Query DOM via CDP WebSocket
   */
  private async queryCDPDom(wsUrl: string): Promise<ScreenAnalysis> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const messageId = ++this.cdpMessageId;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("CDP query timeout"));
      }, 5000);

      ws.on("open", () => {
        // Query for the error dialog elements inside the Antigravity iframe
        ws.send(JSON.stringify({
          id: messageId,
          method: "Runtime.evaluate",
          params: {
            expression: `
              (function() {
                // First check iframe (where Antigravity chat panel lives)
                const iframe = document.querySelector('iframe[src*="antigravity"]');
                const iframeDoc = iframe && iframe.contentDocument;
                const searchDoc = iframeDoc || document;
                const searchText = (iframeDoc ? iframeDoc.body?.innerText : document.body?.innerText) || '';
                
                // Check for error by text content
                const hasError = searchText.includes('Agent terminated due to error');
                
                // Look for Retry button in the same context
                let retryBtn = null;
                if (hasError) {
                  const buttons = searchDoc.querySelectorAll('button');
                  retryBtn = Array.from(buttons).find(
                    b => b.textContent.trim() === 'Retry'
                  );
                }
                
                // Check if waiting for input
                const inputField = searchDoc.querySelector('textarea:not([disabled]), input[type="text"]:not([disabled])');
                const isWaiting = inputField && searchDoc.activeElement === inputField;
                
                return {
                  hasError: !!hasError,
                  errorMessage: hasError ? 'Agent terminated due to error' : null,
                  hasRetryButton: !!retryBtn,
                  retryButtonSelector: retryBtn ? 'button:contains(Retry)' : null,
                  isWaitingForInput: !!isWaiting,
                  confidence: 1.0
                };
              })()
            `,
            returnByValue: true,
          },
        }));
      });

      ws.on("message", (data: string) => {
        const msg = JSON.parse(data);
        if (msg.id === messageId) {
          clearTimeout(timeout);
          ws.close();

          const result = msg.result?.result?.value;
          if (result) {
            resolve({
              hasError: result.hasError || false,
              errorMessage: result.errorMessage,
              hasRetryButton: result.hasRetryButton || false,
              isWaitingForInput: result.isWaitingForInput || false,
              confidence: result.confidence || 1.0,
            });
          } else {
            resolve({ hasError: false, hasRetryButton: false, isWaitingForInput: false, confidence: 0 });
          }
        }
      });

      ws.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Click Retry button via CDP
   */
  private async clickRetryViaCDP(): Promise<void> {
    console.log("[Monitor] Clicking Retry via CDP");
    this.updateStatus({ state: "retrying", message: "Clicking Retry button (CDP)" });

    try {
      // Use cached target from detection, or find it again
      let target = this.currentErrorTarget;

      if (!target?.webSocketDebuggerUrl) {
        const targetsRes = await fetch(`http://localhost:${this.config.cdpPort}/json`);
        const targets: CDPTarget[] = await targetsRes.json();

        target = targets.find(t =>
          t.type === "page" &&
          (t.title.includes("Antigravity") || t.title.includes("Claude"))
        ) || null;
      }

      if (!target?.webSocketDebuggerUrl) {
        throw new Error("Antigravity window not found");
      }

      await this.clickViaCDPWebSocket(target.webSocketDebuggerUrl);
      this.currentErrorTarget = null; // Clear after clicking
    } catch (error: any) {
      console.error("[Monitor] CDP click failed:", error.message);
      throw error;
    }
  }

  private async clickViaCDPWebSocket(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const messageId = ++this.cdpMessageId;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("CDP click timeout"));
      }, 5000);

      ws.on("open", () => {
        ws.send(JSON.stringify({
          id: messageId,
          method: "Runtime.evaluate",
          params: {
            expression: `
              (function() {
                // Look in iframe first (where Antigravity chat panel lives)
                const iframe = document.querySelector('iframe[src*="antigravity"]');
                const iframeDoc = iframe && iframe.contentDocument;
                const searchDoc = iframeDoc || document;
                
                const retryBtn = Array.from(searchDoc.querySelectorAll('button')).find(
                  b => b.textContent.trim() === 'Retry'
                );
                if (retryBtn) {
                  retryBtn.click();
                  return { clicked: true };
                }
                return { clicked: false };
              })()
            `,
            returnByValue: true,
          },
        }));
      });

      ws.on("message", (data: string) => {
        const msg = JSON.parse(data);
        if (msg.id === messageId) {
          clearTimeout(timeout);
          ws.close();
          const clicked = msg.result?.result?.value?.clicked;
          if (clicked) {
            console.log("[Monitor] ✓ Retry button clicked via CDP");
            resolve();
          } else {
            reject(new Error("Retry button not found in DOM"));
          }
        }
      });

      ws.on("error", reject);
    });
  }

  // ==================== Screen Capture (for VLM fallback) ====================

  private async captureScreen(): Promise<string> {
    const platform = os.platform();

    if (platform === "darwin") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const tmpFile = path.join(os.tmpdir(), `viber-monitor-${Date.now()}.png`);
      await execAsync(`screencapture -x ${tmpFile}`);

      const buffer = await fs.readFile(tmpFile);
      await fs.unlink(tmpFile);

      return buffer.toString("base64");
    }

    throw new Error(`Screenshot not implemented for ${platform}`);
  }

  // ==================== VLM Analysis ====================

  private async analyzeScreen(screenshotBase64: string): Promise<ScreenAnalysis> {
    const prompt = `You are analyzing a screenshot of the Antigravity IDE (Claude Code Assistant).

LOOK FOR THIS SPECIFIC ERROR DIALOG:
- A dialog box with title "Agent terminated due to error" (has an X icon)
- Message: "You can prompt the model to try again or start a new conversation..."
- Two buttons at bottom: "Dismiss" (dark/black, left) and "Retry" (olive/gold color, right)

The "Retry" button is specifically olive/gold/tan colored and positioned on the right side of the dialog.

Respond with a JSON object:
{
  "hasError": boolean,       // true if you see "Agent terminated due to error"
  "errorMessage": string,    // The error text if visible
  "hasRetryButton": boolean, // true if "Retry" button is visible
  "retryButtonX": number,    // X coordinate of Retry button CENTER
  "retryButtonY": number,    // Y coordinate of Retry button CENTER
  "isWaitingForInput": boolean,  // Is there an input field waiting?
  "inputPrompt": string,     // What input is being requested?
  "currentOutput": string,   // Brief summary of visible output (max 100 chars)
  "confidence": number       // 0-1 confidence in analysis
}

IMPORTANT COORDINATE INSTRUCTIONS:
- Provide screen pixel coordinates for the CENTER of the Retry button
- The button is typically ~60-80px wide and ~30px tall
- Return the midpoint X,Y of where a click should land

Respond ONLY with JSON, no markdown or other text.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": "https://viber.ai",
        "X-Title": "Viber Antigravity Monitor",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${screenshotBase64}` },
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr);
      return {
        hasError: parsed.hasError || false,
        errorMessage: parsed.errorMessage,
        hasRetryButton: parsed.hasRetryButton || false,
        retryButtonCoords:
          parsed.retryButtonX && parsed.retryButtonY
            ? { x: parsed.retryButtonX, y: parsed.retryButtonY }
            : undefined,
        isWaitingForInput: parsed.isWaitingForInput || false,
        inputPrompt: parsed.inputPrompt,
        currentOutput: parsed.currentOutput,
        confidence: parsed.confidence || 0.5,
      };
    } catch {
      console.error("[Monitor] Failed to parse VLM response:", content);
      return {
        hasError: false,
        hasRetryButton: false,
        isWaitingForInput: false,
        confidence: 0,
      };
    }
  }

  // ==================== GUI Actions ====================

  private async clickRetry(coords: { x: number; y: number }): Promise<void> {
    console.log(`[Monitor] Clicking Retry at (${coords.x}, ${coords.y})`);
    this.updateStatus({ state: "retrying", message: `Clicking Retry button` });

    const platform = os.platform();

    if (platform === "darwin") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      try {
        // Try cliclick first (brew install cliclick)
        await execAsync(`cliclick c:${coords.x},${coords.y}`);
      } catch {
        // Fallback to AppleScript
        await execAsync(
          `osascript -e 'tell application "System Events" to click at {${coords.x}, ${coords.y}}'`
        );
      }
    } else {
      throw new Error(`Click not implemented for ${platform}`);
    }
  }

  private async typeInput(text: string): Promise<void> {
    console.log(`[Monitor] Typing input: ${text.slice(0, 50)}...`);

    const platform = os.platform();

    if (platform === "darwin") {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const escaped = text.replace(/"/g, '\\"').replace(/'/g, "\\'");

      try {
        await execAsync(`cliclick t:"${escaped}"`);
      } catch {
        await execAsync(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
      }

      // Press Enter to submit
      await execAsync(`osascript -e 'tell application "System Events" to key code 36'`);
    } else {
      throw new Error(`Type not implemented for ${platform}`);
    }
  }

  // ==================== Status ====================

  private updateStatus(partial: Partial<MonitorStatus>): void {
    const status: MonitorStatus = {
      state: partial.state || "monitoring",
      timestamp: Date.now(),
      errorCount: this.errorCount,
      retryCount: this.retryCount,
      ...partial,
    };

    if (this.config.onStatus) {
      this.config.onStatus(status);
    }

    this.emit("status", status);
  }

  /**
   * Get current status
   */
  getStatus(): MonitorStatus {
    return {
      state: this.isRunning ? "monitoring" : "idle",
      timestamp: Date.now(),
      errorCount: this.errorCount,
      retryCount: this.retryCount,
    };
  }

  /**
   * Get status of all tracked Antigravity windows
   * For command center integration
   */
  getWindowStatuses(): AntigravityWindowStatus[] {
    return Array.from(this.windowStatuses.values());
  }
}
