import { Agent } from "./agent";
import { Space } from "./space";
import { Plan } from "./plan";
import { Task, TaskStatus } from "./task";
import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * Planner - Encapsulates planning logic using an agent.
 */
export class Planner {
  constructor(
    private space: Space,
    private agent: Agent
  ) {}

  /**
   * Create or update the space plan
   */
  async createPlan(goal?: string): Promise<Plan> {
    const planGoal = goal || this.space.goal;

    // Generate plan using LLM
    const planSchema = z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          assignedTo: z.string().optional(),
          priority: z.enum(["low", "medium", "high"]).default("medium"),
          estimatedTime: z.string().optional(),
          dependencies: z
            .array(
              z.object({
                taskId: z.string(),
                type: z.enum(["required", "optional"]),
              }),
            )
            .default([]),
          tags: z.array(z.string()).default([]),
        }),
      ),
    });

    const result = await generateText({
      model: this.agent.getModel(),
      system:
        this.agent.getSystemPrompt() +
        "\n\nCreate a detailed plan to achieve the goal.",
      prompt: `Goal: ${planGoal}\n\nAvailable agents: ${Array.from(
        this.space.agents.keys(),
      ).join(", ")}`,
      output: Output.object({ schema: planSchema }),
    });

    // Create Plan with Tasks - cast result.output to inferred schema type
    const planData = result.output as z.infer<typeof planSchema>;
    const tasks = planData.tasks.map(
      (taskData: z.infer<typeof planSchema>["tasks"][number]) =>
        new Task({
          ...taskData,
          status: TaskStatus.PENDING,
        }),
    );

    const plan = new Plan({
      goal: planGoal,
      tasks,
    });

    await this.space.createPlan(plan);
    return plan;
  }

  /**
   * Adapt the plan based on new information or user feedback
   */
  async adaptPlan(feedback: string): Promise<Plan> {
    if (!this.space.plan) {
      // No existing plan, create a new one with the feedback
      return this.createPlan(feedback);
    }

    const currentPlan = this.space.plan;
    const progress = currentPlan.getProgressSummary();

    // Schema for plan adaptation
    const adaptSchema = z.object({
      preserveTasks: z
        .array(z.string())
        .describe("IDs of tasks to keep unchanged"),
      modifyTasks: z
        .array(
          z.object({
            id: z.string(),
            changes: z.object({
              title: z.string().optional(),
              description: z.string().optional(),
              priority: z.enum(["low", "medium", "high"]).optional(),
              assignedTo: z.string().optional(),
            }),
          }),
        )
        .describe("Tasks to modify"),
      removeTasks: z.array(z.string()).describe("IDs of tasks to remove"),
      addTasks: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            description: z.string(),
            assignedTo: z.string().optional(),
            priority: z.enum(["low", "medium", "high"]).default("medium"),
            dependencies: z
              .array(
                z.object({
                  taskId: z.string(),
                  type: z.enum(["required", "optional"]),
                }),
              )
              .default([]),
            tags: z.array(z.string()).default([]),
          }),
        )
        .describe("New tasks to add"),
      reasoning: z.string().describe("Explanation of the plan changes"),
    });

    const prompt = `
Current Plan Progress:
- Total tasks: ${progress.totalTasks}
- Completed: ${progress.completedTasks}
- In Progress: ${progress.runningTasks}
- Pending: ${progress.pendingTasks}

Current Tasks:
${currentPlan.tasks
        .map((t) => `- [${t.id}] ${t.title} (${t.status})`)
        .join("\n")}

User Feedback: ${feedback}

Analyze the current plan and adapt it based on the user's feedback.
Keep completed tasks unless explicitly asked to redo them.
Preserve tasks that are still relevant.
Modify, remove, or add tasks as needed to better achieve the goal.
`;

    const result = await generateText({
      model: this.agent.getModel(),
      system:
        this.agent.getSystemPrompt() +
        "\n\nAdapt the existing plan based on user feedback.",
      prompt,
      output: Output.object({ schema: adaptSchema }),
    });

    // Apply adaptations - cast result.output to inferred schema type
    const adaptData = result.output as z.infer<typeof adaptSchema>;
    const adaptedTasks: Task[] = [];

    // Keep preserved tasks
    for (const taskId of adaptData.preserveTasks) {
      const task = currentPlan.tasks.find((t) => t.id === taskId);
      if (task) {
        adaptedTasks.push(task);
      }
    }

    // Modify tasks
    for (const modification of adaptData.modifyTasks) {
      const task = currentPlan.tasks.find((t) => t.id === modification.id);
      if (task) {
        // Apply changes
        if (modification.changes.title) task.title = modification.changes.title;
        if (modification.changes.description)
          task.description = modification.changes.description;
        if (modification.changes.priority)
          task.priority = modification.changes.priority;
        if (modification.changes.assignedTo)
          task.assignedTo = modification.changes.assignedTo;
        adaptedTasks.push(task);
      }
    }

    // Add new tasks
    for (const newTaskData of adaptData.addTasks) {
      const newTask = new Task({
        ...newTaskData,
        status: TaskStatus.PENDING,
      });
      adaptedTasks.push(newTask);
    }

    // Create adapted plan
    const adaptedPlan = new Plan({
      goal: currentPlan.goal,
      tasks: adaptedTasks,
    });

    // Update space with adapted plan
    await this.space.createPlan(adaptedPlan);

    // Log the reasoning
    console.log("[Plan Adaptation]", adaptData.reasoning);

    return adaptedPlan;
  }

  /**
   * Get plan status summary for system prompt
   */
  getPlanStatusSummary(): string {
    if (!this.space.plan) {
      return "\n\nNo active plan for this space yet.";
    }

    const summary = this.space.plan.getProgressSummary();
    return `

Current Plan Status:
- Total tasks: ${summary.totalTasks}
- Completed: ${summary.completedTasks}
- Running: ${summary.runningTasks}
- Pending: ${summary.pendingTasks}
- Failed: ${summary.failedTasks}
- Progress: ${summary.progressPercentage.toFixed(1)}%
`;
  }
}
