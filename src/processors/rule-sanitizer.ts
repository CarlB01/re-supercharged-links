import { CSSLink } from "../types/css-link";
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

export function findMatchingIcon(selectors: CSSLink[] | null, resolvedAttrs: Record<string, string>): IconMatchResult {
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
