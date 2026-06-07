import { describe, it, expect } from "vitest";
import { encodeCommentBody, decodeCommentBody } from "../../src/core/encode.js";

const roundTrip = (s: string) => decodeCommentBody(encodeCommentBody(s));

describe("comment-body escaping", () => {
  it("leaves plain text untouched", () => {
    const s = "This section needs a goal about agents.";
    expect(encodeCommentBody(s)).toBe(s);
    expect(roundTrip(s)).toBe(s);
  });

  it("encoded form never contains a literal '-->'", () => {
    const s = "Close the comment early: --> and then more text";
    const enc = encodeCommentBody(s);
    expect(enc).not.toContain("-->");
    expect(enc).not.toContain("--");
    expect(roundTrip(s)).toBe(s);
  });

  it("encoded form never contains a double dash '--'", () => {
    const samples = [
      "--",
      "---",
      "----",
      "a--b",
      "-->",
      "<!-- nested -->",
      "em — dash already, but -- two ascii dashes",
      "flag --verbose --json --message",
    ];
    for (const s of samples) {
      const enc = encodeCommentBody(s);
      expect(enc, `enc of ${JSON.stringify(s)}`).not.toContain("--");
      expect(roundTrip(s), `roundtrip of ${JSON.stringify(s)}`).toBe(s);
    }
  });

  it("round-trips backslashes and dash/backslash combinations", () => {
    const samples = [
      "\\",
      "\\\\",
      "back\\slash",
      "-\\",
      "\\-",
      "-\\-",
      "--\\--",
      "\\--\\",
      "path\\to--file",
      "C:\\temp\\-->done",
    ];
    for (const s of samples) {
      expect(roundTrip(s), `roundtrip of ${JSON.stringify(s)}`).toBe(s);
      expect(encodeCommentBody(s), `enc of ${JSON.stringify(s)}`).not.toContain(
        "--",
      );
    }
  });

  it("round-trips multiline bodies, unicode and emoji", () => {
    const s = "line one\nline two --> with arrow\n\nและภาษาไทย 🚀 -- end";
    expect(roundTrip(s)).toBe(s);
    expect(encodeCommentBody(s)).not.toContain("--");
  });

  it("decode is the exact inverse for adversarial fuzz", () => {
    // Deterministic pseudo-random strings drawn from a dangerous alphabet.
    const alphabet = ["-", "\\", "a", ">", "<", "!", "\n", " "];
    let seed = 1234567;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 2000; i++) {
      const len = Math.floor(rnd() * 14);
      let s = "";
      for (let j = 0; j < len; j++) {
        s += alphabet[Math.floor(rnd() * alphabet.length)];
      }
      const enc = encodeCommentBody(s);
      expect(enc, `enc of ${JSON.stringify(s)}`).not.toContain("--");
      expect(decodeCommentBody(enc), `roundtrip of ${JSON.stringify(s)}`).toBe(s);
    }
  });
});
