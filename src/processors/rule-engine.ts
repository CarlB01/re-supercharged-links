// processors/rule-engine

import { CSSLink } from "../types/css-link";
import { cleanAttributeKey, cleanRuleValue, normalizeCachePath, parseSpaceSeparatedTokens } from "../utils/shared-utils";

export type CompiledRuleType = "tag" | "path" | "attribute";

export interface CompiledRule {
	readonly index: number;
	readonly type: CompiledRuleType;
	readonly cleanValue: string;
	readonly cleanAttrKey: string;
	readonly match: (attrs: Readonly<Record<string, string>>) => boolean;

	readonly lightColor: string;
	readonly darkColor: string;
	readonly lightBgColor: string;
	readonly darkBgColor: string;
	readonly fontWeight: "normal" | "lighter" | "bold";
	readonly fontStyle: "normal" | "italic" | "underline" | "line-through";
	readonly iconBefore: string;
	readonly iconAfter: string;
}

export interface RuleResolution {
	readonly hasMatch: boolean;
	readonly classes: readonly string[];
	readonly attributes: Readonly<Record<string, string>>;
	readonly iconBefore: string;
	readonly iconAfter: string;
	readonly style: {
		readonly color: string;
		readonly backgroundColor: string;
		readonly fontWeight: "normal" | "lighter" | "bold";
		readonly fontStyle: "normal" | "italic" | "underline" | "line-through";
	};
}

interface ResolveRuleResolutionInput {
	readonly compiledRules: readonly CompiledRule[];
	readonly resolvedAttrs: Readonly<Record<string, string>>;
	readonly isDark: boolean;
	readonly includeTagMatchClasses: boolean;
}

/**
 * Normalizes a rule's internal matching properties without polluting front-facing UI fields.
 * 🔑 USER-LAYER IMMUNITY: Strips leading hashes and maps standard matching configurations.
 */
