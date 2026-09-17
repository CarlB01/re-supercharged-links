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
