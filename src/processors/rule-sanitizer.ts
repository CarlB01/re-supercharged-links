import { CSSLink, MatchTypes } from "../types/css-link";

/**
 * Represents a cleanly merged runtime style profile compiled from cascading user rules.
 * Ensures properties accumulate additively, mimicking native browser CSS behaviors.
 */
export interface AccumulatedStyleProfile {
	uid: string; // Tracks the last matching rule's UID for CodeMirror theme class mapping
	lightColor: string;
	darkColor: string;
	lightBgColor: string;
	darkBgColor: string;
	fontWeight: "normal" | "lighter" | "bold";
	fontStyle: "normal" | "italic" | "underline" | "line-through";
	iconBefore: string;
	iconAfter: string;
	hasAnyMatch: boolean;
}

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
 * Iterates through all active user style rules chronologically to compile an additive,
 * cascading style profile. Newer matching rules overwrite conflicting properties,
 * while leaving non-conflicting historical attributes intact.
 */
export function findMatchingRule(selectors: CSSLink[] | undefined, resolvedAttrs: Record<string, string>): AccumulatedStyleProfile {
	// Initialize a blank baseline profile with default fallback tokens
	const profile: AccumulatedStyleProfile = {
		uid: "",
		lightColor: "",
		darkColor: "",
		lightBgColor: "transparent",
		darkBgColor: "transparent",
		fontWeight: "normal",
		fontStyle: "normal",
		iconBefore: "",
		iconAfter: "",
		hasAnyMatch: false
	};

	if (!selectors || !Array.isArray(selectors)) return profile;

	for (let i = 0; i < selectors.length; i++) {
		const selector = selectors[i];
		if (!selector) continue;

		let isMatch = false;
		const ruleValue = (selector.value || "").toLowerCase().trim().replace(/^#/, "");
		if (!ruleValue) continue;

		// 1. STRATEGY: Tag scanning
		if (selector.type === "tag") {
			const rawTags = resolvedAttrs["tags"] || resolvedAttrs["data-link-tags"] || "";
			const cleanFileTags = rawTags.toLowerCase().replace(/#/g, "").trim();
			if (cleanFileTags.includes(ruleValue)) isMatch = true;
		} 
		// 2. STRATEGY: Path scanning
		else if (selector.type === "path") {
			const rawPath = resolvedAttrs["path"] || resolvedAttrs["data-link-path"] || "";
			const cleanPath = rawPath.toLowerCase().trim();
			if (cleanPath.includes(ruleValue)) isMatch = true;
		}
		// 3. STRATEGY: Attribute scanning
		else if (selector.type === "attribute") {
			const cleanKey = selector.name ? selector.name.trim().toLowerCase().replace(/\s+/g, "-") : "";
			if (cleanKey) {
				const rawAttrVal = resolvedAttrs[cleanKey] || resolvedAttrs[`data-link-${cleanKey}`] || "";
				const cleanAttrVal = rawAttrVal.toLowerCase().trim();
				if (cleanAttrVal.includes(ruleValue)) isMatch = true;
			}
		}

		// 🔑 KASKADE-MAGIEN: Hvis regelen matcher, smelter vi egenskapene positivt sammen!
		if (isMatch) {
			profile.hasAnyMatch = true;
			profile.uid = selector.uid; // Always map the final ruling UID for active theme weight

			// Kun overskriv tekstfarger dersom den nye regelen faktisk har definert en farge
			if (selector.lightColor && selector.lightColor !== "#aa0000") profile.lightColor = selector.lightColor;
			if (selector.darkColor && selector.darkColor !== "#ff5555") profile.darkColor = selector.darkColor;

			// Kun overskriv bakgrunn dersom den ikke er transparent
			if (selector.lightBgColor && selector.lightBgColor !== "transparent") profile.lightBgColor = selector.lightBgColor;
			if (selector.darkBgColor && selector.darkBgColor !== "transparent") profile.darkBgColor = selector.darkBgColor;

			// Typografiske overskrivinger (sjekker mot standardverdier)
			if (selector.fontWeight && selector.fontWeight !== "normal") profile.fontWeight = selector.fontWeight;
			if (selector.fontStyle && selector.fontStyle !== "normal") profile.fontStyle = selector.fontStyle;

			// 🚀 POSITIV IKON-AKKUMULERING: Hvis den nye regelen har et ikon, oppdaterer vi.
			// Hvis den nye regelen IKKE har et ikon, overlever det gamle ikonet fra forrige regel!
			if ((selector.iconBefore || "").trim()) profile.iconBefore = selector.iconBefore.trim();
			if ((selector.iconAfter || "").trim()) profile.iconAfter = selector.iconAfter.trim();
		}
	}

	return profile;
}
