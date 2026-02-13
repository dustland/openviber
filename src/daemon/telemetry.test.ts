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
    // mount === "/" -> included initially
    // mount === "/System/Volumes/Data" -> included (macOS APFS data volume)
    // mount.startsWith("/Users") -> included
    // mount === "/tmp" -> included
    // mount.startsWith("/snap") -> excluded
    //
    // APFS dedup: when /System/Volumes/Data is present, "/" is dropped
    // because they share the same container and "/" is just a system snapshot.

    // Also checks totalKb > 0.

    expect(disks).toHaveLength(3);

    // "/" is dropped because /System/Volumes/Data is present (APFS dedup)
    expect(disks.find(d => d.mount === "/")).toBeUndefined();

    // Check /System/Volumes/Data (macOS data volume)
    const dataVol = disks.find(d => d.mount === "/System/Volumes/Data");
    expect(dataVol).toBeDefined();
    expect(dataVol?.totalBytes).toBe(10000000 * 1024);

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

  it("should include macOS /System/Volumes/Data but exclude other /System volumes", async () => {
    const mockOutput = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/disk3s1s1   482766932  12008272  53287044    19%    /
devfs                  205       205         0   100%    /dev
/dev/disk3s6     482766932   6291860  53287044    11%    /System/Volumes/VM
/dev/disk3s2     482766932   8149420  53287044    14%    /System/Volumes/Preboot
/dev/disk3s4     482797652      2532  53315232     1%    /System/Volumes/Update
/dev/disk3s5     482766932 401657600  53287044    89%    /System/Volumes/Data
map auto_home            0         0         0   100%    /System/Volumes/Data/home
`;
    (exec as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd, options, callback) => {
        callback(null, mockOutput, "");
      }
    );

    const disks = await collectDiskStatus();

    // APFS dedup: "/" should be dropped when /System/Volumes/Data is present
    expect(disks).toHaveLength(1);
    expect(disks.find(d => d.mount === "/")).toBeUndefined();

    const dataVol = disks.find(d => d.mount === "/System/Volumes/Data");
    expect(dataVol).toBeDefined();
    expect(dataVol?.usedBytes).toBe(401657600 * 1024);

    // Other /System volumes should be excluded
    expect(disks.find(d => d.mount === "/System/Volumes/VM")).toBeUndefined();
    expect(disks.find(d => d.mount === "/System/Volumes/Preboot")).toBeUndefined();
    expect(disks.find(d => d.mount === "/System/Volumes/Update")).toBeUndefined();

    // auto_home with 0 total should be excluded
    expect(disks.find(d => d.mount === "/System/Volumes/Data/home")).toBeUndefined();
  });
});