export function sanitizeRule(rule: CSSLink): CSSLink {
	const rawProto: unknown = Object.getPrototypeOf(rule);
	const validProto: object = typeof rawProto === "object" && rawProto !== null ? rawProto : Object.prototype;
	
	const prototypeObject: Record<string, unknown> = Object.create(validProto) as Record<string, unknown>;
	const out: CSSLink = Object.assign(prototypeObject, rule);
	
	if (out.type === "tag" && typeof out.value === "string" && out.value.length > 0) {
		out.value = out.value.trim().replace(/^#/, "");
	}

	if (out.type === "tag" || out.type === "attribute") {
		out.match = "exact";
	} else if (out.type === "path") {
		out.match = "contains";
	}

	return out;
}

/**
 * Automatically sanitizes an entire ruleset schema.
 */
export function sanitizeRuleset(rules: CSSLink[] | undefined | null): { sanitized: CSSLink[]; hasChanges: boolean } {
	if (!rules || !Array.isArray(rules)) {
		return { sanitized: [], hasChanges: false };
	}

	let hasChanges: boolean = false;
	const sanitized: CSSLink[] = [];
	const rulesLen = rules.length;

	for (let i: number = 0; i < rulesLen; i++) {
		const originalRule: CSSLink | null = rules[i] ?? null;
		if (originalRule === null) continue;

		const cleanedRule: CSSLink = sanitizeRule(originalRule);
		
		if (cleanedRule.match !== originalRule.match || cleanedRule.value !== originalRule.value) {
			hasChanges = true;
		}
		sanitized.push(cleanedRule);
	}

	return { sanitized, hasChanges };
}

/**
 * High-performance selector compilation engine.
 * Pre-evaluates target configurations and builds optimized machine-level matcher predicates.
 */
export function compileSelectors(selectors: readonly CSSLink[]): CompiledRule[] {
	const out: CompiledRule[] = [];
	const selectorsCount = selectors.length;

	for (let i = 0; i < selectorsCount; i++) {
		const s: CSSLink | null = selectors[i] ?? null;
		if (s === null) continue;

		const type: CompiledRuleType = s.type;
		const cleanValue: string = cleanRuleValue(s.value);
		if (cleanValue.length === 0) continue;

		const cleanAttrKey: string = type === "attribute" ? cleanAttributeKey(s.name) : "";
		const matchFn = createMatcher(type, cleanValue, cleanAttrKey);

		out.push({
			index: i,
			type,
			cleanValue,
			cleanAttrKey,
			match: matchFn,

			lightColor: s.lightColor ?? "",
			darkColor: s.darkColor ?? "",
			lightBgColor: s.lightBgColor ?? "",
			darkBgColor: s.darkBgColor ?? "",
			fontWeight: (s.fontWeight === "lighter" || s.fontWeight === "bold") ? s.fontWeight : "normal",
			fontStyle: (s.fontStyle === "italic" || s.fontStyle === "underline" || s.fontStyle === "line-through") ? s.fontStyle : "normal",
			iconBefore: (s.iconBefore ?? "").trim(),
			iconAfter: (s.iconAfter ?? "").trim()
		});
	}

	return out;
}

/**
 * Internal factory compiling highly optimized cross-window safe closure predicates.
 */
function createMatcher(
	type: CompiledRuleType,
	cleanValue: string,
	cleanAttrKey: string
): (attrs: Readonly<Record<string, string>>) => boolean {
	if (type === "tag") {
		return (attrs: Readonly<Record<string, string>>): boolean => {
			const rawTags: string = attrs["tags"] ?? attrs["data-link-tags"] ?? "";
			const cleanTags: string[] = parseSpaceSeparatedTokens(rawTags);
			return cleanTags.includes(cleanValue);
		};
	}

	if (type === "path") {
		return (attrs: Readonly<Record<string, string>>): boolean => {
			const rawPath: string = attrs["path"] ?? attrs["data-link-path"] ?? "";
			const cleanPath: string = normalizeCachePath(rawPath);
			return cleanPath.includes(cleanValue);
		};
	}

	return (attrs: Readonly<Record<string, string>>): boolean => {
		if (cleanAttrKey.length === 0) return false;
		const rawAttrVal: string = attrs[cleanAttrKey] ?? attrs[`data-link-${cleanAttrKey}`] ?? "";
		const cleanAttrVal: string = normalizeCachePath(rawAttrVal);
		return cleanAttrVal === cleanValue;
	};
}

/**
 * Resolves a metadata object block against all active pre-compiled rule parameters.
 * ⚡ BRANCHLESS RUNTIME LOOP: Executes flat index matches without string cleansing costs.
 */
export function resolveRuleResolution(input: ResolveRuleResolutionInput): RuleResolution {
	const compiledRules: readonly CompiledRule[] = input.compiledRules;
	const resolvedAttrs: Readonly<Record<string, string>> = input.resolvedAttrs;
	const isDark: boolean = input.isDark;
	const includeTagMatchClasses: boolean = input.includeTagMatchClasses;

	const classList: string[] = ["data-link-text"];

	let hasMatch: boolean = false;
	let color: string = "";
	let backgroundColor: string = "";
	let fontWeight: "normal" | "lighter" | "bold" = "normal";
	let fontStyle: "normal" | "italic" | "underline" | "line-through" = "normal";
	let iconBefore: string = "";
	let iconAfter: string = "";

	const rulesCount = compiledRules.length;
	for (let i: number = 0; i < rulesCount; i++) {
		const rule: CompiledRule | null = compiledRules[i] ?? null;
		if (rule === null) continue;

		if (!rule.match(resolvedAttrs)) continue;

		hasMatch = true;
		classList.push(`scl-rule-${rule.index}`);

		const textSelection: string = isDark ? rule.darkColor : rule.lightColor;
		if (textSelection.length > 0) {
			color = textSelection;
		}

		const bgSelection: string = isDark ? rule.darkBgColor : rule.lightBgColor;
		if (bgSelection.length > 0) {
			backgroundColor = bgSelection;
		}

		if (rule.fontWeight === "lighter" || rule.fontWeight === "bold") {
			fontWeight = rule.fontWeight;
		}

		if (rule.fontStyle === "italic" || rule.fontStyle === "underline" || rule.fontStyle === "line-through") {
			fontStyle = rule.fontStyle;
		}

		if (rule.iconBefore.length > 0) {
			iconBefore = rule.iconBefore;
		}

		if (rule.iconAfter.length > 0) {
			iconAfter = rule.iconAfter;
		}
	}

	const attributes: Record<string, string> = {};

	if (color.length > 0) attributes["data-link-color"] = color;
	if (backgroundColor.length > 0 && backgroundColor !== "transparent") attributes["data-link-bg"] = backgroundColor;
	if (fontWeight !== "normal") attributes["data-link-weight"] = fontWeight;
	if (fontStyle !== "normal") attributes["data-link-style"] = fontStyle;
	if (iconBefore.length > 0) attributes["data-scl-icon-before"] = iconBefore;
	if (iconAfter.length > 0) attributes["data-scl-icon-after"] = iconAfter;

	if (includeTagMatchClasses) {
		const rawTagsField: string = resolvedAttrs["tags"] ?? "";
		const tagsArray: string[] = parseSpaceSeparatedTokens(rawTagsField);
		const tagsArrayCount = tagsArray.length;

		if (tagsArrayCount > 0) {
			attributes["data-link-tags"] = tagsArray.map((t: string): string => (t.startsWith("#") ? t : `#${t}`)).join(" ");
		}

		for (let j: number = 0; j < tagsArrayCount; j++) {
			const cleanTag: string | null = tagsArray[j] ?? null;
			if (cleanTag !== null && cleanTag.length > 0) {
				classList.push(`scl-match-tag-${cleanTag.replace(/^#/, "")}`);
			}
		}
	}

	return {
		hasMatch,
		classes: classList,
		attributes,
		iconBefore,
		iconAfter,
		style: {
			color,
			backgroundColor,
			fontWeight,
			fontStyle
		}
	};
}
