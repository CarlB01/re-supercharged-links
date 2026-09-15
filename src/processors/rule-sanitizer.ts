import { CSSLink, MatchTypes } from "../types/css-link";
import { parseSpaceSeparatedTokens, cleanRuleValue, cleanAttributeKey } from "../utils/string-utils";

export interface AccumulatedStyleProfile {
	uid: string;
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
  return typeof x === "string" && (x === "=" || x === "*=" || x === "^=" || x === "$=" || x === "~=");
}


/**
 * Normalizes a rule's internal matching properties without polluting front-facing fields.
 * 🔑 USER-LAYER IMMUNITY: Strips leading hashes and preserves clean text strings for the UI fields.
 */
export function sanitizeRule(rule: CSSLink): CSSLink {
	const rawProto: unknown = Object.getPrototypeOf(rule);
	const validProto: object = typeof rawProto === "object" && rawProto !== null ? rawProto : Object.prototype;
	
	const prototypeObject: Record<string, unknown> = Object.create(validProto) as Record<string, unknown>;
	const out: CSSLink = Object.assign(prototypeObject, rule);
	
	// 🔑 CLEAN DATA LAYER: Strip any accidental leading '#' to ensure memory stays strictly clean
	if (out.type === "tag" && typeof out.value === "string" && out.value.length > 0) {
		out.value = out.value.trim().replace(/^#/, "");
	}

	// Lock the exact match types seamlessly based on the rule type mapping
	if (out.type === "tag" || out.type === "attribute") {
		out.match = "exact";
	} else if (out.type === "path") {
		out.match = "contains";
	}

	return out;
}


export function sanitizeRuleset(rules: CSSLink[] | undefined | null): { sanitized: CSSLink[]; hasChanges: boolean } {
  if (!rules || !Array.isArray(rules)) {
    return { sanitized: [], hasChanges: false };
  }

  let hasChanges: boolean = false;
  const sanitized: CSSLink[] = [];

  for (let i: number = 0; i < rules.length; i++) {
    const originalRule: CSSLink | null = rules[i] ?? null;
    if (originalRule === null) continue;

    const cleanedRule: CSSLink = sanitizeRule(originalRule);
    
    if (
      cleanedRule.match !== originalRule.match ||
      cleanedRule.value !== originalRule.value
    ) {
      hasChanges = true;
    }
    sanitized.push(cleanedRule);
  }

  return { sanitized, hasChanges };
}

interface IconMatchResult {
  iconBefore: string;
  iconAfter: string;
}

export function findMatchingIcon(selectors: CSSLink[] | undefined, resolvedAttrs: Record<string, string>): IconMatchResult {
  const result: IconMatchResult = { iconBefore: "", iconAfter: "" };
  if (!selectors || !Array.isArray(selectors)) return result;

  for (let i: number = 0; i < selectors.length; i++) {
    const selector: CSSLink | null = selectors[i] ?? null;
    if (selector === null) continue;

    let isMatch: boolean = false;
    const ruleValue: string = cleanRuleValue(selector.value);

    // ⚡ LYNRAST MATCHER: Fordi cachen og reglene begge er garantert å ha '#'
    if (selector.type === "tag" && resolvedAttrs["tags"]) {
      const cleanFileTags: string[] = parseSpaceSeparatedTokens(resolvedAttrs["tags"]);
      if (cleanFileTags.includes(ruleValue)) isMatch = true;
    } else if (selector.type === "path" && resolvedAttrs["path"]) {
      const cleanPath: string = (resolvedAttrs["path"] ?? "").toLowerCase().trim();
      if (cleanPath.includes(ruleValue)) isMatch = true;
    } else if (selector.type === "attribute") {
      const cleanKey: string = cleanAttributeKey(selector.name);
      if (cleanKey.length > 0 && resolvedAttrs[cleanKey]) {
        const cleanAttrVal: string = (resolvedAttrs[cleanKey] ?? "").toLowerCase().trim();
        if (cleanAttrVal.includes(ruleValue)) isMatch = true;
      }
    }

    if (isMatch) {
      result.iconBefore = (selector.iconBefore ?? "").trim();
      result.iconAfter = (selector.iconAfter ?? "").trim();
      break;
    }
  }

  return result;
}

export function findMatchingRule(selectors: CSSLink[] | undefined, resolvedAttrs: Record<string, string>): AccumulatedStyleProfile {
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

	for (let i: number = 0; i < selectors.length; i++) {
		const selector: CSSLink | null = selectors[i] ?? null;
		if (selector === null) continue;

		let isMatch: boolean = false;
		const ruleValue: string = cleanRuleValue(selector.value);
		if (ruleValue.length === 0) continue;

		// ⚡ ZERO-OVERHEAD EXPLICIT LOOKUP: Ren matrise-lookbehind uten manipulasjon
		if (selector.type === "tag") {
			const rawTags: string = resolvedAttrs["tags"] ?? resolvedAttrs["data-link-tags"] ?? "";
			const cleanFileTags: string[] = parseSpaceSeparatedTokens(rawTags);
			if (cleanFileTags.includes(ruleValue)) isMatch = true;
		} 
		else if (selector.type === "path") {
			const rawPath: string = resolvedAttrs["path"] ?? resolvedAttrs["data-link-path"] ?? "";
			const cleanPath: string = (rawPath ?? "").toLowerCase().trim();
			if (cleanPath.includes(ruleValue)) isMatch = true;
		}
		else if (selector.type === "attribute") {
			const cleanKey: string = cleanAttributeKey(selector.name);
			if (cleanKey.length > 0) {
				const rawAttrVal: string = resolvedAttrs[cleanKey] ?? resolvedAttrs[`data-link-${cleanKey}`] ?? "";
				const cleanAttrVal: string = (rawAttrVal ?? "").toLowerCase().trim();
				if (cleanAttrVal === ruleValue) isMatch = true;
			}
		}

		if (isMatch) {    
			profile.hasAnyMatch = true;
			profile.uid = selector.uid ?? "";

			if (selector.lightColor && selector.lightColor !== "#aa0000") profile.lightColor = selector.lightColor;
			if (selector.darkColor && selector.darkColor !== "#ff5555") profile.darkColor = selector.darkColor;

			if (selector.lightBgColor && selector.lightBgColor !== "transparent") profile.lightBgColor = selector.lightBgColor;
			if (selector.darkBgColor && selector.darkBgColor !== "transparent") profile.darkBgColor = selector.darkBgColor;

			if (selector.fontWeight && selector.fontWeight !== "normal") profile.fontWeight = selector.fontWeight;
			
			const targetFontStyle: string = selector.fontStyle ?? "normal";
			if (targetFontStyle !== "normal") {
				profile.fontStyle = targetFontStyle as "normal" | "italic" | "underline" | "line-through";
			}

			if ((selector.iconBefore ?? "").trim().length > 0) profile.iconBefore = selector.iconBefore.trim();
			if ((selector.iconAfter ?? "").trim().length > 0) profile.iconAfter = selector.iconAfter.trim();
		}
	}

	return profile;
}
