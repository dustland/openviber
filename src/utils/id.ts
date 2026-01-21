/**
 * ID Generator Utilities for Viber
 *
 * Simple, unique ID generation for documents and other entities.
 */

import { customAlphabet } from "nanoid";

// Define safe character set for IDs (A-Za-z0-9_)
const ALPHABET_SAFE =
  "abcdefghijklmnopqrstuvwxyz0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generate a short, unique ID that's URL-safe
 * Uses a custom alphabet to ensure compatibility
 *
 * @param length Length of the ID (default: 8)
 * @returns A short, unique ID string
 */
export function generateShortId(length: number = 8): string {
  // Create a custom nanoid generator
  const nanoid = customAlphabet(ALPHABET_SAFE, length);

  // Generate ID and ensure first character is a letter
  let id = nanoid();
  while (!/^[a-zA-Z]/.test(id)) {
    id = nanoid();
  }

  return id;
}

/**
 * Generate a space ID with optional topic prefix
 *
 * @param topic Optional topic to use as prefix
 * @returns A space ID like 'aB3x_9Kp' (always clean random ID)
 */
export function generateSpaceId(topic?: string): string {
  // Always generate a clean 8-char random ID to avoid URL encoding issues
  // with non-ASCII characters in topics
  return generateShortId(8);
}

/**
 * Validate a document ID
 * Checks that the ID starts with a letter and contains only letters, numbers, and underscores
 *
 * @param id ID string to validate
 * @returns Boolean indicating if the ID is valid
 */
export function validateId(id: string): boolean {
  if (!id || typeof id !== "string" || id.trim() === "") {
    return false;
  }

  // ID must start with a letter and contain only letters, numbers, and underscores
  const idPattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
  return idPattern.test(id);
}
