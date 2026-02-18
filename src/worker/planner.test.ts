import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Planner } from './planner';
import { Agent } from './agent';
import { Space } from './space';
import { Plan } from './plan';
import { Task, TaskStatus } from './task';

// Mock generateText from 'ai'
vi.mock('ai', async (importOriginal) => {
  const mod = await importOriginal<typeof import('ai')>();
  return {
    ...mod,
    generateText: vi.fn(),
    Output: {
      object: vi.fn((config) => config),
    },
  };
});

describe('Planner', () => {
  let planner: Planner;
  let mockSpace: any;
  let mockAgent: any;

  beforeEach(() => {
    mockSpace = {
      goal: 'Test Goal',
      agents: new Map([['agent1', {}]]),
      plan: undefined,
      createPlan: vi.fn(),
      userId: 'test-user',
    };

    mockAgent = {
      getModel: vi.fn().mockReturnValue('mock-model'),
      getSystemPrompt: vi.fn().mockReturnValue('System Prompt'),
    };

    planner = new Planner(mockSpace as unknown as Space, mockAgent as unknown as Agent);
  });

  it('should create a plan', async () => {
    const { generateText } = await import('ai');
    (generateText as any).mockResolvedValueOnce({
      output: {
        tasks: [
          { id: '1', title: 'Task 1', description: 'Desc 1', priority: 'medium', tags: [], dependencies: [] }
        ]
      }
    });

    const plan = await planner.createPlan();

    expect(plan).toBeInstanceOf(Plan);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].title).toBe('Task 1');
    expect(mockSpace.createPlan).toHaveBeenCalled();
    expect(mockAgent.getSystemPrompt).toHaveBeenCalled();
  });

  it('should adapt a plan', async () => {
    // Setup existing plan
    const existingPlan = new Plan({ goal: 'Old Goal', tasks: [] });
    mockSpace.plan = existingPlan;

    // Mock generateText for adaptation
    const { generateText } = await import('ai');
    (generateText as any).mockResolvedValueOnce({
      output: {
        preserveTasks: [],
        modifyTasks: [],
        removeTasks: [],
        addTasks: [
          { id: '2', title: 'Task 2', description: 'Desc 2', priority: 'high', tags: [], dependencies: [] }
        ],
        reasoning: 'Adaptation reasoning'
      }
    });

    const adaptedPlan = await planner.adaptPlan('Add Task 2');

    expect(adaptedPlan).toBeInstanceOf(Plan);
    expect(adaptedPlan.tasks).toHaveLength(1);
    expect(adaptedPlan.tasks[0].title).toBe('Task 2');
    expect(mockSpace.createPlan).toHaveBeenCalled();
  });

  it('should return plan status summary', () => {
    const summary = planner.getPlanStatusSummary();
    expect(summary).toContain('No active plan');

    mockSpace.plan = new Plan({ goal: 'Goal', tasks: [] });
    const summaryWithPlan = planner.getPlanStatusSummary();
    expect(summaryWithPlan).toContain('Current Plan Status');
  });
});
