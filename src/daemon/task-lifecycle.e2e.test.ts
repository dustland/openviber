/**
 * E2E Test: Task Lifecycle on Viber Machine with Tmux
 *
 * Tests the complete task execution lifecycle:
 * 1. Run a task using the daemon runtime
 * 2. Use tmux terminal for command execution
 * 3. Monitor progress events as they stream
 * 4. Verify task completion
 *
 * This tests the viber machine's ability to execute real work.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { runTask } from "./runtime";
import { TerminalManager } from "./terminal";

const TEST_TIMEOUT = 60_000;

function hasTmux(): boolean {
    try {
        execSync("tmux -V", { stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

describe("Task Lifecycle with Tmux", () => {
    const skipIfNoTmux = hasTmux() ? it : it.skip;
    let terminalManager: TerminalManager;

    beforeAll(() => {
        terminalManager = new TerminalManager();
    });

    afterAll(() => {
        terminalManager.detachAll();
    });

    skipIfNoTmux(
        "reviews the entire OpenViber project and lists issues",
        async () => {
            const taskId = `project-review-${Date.now()}`;
            const progressEvents: any[] = [];
            let finalText = "";

            // Task: Review the entire project, not just a single file
            const { streamResult, agent } = await runTask(
                `Review the OpenViber project at ${process.cwd()}.
        
Use the terminal to:
1. Explore the project structure (ls, find, tree)
2. Check package.json for dependencies
3. Look at the main source directories (src/, web/, docs/)

Then provide a brief summary of:
- Project structure overview
- 3-5 potential issues or improvements you noticed

Be concise.`,
                { taskId }
            );

            // Collect progress events as they stream
            for await (const event of streamResult.fullStream) {
                progressEvents.push(event);

                // Log progress periodically
                if (progressEvents.length % 10 === 0) {
                    console.log(`[Progress] ${progressEvents.length} events received...`);
                }
            }

            // Get the final text after streaming completes
            finalText = await streamResult.text;

            // Verify we received progress events
            expect(progressEvents.length).toBeGreaterThan(0);

            // Verify agent was created with proper config
            expect(agent).toBeDefined();
            expect(agent.id).toBe("default");

            console.log("=== Project Review Results ===");
            console.log(`Total events: ${progressEvents.length}`);
            console.log(`Event types: ${[...new Set(progressEvents.map((e) => e.type))].join(", ")}`);
            console.log(`Response length: ${finalText.length} chars`);
            console.log("\n=== Response Preview ===");
            console.log(finalText.slice(0, 1000));
        },
        TEST_TIMEOUT * 3  // Longer timeout for full project review
    );

    skipIfNoTmux(
        "can be aborted mid-execution",
        async () => {
            const taskId = `test-abort-${Date.now()}`;
            const controller = new AbortController();

            const { streamResult } = await runTask(
                "Write a very long story about a dragon",
                { taskId, signal: controller.signal }
            );

            let eventCount = 0;
            try {
                for await (const event of streamResult.fullStream) {
                    eventCount++;
                    if (eventCount >= 5) {
                        controller.abort();
                        break;
                    }
                }
            } catch (err: any) {
                // Abort should throw
                expect(err.name).toMatch(/AbortError|Error/);
            }

            // Should have stopped early
            expect(eventCount).toBeLessThanOrEqual(10);
            console.log(`Aborted after ${eventCount} events`);
        },
        TEST_TIMEOUT
    );

    it("terminal manager lists tmux as available app", () => {
        const manager = new TerminalManager();
        const { apps } = manager.list();

        expect(apps.some((app) => app.id === "tmux")).toBe(true);
        expect(apps.some((app) => app.id === "shell")).toBe(true);
    });

    skipIfNoTmux("creates and manages tmux sessions for tasks", async () => {
        const manager = new TerminalManager();
        const sessionName = `viber-test-${Date.now()}`;

        // Create a tmux session
        const result = manager.createSession(sessionName, "main", process.cwd(), "tmux");
        expect(result.ok).toBe(true);
        expect(result.appId).toBe("tmux");

        // Verify session appears in list
        const { panes } = manager.list();
        const testPane = panes.find(
            (p) => p.appId === "tmux" && p.session.includes(sessionName)
        );
        expect(testPane).toBeDefined();

        // Attach and send a command
        const attached = await manager.attach(
            testPane!.target,
            () => { }, // onData
            () => { }, // onResize
            "tmux"
        );
        expect(attached).toBe(true);

        // Send input
        const inputSent = manager.sendInput(testPane!.target, "echo VIBER_TEST\n", "tmux");
        expect(inputSent).toBe(true);

        // Resize
        const resized = manager.resize(testPane!.target, 120, 40, "tmux");
        expect(resized).toBe(true);

        // Cleanup
        manager.detachAll();
        execSync(`tmux kill-session -t '${result.sessionName}'`, { stdio: "pipe" });
    });

    it("tracks multiple concurrent sessions", () => {
        const manager = new TerminalManager();

        // Create two shell sessions (always available)
        const session1 = manager.createSession("test-1", "main", process.cwd(), "shell");
        const session2 = manager.createSession("test-2", "main", process.cwd(), "shell");

        expect(session1.ok).toBe(true);
        expect(session2.ok).toBe(true);

        const { panes } = manager.list();
        const shellPanes = panes.filter((p) => p.appId === "shell");
        expect(shellPanes.length).toBeGreaterThanOrEqual(2);

        manager.detachAll();
    });
});
