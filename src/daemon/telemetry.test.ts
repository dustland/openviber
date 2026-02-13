import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectDiskStatus } from "./telemetry";
import { exec } from "child_process";

vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

describe("collectDiskStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse valid df output correctly", async () => {
    // Output format: Filesystem 1024-blocks Used Available Capacity Mounted on
    // Use spaces to simulate tabular output
    const mockOutput = `Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/disk1s1     100000000  50000000  50000000      50% /
/dev/disk1s2      10000000   1000000   9000000      10% /System/Volumes/Data
/dev/disk1s3      20000000  10000000  10000000      50% /Users/jules
tmpfs               500000        10    499990       1% /tmp
/dev/loop0             100       100         0     100% /snap/core
`;

    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd, options, callback) => {
        callback(null, mockOutput, "");
      }
    );

    const disks = await collectDiskStatus();

    expect(exec).toHaveBeenCalledWith(
      "df -kP 2>/dev/null",
      expect.objectContaining({ timeout: 5000, encoding: "utf-8" }),
      expect.any(Function)
    );

    // Filter logic:
    // mount === "/" -> included
    // mount.startsWith("/System") -> excluded
    // mount.startsWith("/Users") -> included
    // mount === "/tmp" -> included
    // mount.startsWith("/snap") -> excluded

    // Also checks totalKb > 0.

    expect(disks).toHaveLength(3);

    // Check /
    const root = disks.find(d => d.mount === "/");
    expect(root).toBeDefined();
    expect(root?.totalBytes).toBe(100000000 * 1024);
    expect(root?.usedBytes).toBe(50000000 * 1024);
    expect(root?.usagePercent).toBe(50.0);

    // Check /Users/jules
    const users = disks.find(d => d.mount === "/Users/jules");
    expect(users).toBeDefined();
    expect(users?.totalBytes).toBe(20000000 * 1024);

    // Check /tmp
    const tmp = disks.find(d => d.mount === "/tmp");
    expect(tmp).toBeDefined();

    // Check exclusion
    expect(disks.find(d => d.mount === "/snap/core")).toBeUndefined();
  });

  it("should handle empty output gracefully", async () => {
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd, options, callback) => {
        callback(null, "", "");
      }
    );

    const disks = await collectDiskStatus();
    expect(disks).toEqual([]);
  });

  it("should handle exec error gracefully", async () => {
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd, options, callback) => {
        callback(new Error("Command failed"), "", "some stderr");
      }
    );

    const disks = await collectDiskStatus();
    expect(disks).toEqual([]);
  });

  it("should ignore mounts with 0 total blocks", async () => {
    const mockOutput = `Filesystem     1024-blocks      Used Available Capacity Mounted on
map auto_home            0         0         0     100% /home
`;
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd, options, callback) => {
        callback(null, mockOutput, "");
      }
    );

    const disks = await collectDiskStatus();
    expect(disks).toEqual([]);
  });
});
