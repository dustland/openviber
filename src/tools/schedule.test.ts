import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const accessMock = vi.fn();
const readdirMock = vi.fn();
const readFileMock = vi.fn();
const unlinkMock = vi.fn();

vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  access: (...args: unknown[]) => accessMock(...args),
  readdir: (...args: unknown[]) => readdirMock(...args),
  readFile: (...args: unknown[]) => readFileMock(...args),
  unlink: (...args: unknown[]) => unlinkMock(...args),
}));

vi.mock("os", () => ({
  homedir: () => "/home/tester",
}));

import { createJobTool, deleteJobTool, listJobsTool } from "./schedule";

const JOBS_DIR = "/tmp/openviber-jobs";

describe("schedule tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENVIBER_JOBS_DIR = JOBS_DIR;
  });

  it("creates a scheduled job from natural language time", async () => {
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);

    const result = await createJobTool.execute({
      name: "Daily Report",
      schedule: "8am daily",
      task: "Send the daily report",
    });

    expect(result.success).toBe(true);
    expect(result.cronExpression).toBe("0 8 * * *");
    expect(result.jobPath).toBe(`${JOBS_DIR}/daily-report.yaml`);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [pathArg, contentArg] = writeFileMock.mock.calls[0] as [
      string,
      string,
    ];
    expect(pathArg).toBe(`${JOBS_DIR}/daily-report.yaml`);
    expect(contentArg).toContain("name: Daily Report");
    expect(contentArg).toContain("schedule: 0 8 * * *");
    expect(contentArg).toContain("model: deepseek/deepseek-chat");
  });

  it("returns an error when schedule cannot be parsed", async () => {
    const result = await createJobTool.execute({
      name: "Bad Schedule",
      schedule: "sometime later",
      task: "Do something",
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Could not parse schedule");
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("lists jobs as empty when jobs directory is missing", async () => {
    accessMock.mockRejectedValue(new Error("missing"));

    const result = await listJobsTool.execute({});

    expect(result.jobs).toEqual([]);
    expect(result.message).toContain("No jobs directory");
  });

  it("lists scheduled jobs from YAML files", async () => {
    accessMock.mockResolvedValue(undefined);
    readdirMock.mockResolvedValue(["morning.yaml", "notes.txt"]);
    readFileMock.mockResolvedValue(
      [
        "name: Morning Brief",
        "schedule: 0 9 * * *",
        "prompt: Summarize yesterday",
      ].join("\n"),
    );

    const result = await listJobsTool.execute({});

    expect(result.count).toBe(1);
    expect(result.jobs[0]).toMatchObject({
      name: "Morning Brief",
      schedule: "0 9 * * *",
      enabled: true,
    });
    expect(result.jobs[0].task).toContain("Summarize yesterday");
  });

  it("deletes a scheduled job when file exists", async () => {
    unlinkMock.mockResolvedValueOnce(undefined);

    const result = await deleteJobTool.execute({ name: "Nightly Check" });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Deleted job");
    expect(unlinkMock).toHaveBeenCalledWith(
      `${JOBS_DIR}/nightly-check.yaml`,
    );
  });

  it("returns error when scheduled job is not found", async () => {
    unlinkMock.mockRejectedValue(new Error("missing"));

    const result = await deleteJobTool.execute({ name: "Missing Job" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
