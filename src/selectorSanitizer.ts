import type { CSSLink, MatchTypes } from "./cssLink";

type OpKey = "=" | "*=" | "^=" | "$=" | "~=";

const OP_TO_MATCH: Record<OpKey, MatchTypes> = {
  "=": "exact",
  "*=": "contains",
  "^=": "startswith",
  "$=": "endswith",
  "~=": "whiteSpace",
};

function isOpKey(x: string): x is OpKey {
  return x === "=" || x === "*=" || x === "^=" || x === "$=" || x === "~=";
}

/**
 * Normalizes malformed legacy/user input where operator may leak into `value`.
 * Examples:
 * - value: "*="         -> match: "contains", value: ""
 * - value: "==abc"      -> match: "exact",    value: "abc"
 * - value: "*=.md"      -> match: "contains", value: ".md"
 */
export function sanitizeRule(rule: CSSLink): CSSLink {
  const out: CSSLink = { ...rule };
  let v = (out.value ?? "").trim();

  // Case 1: value is exactly an operator token
  if (isOpKey(v)) {
    out.match = OP_TO_MATCH[v];
    out.value = "";
    return out;
  }

  // Case 2: value starts with one or more operator tokens (legacy corruption)
  // e.g. "==abc", "*=.md", "^= note"
  const m = v.match(/^((?:=|\*=|\^=|\$=|~=)+)\s*(.*)$/);
  if (m) {
    const [, rawOps = "", restRaw = ""] = m;
    const rest = restRaw.trim();

    const lastOp: OpKey =
      rawOps.endsWith("*=") ? "*=" :
      rawOps.endsWith("^=") ? "^=" :
      rawOps.endsWith("$=") ? "$=" :
      rawOps.endsWith("~=") ? "~=" :
      "=";

    out.match = OP_TO_MATCH[lastOp];
    out.value = rest;
    v = rest;
  }

  // Path exact convenience: append .md if user entered note name only
  if (out.type === "path" && out.match === "exact" && v && !v.toLowerCase().endsWith(".md")) {
    out.value = `${v}.md`;
  }

  return out;
}

/** Utility for migrating whole arrays */
export function sanitizeRules(rules: CSSLink[] | undefined | null): CSSLink[] {
  if (!Array.isArray(rules)) return [];
  return rules.map(sanitizeRule);
}