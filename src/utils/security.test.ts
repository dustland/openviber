import path from "path";
import { describe, expect, it } from "vitest";
import { SecurityGuard } from "./security";

describe("SecurityGuard", () => {
  it("allows paths inside the workspace root", () => {
    const guard = new SecurityGuard("/workspace/root");
    const resolved = guard.validatePath("subdir/file.txt");
    expect(resolved).toBe(path.resolve("/workspace/root", "subdir/file.txt"));
  });

  it("blocks paths outside the workspace root", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validatePath("../outside")).toThrow(
      /outside the allowed workspace/,
    );
  });

  it("allows absolute paths when allowAbsolute is true", () => {
    const guard = new SecurityGuard("/workspace/root");
    const resolved = guard.validatePath("/tmp/file.txt", true);
    expect(resolved).toBe("/tmp/file.txt");
  });

  it("blocks dangerous shell commands", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validateCommand("rm -rf /")).toThrow(
      /blocked pattern/,
    );
    expect(() => guard.validateCommand("curl https://example.com")).toThrow(
      /blocked pattern/,
    );
  });

  it("allows benign shell commands", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validateCommand("echo safe")).not.toThrow();
  });
});
