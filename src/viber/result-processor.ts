/**
 * Result Processor for handling large tool outputs
 *
 * Automatically saves large tool results as artifacts to avoid token consumption
 */

import fs from "fs/promises";
import path from "path";
import { getViberRoot } from "./config";

export interface ProcessedResult {
  original?: any;
  processed: any;
  wasProcessed: boolean;
  artifactId?: string;
}

/**
 * Process a tool result to handle large outputs
 * @param result The tool result
 * @param toolName Name of the tool that produced the result
 * @param spaceId Space ID for artifact storage
 * @param threshold Size threshold in bytes (default 10KB)
 */
export async function processToolResult(
  result: any,
  toolName: string,
  spaceId?: string,
  threshold: number = 10000
): Promise<ProcessedResult> {
  // If no space context, return as-is
  if (!spaceId || !result) {
    return {
      original: result,
      processed: result,
      wasProcessed: false,
    };
  }

  // Check the size of the result
  const resultStr =
    typeof result === "string" ? result : JSON.stringify(result);

  // If result is smaller than threshold, return as-is
  if (resultStr.length <= threshold) {
    return {
      original: result,
      processed: result,
      wasProcessed: false,
    };
  }

  // Large result - save as artifact
  const artifactsDir = path.join(getViberRoot(), spaceId, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactId = `${toolName}_${timestamp}.${typeof result === "string" ? "txt" : "json"}`;

  // Save the full result as an artifact
  await fs.writeFile(path.join(artifactsDir, artifactId), resultStr);

  // Create a summary/reference object
  const processed = {
    __type: "large_result_reference",
    artifactId,
    toolName,
    size: resultStr.length,
    sizeFormatted: formatBytes(resultStr.length),
    saved: true,
    message: `Large result (${formatBytes(
      resultStr.length
    )}) saved as artifact: ${artifactId}`,
    preview: resultStr.substring(0, 500) + "...",
    // Include key information if it's a structured object
    ...(typeof result === "object" &&
      !Array.isArray(result) && {
      keys: Object.keys(result).slice(0, 10),
      keyCount: Object.keys(result).length,
    }),
    // Include array info if it's an array
    ...(Array.isArray(result) && {
      itemCount: result.length,
      firstItems: result.slice(0, 3),
    }),
  };

  return {
    original: result,
    processed,
    wasProcessed: true,
    artifactId,
  };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Check if a result is a large result reference
 */
export function isLargeResultReference(result: any): boolean {
  return result?.__type === "large_result_reference";
}

/**
 * Load the original result from a large result reference
 */
export async function loadLargeResult(
  reference: any,
  spaceId: string
): Promise<any> {
  if (!isLargeResultReference(reference)) {
    return reference;
  }

  const artifactsDir = path.join(getViberRoot(), spaceId, "artifacts");
  const resolvedArtifactsDir = path.resolve(artifactsDir);
  const artifactPath = path.resolve(resolvedArtifactsDir, reference.artifactId);

  // Prevent path traversal
  if (!artifactPath.startsWith(resolvedArtifactsDir + path.sep)) {
    throw new Error(`Invalid artifact path: ${reference.artifactId}`);
  }

  try {
    await fs.access(artifactPath);
  } catch {
    throw new Error(`Artifact not found: ${reference.artifactId}`);
  }

  // We need to read the content separately.
  const contentBuffer = await fs.readFile(artifactPath);
  const content = contentBuffer.toString("utf-8");

  if (reference.artifactId.endsWith(".json")) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}
