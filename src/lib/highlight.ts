import hljs from "highlight.js";

/**
 * Escape HTML special characters to prevent XSS when rendering
 * fallback content via dangerouslySetInnerHTML.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Split highlighted HTML into per-line fragments, properly handling
 * span elements that wrap across line boundaries (e.g. multi-line comments).
 *
 * Each fragment is self-contained HTML that can be rendered with
 * dangerouslySetInnerHTML on a single line element.
 *
 * Returns the same number of lines as content.split('\n').
 */
function splitHighlightedCode(html: string): string[] {
  const lines: string[] = [];
  let currentLine = "";
  const openTags: string[] = [];

  // Tokenize: opening tags, closing tags, text chunks, newlines
  const tokenRegex = /<[^>]*>|[^<>\n]+|\n/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(html)) !== null) {
    const token = match[0];

    if (token === "\n") {
      // Close all currently open tags to produce a valid HTML fragment for this line
      const closeTags = [...openTags]
        .reverse()
        .map((t) => {
          const tagName = t.match(/^<(\w+)/)?.[1];
          return `</${tagName}>`;
        })
        .join("");
      lines.push(currentLine + closeTags);

      // Re-open all tags for the next line
      currentLine = openTags.join("");
    } else {
      currentLine += token;

      // Track open/close tags
      if (token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>")) {
        // Opening tag — store the full tag HTML
        openTags.push(token);
      } else if (token.startsWith("</")) {
        // Closing tag — remove the matching opening tag
        const tagName = token.match(/^<\/(\w+)>/)?.[1];
        if (tagName) {
          // Manually find last index (ES2020 compat)
          let idx = -1;
          for (let i = openTags.length - 1; i >= 0; i--) {
            const openTagName = openTags[i].match(/^<(\w+)/)?.[1];
            if (openTagName === tagName) {
              idx = i;
              break;
            }
          }
          if (idx >= 0) {
            openTags.splice(idx, 1);
          }
        }
      }
    }
  }

  // Last line — always push to match split('\n') behavior (even empty)
  const closeTags = [...openTags]
    .reverse()
    .map((t) => {
      const tagName = t.match(/^<(\w+)/)?.[1];
      return `</${tagName}>`;
    })
    .join("");
  lines.push(currentLine + closeTags);

  return lines;
}

const EXT_LANG_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  rs: "rust",
  go: "go",
  py: "python",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  html: "xml",
  htm: "xml",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "html",
  svelte: "html",
  xml: "xml",
  svg: "xml",
  dockerfile: "dockerfile",
  tf: "hcl",
};

/**
 * Highlight source code and return an array of HTML strings, one per line.
 * Each line's HTML is self-contained and safe to render with dangerouslySetInnerHTML.
 *
 * Falls back to HTML-escaped plain text if highlight.js cannot determine a language.
 */
export function highlightLines(
  content: string,
  fileExtension?: string
): string[] {
  if (content === "") return [""];

  let language: string | undefined;

  if (fileExtension) {
    const mapped = EXT_LANG_MAP[fileExtension.toLowerCase()];
    if (mapped && hljs.getLanguage(mapped)) {
      language = mapped;
    }
  }

  try {
    const result = language
      ? hljs.highlight(content, { language })
      : hljs.highlightAuto(content);

    if (result.value) {
      return splitHighlightedCode(result.value);
    }
  } catch {
    // Highlight failed — fall through to HTML-escaped fallback
  }

  // Fallback: HTML-escaped plain text lines
  return content.split("\n").map((line) => escapeHtml(line));
}
