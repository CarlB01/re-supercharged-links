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

interface IconMatchResult {
	iconBefore: string;
	iconAfter: string;
}

/**
 * Iterates through active user style rules to find the first selector matching 
 * the resolved file attributes, returning configured prepend/append icons.
 * Deduplicates lookups across Editor and Reading mode pipelines.
 */
export function findMatchingIcon(selectors: CSSLink[] | undefined, resolvedAttrs: Record<string, string>): IconMatchResult {
	const result: IconMatchResult = { iconBefore: "", iconAfter: "" };
	if (!selectors || !Array.isArray(selectors)) return result;

	for (let i = 0; i < selectors.length; i++) {
		const selector = selectors[i];
		if (!selector) continue;

		let isMatch = false;
		const ruleValue = (selector.value || "").toLowerCase();

		// Match strategy: Tag entries
		if (selector.type === "tag" && resolvedAttrs["tags"]) {
			if (resolvedAttrs["tags"].toLowerCase().includes(ruleValue)) {
				isMatch = true;
			}
		} 
		// Match strategy: Exact file paths
		else if (selector.type === "path" && resolvedAttrs["path"]) {
			if (resolvedAttrs["path"].toLowerCase().includes(ruleValue)) {
				isMatch = true;
			}
		}
		// Match strategy: Custom Dataview frontmatter or inline attributes
		else if (selector.type === "attribute") {
			const cleanKey = selector.name ? selector.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
			if (cleanKey && resolvedAttrs[cleanKey] && resolvedAttrs[cleanKey].toLowerCase().includes(ruleValue)) {
				isMatch = true;
			}
		}

    // Pull and clean icon tokens instantly upon finding the first valid match priority
		if (isMatch) {
			// Safe dynamic mapping: Sjekk både camelCase og rene små bokstaver for å tette lagringsfellen!
			const rawSelector = selector as any;
			
			result.iconBefore = (rawSelector.iconBefore || rawSelector.iconbefore || "").trim();
			result.iconAfter = (rawSelector.iconAfter || rawSelector.iconafter || "").trim();
			break; 
		}
	}

	return result;
}
