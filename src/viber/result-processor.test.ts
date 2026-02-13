import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { loadLargeResult } from "./result-processor";
import { getViberRoot } from "./config";

// Mock getViberRoot to control the root directory
vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    getViberRoot: vi.fn(),
  };
});

describe("result-processor security", () => {
  let tempDir: string;
  let viberRoot: string;
  const spaceId = "test-space";

  beforeEach(async () => {
    // Create a temporary directory structure
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "viber-test-"));
    viberRoot = path.join(tempDir, "viber-root");
    await fs.mkdir(viberRoot, { recursive: true });

    // Mock getViberRoot to return our temp directory
    vi.mocked(getViberRoot).mockReturnValue(viberRoot);
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("should prevent path traversal attacks in loadLargeResult", async () => {
    // Setup:
    // 1. Create a sensitive file outside the artifacts directory
    const secretFile = "secret.txt";
    const secretContent = "super secret content";
    await fs.writeFile(path.join(viberRoot, secretFile), secretContent);

    // 2. The artifacts directory would be at viberRoot/spaceId/artifacts
    const artifactsDir = path.join(viberRoot, spaceId, "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });

    // 3. Construct a malicious artifactId that traverses up to the secret file
    // Relative path from artifactsDir to secretFile: ../../secret.txt
    const maliciousArtifactId = "../../secret.txt";

    const reference = {
      __type: "large_result_reference",
      artifactId: maliciousArtifactId,
    };

    // Action & Assertion
    // We expect this to fail with a security error
    await expect(loadLargeResult(reference, spaceId)).rejects.toThrow(/Access denied|Invalid artifact path/);
  });

  it("should allow valid artifact paths in loadLargeResult", async () => {
    // Setup:
    // 1. Create a valid artifact
    const artifactsDir = path.join(viberRoot, spaceId, "artifacts");
    await fs.mkdir(artifactsDir, { recursive: true });

    const validArtifactId = "valid_artifact.txt";
    const validContent = "valid content";
    await fs.writeFile(path.join(artifactsDir, validArtifactId), validContent);

    const reference = {
      __type: "large_result_reference",
      artifactId: validArtifactId,
    };

    // Action & Assertion
    const result = await loadLargeResult(reference, spaceId);
    expect(result).toBe(validContent);
  });
});
