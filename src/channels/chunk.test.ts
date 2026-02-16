import { describe, it, expect } from "vitest";
import { chunkText, chunkForChannel, CHANNEL_LIMITS } from "./chunk";

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    expect(chunkText("hello", 100)).toEqual(["hello"]);
  });

  it("returns original text when exactly at limit", () => {
    const text = "a".repeat(100);
    expect(chunkText(text, 100)).toEqual([text]);
  });

  it("splits at line boundaries", () => {
    const text = "line1\nline2\nline3";
    const chunks = chunkText(text, 10);
    // Each line + separator fits within 10 chars
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join("\n")).toBe(text);
  });

  it("splits long lines at word boundaries", () => {
    const text = "hello world foo bar baz";
    const chunks = chunkText(text, 12);
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk should exceed limit in code points
    for (const chunk of chunks) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(12);
    }
    // All content preserved
    expect(chunks.join("").replace(/\s+/g, " ").trim()).toBe(text);
  });

  it("handles very long words by splitting at code-point level", () => {
    const longWord = "a".repeat(50);
    const chunks = chunkText(longWord, 10);
    expect(chunks).toHaveLength(5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
    expect(chunks.join("")).toBe(longWord);
  });

  // ─── Unicode safety ──────────────────────────────────────────────────

  it("does not split emoji surrogate pairs", () => {
    // 🎉 is U+1F389, encoded as 2 UTF-16 code units (surrogate pair)
    const emoji = "🎉".repeat(10); // 10 code points, 20 UTF-16 units
    const chunks = chunkText(emoji, 5);
    expect(chunks).toHaveLength(2);
    // Each chunk should have exactly 5 emoji (5 code points)
    for (const chunk of chunks) {
      expect(Array.from(chunk).length).toBe(5);
    }
    expect(chunks.join("")).toBe(emoji);
  });

  it("handles mixed ASCII and emoji", () => {
    const text = "Hi 🎉🎊🥳 there!";
    const chunks = chunkText(text, 8);
    // All chunks should be valid Unicode
    for (const chunk of chunks) {
      // Should not contain lone surrogates
      expect(chunk).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(chunk).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("handles CJK characters correctly", () => {
    const text = "你好世界这是一个测试字符串";
    const chunks = chunkText(text, 5);
    for (const chunk of chunks) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(5);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("handles flag emoji (2 code points each)", () => {
    // Flags use regional indicator pairs: 🇺🇸 = U+1F1FA U+1F1F8
    const flags = "🇺🇸🇬🇧🇯🇵🇩🇪🇫🇷";
    const chunks = chunkText(flags, 4);
    // No chunk should contain broken regional indicators
    expect(chunks.join("")).toBe(flags);
  });

  it("handles multiline text with emoji", () => {
    const text = "Hello! 🎉\nThis is a test 🎊\nWith emoji! 🥳";
    const chunks = chunkText(text, 20);
    expect(chunks.join("\n")).toBe(text);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it("handles empty string", () => {
    expect(chunkText("", 100)).toEqual([""]);
  });

  it("throws on limit < 1", () => {
    expect(() => chunkText("hello", 0)).toThrow();
  });

  it("handles limit of 1", () => {
    const chunks = chunkText("abc", 1);
    expect(chunks).toEqual(["a", "b", "c"]);
  });

  it("preserves paragraph breaks", () => {
    const text = "paragraph1\n\nparagraph2";
    const chunks = chunkText(text, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });
});

describe("chunkForChannel", () => {
  it("uses correct Telegram limit", () => {
    expect(CHANNEL_LIMITS.telegram).toBe(4096);
  });

  it("uses correct Discord limit", () => {
    expect(CHANNEL_LIMITS.discord).toBe(2000);
  });

  it("chunks text for a named channel", () => {
    const text = "x".repeat(3000);
    const chunks = chunkForChannel(text, "discord");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(2000);
    }
  });
});
