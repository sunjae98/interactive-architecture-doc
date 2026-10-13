// Text helpers shared by the validator and the renderer.
// Author text is always HTML-escaped first; only **bold** and `code` are then converted.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESC[c]);
}

// Inline markup: `code` spans are escaped verbatim (no bold inside), the rest is
// escaped and then **bold** is converted. Nothing else is interpreted.
export function inline(value) {
  return String(value)
    .split(/(`[^`\n]+`)/)
    .map((part, i) =>
      i % 2 === 1
        ? '<code class="ic">' + escapeHtml(part.slice(1, -1)) + "</code>"
        : escapeHtml(part).replace(/\*\*([^*\n]+?)\*\*/g, "<b>$1</b>")
    )
    .join("");
}

// Inline text with the markup characters removed (for <title> and similar plain contexts).
export function plainText(value) {
  return String(value)
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+?)\*\*/g, "$1");
}

// JSON that is safe inside <script type="application/json">: `<` cannot open a tag and
// U+2028/U+2029 cannot break older JS parsers if the text is ever evaluated.
export function embedJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Leftover scaffold markers: `[...]`, `[some words]` (not code-like brackets such as
// `["a"]`, `[1, 2]`, `items[i]`), and the word TODO.
// Every pattern is linear: one bounded quantifier per bracket (<= 200 chars inside), and the
// letter check runs on the captured text instead of inside the regex (no nested backtracking).
const ELLIPSIS_RE = /\[[ \t]{0,20}(?:\.\.\.|…)[ \t]{0,20}\]/;
const BRACKET_RE = /(?:^|[^\w\]\[])\[([^\[\]"'`{}(),:;=<>\n]{1,200})\]/gu;
const LETTER_RE = /\p{L}/u;
const TODO_RE = /\bTODO\b/;

export function hasPlaceholder(value) {
  if (ELLIPSIS_RE.test(value) || TODO_RE.test(value)) return true;
  for (const m of value.matchAll(BRACKET_RE)) if (LETTER_RE.test(m[1])) return true;
  return false;
}
