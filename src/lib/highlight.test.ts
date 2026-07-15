import { describe, it, expect } from "vitest";
import { highlightLines } from "./highlight";

describe("highlightLines", () => {
  it("returns empty array for empty content", () => {
    const result = highlightLines("");
    expect(result).toEqual([""]);
  });

  it("highlights JavaScript code", () => {
    const result = highlightLines("const x = 1;", "js");
    expect(result.length).toBe(1);
    expect(result[0]).toContain("const");
    // The result should contain span tags with syntax highlighting
    expect(result[0]).toMatch(/<span/);
  });

  it("highlights TypeScript code", () => {
    const result = highlightLines("function greet(name: string): void {}", "ts");
    expect(result.length).toBe(1);
    expect(result[0]).toContain("function");
    expect(result[0]).toMatch(/<span/);
  });

  it("highlights Rust code", () => {
    const result = highlightLines('fn main() { println!("hello"); }', "rs");
    expect(result.length).toBe(1);
    expect(result[0]).toContain("fn");
  });

  it("returns multiple lines for multi-line input", () => {
    const code = "const x = 1;\nconst y = 2;";
    const result = highlightLines(code, "js");
    expect(result.length).toBe(2);
  });

  it("escapes HTML in output to prevent XSS", () => {
    // highlight.js may or may not highlight this, but the output should never
    // contain raw <script> tags
    const result = highlightLines("some text <script>alert('xss')</script>");
    expect(result[0]).not.toContain("<script>");
    expect(result[0]).not.toContain("</script>");
  });

  it("handles multi-line comments spanning lines", () => {
    const code = "/* start\nmiddle\nend */\nconst x = 1;";
    const result = highlightLines(code, "js");
    // Should not crash and return the correct number of lines
    expect(result.length).toBe(4);
  });

  it("auto-detects language when no extension given", () => {
    const result = highlightLines("console.log('hello');");
    // Auto-detection should pick JavaScript
    expect(result.length).toBe(1);
    expect(result[0]).toMatch(/<span/);
  });

  it("handles empty lines in the middle of content", () => {
    const code = "line1\n\nline3";
    const result = highlightLines(code, "js");
    expect(result.length).toBe(3);
    // Lines should be present, empty line should not crash
    expect(typeof result[0]).toBe("string");
    expect(typeof result[1]).toBe("string");
    expect(typeof result[2]).toBe("string");
  });

  it("maps file extensions to highlight.js languages correctly", () => {
    const testCases: [string, string][] = [
      ["const x: number = 1;", "ts"],
      ["def hello():", "py"],
      ["<html><body></body></html>", "html"],
      ["// comment\nfn main() {}", "rs"],
    ];

    for (const [code, ext] of testCases) {
      const result = highlightLines(code, ext);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toContain(">");
    }
  });
});
