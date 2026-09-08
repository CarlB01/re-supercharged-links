import { CSSLink, MatchTypes } from "../types/css-link";

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
 * Normalizes malformed legacy or corrupted user input where operator keys leak into value fields.
 */
export function sanitizeRule(rule: CSSLink): CSSLink {
  // 🚀 FIKSET: Bruk Object.assign for å beholde klassens metoder og prototype intakt!
  // Dette kloner instansen på en måte som gjør at 'generateId' fortsatt følger med.
  const out = Object.assign(Object.create(Object.getPrototypeOf(rule)), rule) as CSSLink;
  let v = (out.value ?? "").trim();

  if (isOpKey(v)) {
    out.match = OP_TO_MATCH[v];
    out.value = "";
    return out;
  }

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
  }

  return out;
}

/**
 * High-level orchestration utility for setting loaders.
 */
export function sanitizeRuleset(rules: CSSLink[] | undefined | null): { sanitized: CSSLink[]; hasChanges: boolean } {
  if (!Array.isArray(rules)) {
    return { sanitized: [], hasChanges: false };
  }

  let hasChanges = false;
  
  const sanitized = rules.map((originalRule) => {
    if (!originalRule) return originalRule;
    const cleanedRule = sanitizeRule(originalRule);
    
    if (
      cleanedRule.match !== originalRule.match ||
      cleanedRule.value !== originalRule.value ||
      cleanedRule.type !== originalRule.type ||
      cleanedRule.name !== originalRule.name
    ) {
      hasChanges = true;
    }
    return cleanedRule;
  });

  return { sanitized, hasChanges };
}
