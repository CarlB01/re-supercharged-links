import { CSSLink, MatchTypes } from "../types/css-link";

type OpKey = "=" | "*=" | "^=" | "$=" | "~=";

const OP_TO_MATCH: Record<OpKey, MatchTypes> = {
  "=": "exact",
  "*=": "contains",
  "^=": "startswith",
  "$=": "endswith",
  "~=": "whiteSpace",
};

function isOpKey(x: unknown): x is OpKey {
  if (typeof x !== "string") return false;
  return x === "=" || x === "*=" || x === "^=" || x === "$=" || x === "~=";
}

export function sanitizeRule(rule: CSSLink): CSSLink {
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

interface IconMatchResult {
  iconBefore: string;
  iconAfter: string;
}

/**
 * Iterates through active user style rules to find the first selector matching 
 * the resolved file attributes. 
 */
export function findMatchingIcon(selectors: CSSLink[] | undefined, resolvedAttrs: Record<string, string>): IconMatchResult {
  const result: IconMatchResult = { iconBefore: "", iconAfter: "" };
  if (!selectors || !Array.isArray(selectors)) return result;

  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    if (!selector) continue;

    let isMatch = false;
    const ruleValue = (selector.value || "").toLowerCase();

    if (selector.type === "tag" && resolvedAttrs["tags"]) {
      if (resolvedAttrs["tags"].toLowerCase().includes(ruleValue)) isMatch = true;
    } else if (selector.type === "path" && resolvedAttrs["path"]) {
      if (resolvedAttrs["path"].toLowerCase().includes(ruleValue)) isMatch = true;
    } else if (selector.type === "attribute") {
      const cleanKey = selector.name ? selector.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
      if (cleanKey && resolvedAttrs[cleanKey] && resolvedAttrs[cleanKey].toLowerCase().includes(ruleValue)) isMatch = true;
    }

    if (isMatch) {
      const hasIconBefore = "iconBefore" in selector || "iconbefore" in selector;
      const hasIconAfter = "iconAfter" in selector || "iconafter" in selector;

      if (hasIconBefore) {
        const lookup = selector as unknown as Record<string, string>;
        result.iconBefore = (lookup["iconBefore"] || lookup["iconbefore"] || "").trim();
      }
      if (hasIconAfter) {
        const lookup = selector as unknown as Record<string, string>;
        result.iconAfter = (lookup["iconAfter"] || lookup["iconafter"] || "").trim();
      }
      break;
    }
  }

  return result;
}

/**
 * 🔑 THE ULTIMATE MATCHING MATRIX: 
 * Normalizes both user rule metrics and resolved document parameters to establish 
 * a bulletproof paring sequence. Immune to leading hashtags, casing, or trailing spaces.
 */
export function findMatchingRule(selectors: CSSLink[] | undefined, resolvedAttrs: Record<string, string>): CSSLink | null {
  if (!selectors || !Array.isArray(selectors)) return null;

  for (let i = 0; i < selectors.length; i++) {
    const selector = selectors[i];
    if (!selector) continue;

    let isMatch = false;
    
    // Vask regelen til ren, rå tekst uten mellomrom eller leading hashtags (f.eks. "👥gruppe")
    const ruleValue = (selector.value || "").toLowerCase().trim().replace(/^#/, "");
    if (!ruleValue) continue;

    // 1. STRATEGI: Matcher mot tagger i fila (f.eks. "#👥gruppe" eller "👥gruppe")
    if (selector.type === "tag") {
      const rawTags = resolvedAttrs["tags"] || resolvedAttrs["data-link-tags"] || "";
      const cleanFileTags = rawTags.toLowerCase().replace(/#/g, "").trim();
      if (cleanFileTags.includes(ruleValue)) {
        isMatch = true;
      }
    } 
    // 2. STRATEGI: Matcher mot filnavn eller sti (f.eks. "👥menn.md")
    else if (selector.type === "path") {
      const rawPath = resolvedAttrs["path"] || resolvedAttrs["data-link-path"] || "";
      const cleanPath = rawPath.toLowerCase().trim();
      if (cleanPath.includes(ruleValue)) {
        isMatch = true;
      }
    }
    // 3. STRATEGI: Matcher mot egendefinerte frontmatter- eller Dataview-felter
    else if (selector.type === "attribute") {
      const cleanKey = selector.name ? selector.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
      if (cleanKey) {
        const rawAttrVal = resolvedAttrs[cleanKey] || resolvedAttrs[`data-link-${cleanKey}`] || "";
        const cleanAttrVal = rawAttrVal.toLowerCase().trim();
        if (cleanAttrVal.includes(ruleValue)) {
          isMatch = true;
        }
      }
    }

    if (isMatch) {
      return selector; // Treff! Returner regelen umiddelbart
    }
  }

  return null;
}
