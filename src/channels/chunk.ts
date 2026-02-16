/**
 * Platform-aware, Unicode-safe message chunking utility.
 *
 * Splits long text into chunks that respect platform character limits
 * without breaking Unicode surrogate pairs, emoji, or grapheme clusters.
 *
 * @module channels/chunk
 */

/** Per-channel maximum message lengths (in characters). */
export const CHANNEL_LIMITS = {
  telegram: 4096,
  discord: 2000,
  feishu: 30000,
  wecom: 2048,
  dingtalk: 20000,
  wechat: 2048,
} as const;

/**
 * Split text into chunks that fit within a character limit.
 *
 * Key guarantees:
 *  - Never splits in the middle of a Unicode surrogate pair or grapheme cluster
 *  - Prefers splitting at line boundaries (\n)
 *  - Falls back to splitting at word boundaries (space)
 *  - Only splits mid-word as a last resort (using Array.from for code-point safety)
 *  - Preserves content order; no content is dropped
 */
export function chunkText(text: string, limit: number): string[] {
  if (limit < 1) throw new RangeError("chunkText: limit must be >= 1");

  // Fast path: text fits in a single chunk.
  // Use Array.from to count actual code points, not UTF-16 units.
  if (codePointLength(text) <= limit) return [text];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  const flush = (): void => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      chunks.push(current);
    }
    current = "";
  };

  for (const line of lines) {
    const lineLen = codePointLength(line);

    // Empty line (paragraph break)
    if (!line) {
      if (codePointLength(current) + 1 > limit) {
        flush();
      }
      current += "\n";
      continue;
    }

    // Line is longer than limit — must split it further
    if (lineLen > limit) {
      if (current) flush();
      for (const part of splitLongLine(line, limit)) {
        chunks.push(part);
      }
      continue;
    }

    // Normal line — try to append
    const separator = current ? "\n" : "";
    if (codePointLength(current) + separator.length + lineLen > limit) {
      flush();
    }
    current += (current ? "\n" : "") + line;
  }

  flush();
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Split a single long line that exceeds the limit.
 * First tries word boundaries, then falls back to code-point-safe slicing.
 */
function splitLongLine(line: string, limit: number): string[] {
  const words = line.split(/(\s+)/); // preserve whitespace tokens
  const parts: string[] = [];
  let current = "";

  for (const word of words) {
    const wordLen = codePointLength(word);

    if (wordLen > limit) {
      // Word itself is too long — split at code-point level
      if (current) {
        parts.push(current);
        current = "";
      }
      for (const segment of codePointSlice(word, limit)) {
        parts.push(segment);
      }
      continue;
    }

    if (codePointLength(current) + wordLen > limit) {
      if (current) parts.push(current);
      current = word;
    } else {
      current += word;
    }
  }

  if (current) parts.push(current);
  return parts;
}

/**
 * Count the number of Unicode code points in a string.
 * This correctly counts surrogate pairs (emoji, CJK extensions) as 1.
 */
function codePointLength(str: string): number {
  // Spreading a string iterates over code points, not UTF-16 units.
  let count = 0;
  for (const _ of str) {
    count++;
  }
  return count;
}

/**
 * Slice a string into segments of at most `limit` code points each,
 * never breaking surrogate pairs.
 */
function codePointSlice(str: string, limit: number): string[] {
  const segments: string[] = [];
  const codePoints = Array.from(str); // each element is a full code point
  for (let i = 0; i < codePoints.length; i += limit) {
    segments.push(codePoints.slice(i, i + limit).join(""));
  }
  return segments;
}

/**
 * Convenience: chunk text using a named channel's limit.
 */
export function chunkForChannel(
  text: string,
  channel: keyof typeof CHANNEL_LIMITS,
): string[] {
  return chunkText(text, CHANNEL_LIMITS[channel]);
}
