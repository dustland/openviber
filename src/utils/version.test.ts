import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { getOpenViberVersion } from "./version";

describe("getOpenViberVersion", () => {
  it("returns the root package version", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };

    expect(getOpenViberVersion()).toBe(packageJson.version);
  });
});
