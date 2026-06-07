export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function stripMarkdownInline(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~#>]/g, "")
    .trim();
}

export function needsCommentEncoding(value: string): boolean {
  return /--|\u0000/.test(value);
}

export function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

export function decodeBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}
