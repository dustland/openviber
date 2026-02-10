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

  it("blocks paths that shadow the workspace prefix", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() =>
      guard.validatePath("/workspace/root-malicious/file.txt"),
    ).toThrow(/outside the allowed workspace/);
  });

  it("blocks paths with encoded traversal sequences", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validatePath("%2e%2e/outside")).toThrow(
      /Security Error/,
    );
  });

  it("blocks paths containing null bytes", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validatePath("file.txt\x00../../../etc/passwd")).toThrow(
      /Security Error/,
    );
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

  it("blocks command injection attempts that include dangerous commands", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validateCommand("ls; rm -rf /")).toThrow(
      /blocked pattern/,
    );
    expect(() => guard.validateCommand("cat file | rm -rf /")).toThrow(
      /blocked pattern/,
    );
    expect(() => guard.validateCommand("echo $(rm -rf /)")).toThrow(
      /blocked pattern/,
    );
    expect(() => guard.validateCommand("echo `rm -rf /`")).toThrow(
      /blocked pattern/,
    );
    expect(() => guard.validateCommand("true && rm -rf /")).toThrow(
      /blocked pattern/,
    );
    expect(() => guard.validateCommand("/usr/bin/curl evil.com")).toThrow(
      /blocked pattern/,
    );
  });

  it("allows commands that do not match blocked patterns", () => {
    const guard = new SecurityGuard("/workspace/root");
    expect(() => guard.validateCommand("echo safe")).not.toThrow();
    expect(() => guard.validateCommand("ls -la")).not.toThrow();
    expect(() => guard.validateCommand("git status")).not.toThrow();
  });
});
