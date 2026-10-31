import { CSSLink } from "../types/css-link";
import { cleanAttributeKey, cleanRuleValue, normalizeCachePath, parseSpaceSeparatedTokens, stringifyTags } from "../utils/shared-utils";

export type CompiledRuleType = "tag" | "path" | "attribute";
export type DecorationToken = "italic" | "underline" | "line-through";

const DECOR_ITALIC = 1;
const DECOR_UNDERLINE = 2;
const DECOR_LINE_THROUGH = 4;

export interface CompiledRule {
	readonly index: number;
	readonly type: CompiledRuleType;
	readonly cleanValue: string;
	readonly cleanAttrKey: string;
	readonly match: (attrs: Readonly<Record<string, string>>) => boolean;

	// 🔥 FLYWEIGHT RUNTIME REFS: Knytter den kompilerte regelen til de uforanderlige atomene i registeret
	readonly flyweightIdLight: number;
	readonly flyweightIdDark: number;

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
	readonly matchedFlyweightIds: number[];
	readonly classes: string[]; 
	readonly attributes: Record<string, string>;
	readonly iconBefore: string;
	readonly iconAfter: string;
	readonly style: {
		readonly color: string;
		readonly backgroundColor: string;
		readonly fontWeight: "normal" | "lighter" | "bold";
		readonly decorations: readonly DecorationToken[];
	};
}

interface ResolveRuleResolutionInput {
	readonly compiledRules: readonly CompiledRule[];
	readonly resolvedAttrs: Readonly<Record<string, string>>;
	readonly isDark: boolean;
	readonly includeTagMatchClasses: boolean;
	readonly visibleText?: string;
	readonly fallbackText?: string;
	readonly skipIconBefore?: boolean;
	readonly skipIconAfter?: boolean;
	readonly skipStyles?: boolean;
}

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

export function sanitizeRuleset(rules: CSSLink[] | null): { sanitized: CSSLink[]; hasChanges: boolean } {
	if (rules === null || !Array.isArray(rules)) {
		return { sanitized: [], hasChanges: false };
	}

	let hasChanges = false;
	const sanitized: CSSLink[] = [];

	for (let i = 0; i < rules.length; i++) {
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

export function compileSelectors(selectors: readonly CSSLink[]): CompiledRule[] {
	const out: CompiledRule[] = [];

	for (let i = 0; i < selectors.length; i++) {
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

			// Sikre overføring av Flyweight-koblinger fra main.ts
			flyweightIdLight: s._flyweightIdLight || 0,
			flyweightIdDark: s._flyweightIdDark || 0,

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

// 🔥 SIKKER EMOJI-DETEKSJON: Treffer piktogrammer og faktiske emojier, men ALDRI vanlige tall eller bokstaver!
const EMOJI_START_REGEX = /^\p{Extended_Pictographic}/u;
const EMOJI_END_REGEX = /\p{Extended_Pictographic}$/u;

export function resolveRuleResolution(input: ResolveRuleResolutionInput): RuleResolution {
	const compiledRules: readonly CompiledRule[] = input.compiledRules;
	const resolvedAttrs: Readonly<Record<string, string>> = input.resolvedAttrs;
	const isDark: boolean = input.isDark;
	const includeTagMatchClasses: boolean = input.includeTagMatchClasses;

	const matchedIds: number[] = [];
	const matchedRuleIndexes: number[] = [];
	
	let hasMatch = false;
	let color = "";
	let backgroundColor = "";
	let fontWeight: "normal" | "lighter" | "bold" = "normal";
	let decorationBits = 0; 
	let iconBefore = "";
	let iconAfter = "";

	const rulesLen = compiledRules.length;
	for (let i = 0; i < rulesLen; i++) {
		const rule: CompiledRule | null = compiledRules[i] ?? null;
		if (rule === null || !rule.match(resolvedAttrs)) continue;

		hasMatch = true;
		matchedRuleIndexes.push(rule.index);

		const targetId = isDark ? rule.flyweightIdDark : rule.flyweightIdLight;
		if (targetId > 0) {
			matchedIds.push(targetId);
		}

		// 🎨 Siste regel overskriver farge og bakgrunn helt lineært
		const textSelection: string = isDark ? rule.darkColor : rule.lightColor;
		if (textSelection.length > 0) color = textSelection;

		const bgSelection: string = isDark ? rule.darkBgColor : rule.lightBgColor;
		if (bgSelection.length > 0 && bgSelection !== "transparent") backgroundColor = bgSelection;

		// 💪 Fet eller tynn overskriver forrige. Normal gjør ingenting.
		if (rule.fontWeight === "bold" || rule.fontWeight === "lighter") {
			fontWeight = rule.fontWeight;
		}

		// 🪄 Tekstpynt akkumuleres stabilt via bitwise OR (|=)
		if (rule.fontStyle === "italic") decorationBits |= DECOR_ITALIC;
		if (rule.fontStyle === "underline") decorationBits |= DECOR_UNDERLINE;
		if (rule.fontStyle === "line-through") decorationBits |= DECOR_LINE_THROUGH;

		// 🐕 Siste regel erstatter forrige ikon fullstendig
		if (rule.iconBefore.length > 0) iconBefore = rule.iconBefore;
		if (rule.iconAfter.length > 0) iconAfter = rule.iconAfter;
	}

	const decorations: DecorationToken[] = [];
	if ((decorationBits & DECOR_ITALIC) !== 0) decorations.push("italic");
	if ((decorationBits & DECOR_UNDERLINE) !== 0) decorations.push("underline");
	if ((decorationBits & DECOR_LINE_THROUGH) !== 0) decorations.push("line-through");

	const classList: string[] = ["data-link-text"];
	
	// Lag den unike sammensatte klassen for det globale stilarket
	if (matchedRuleIndexes.length > 0) {
		classList.push(`scl-composite-${matchedRuleIndexes.join("-")}`);
	}

	const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
	attributes["data-link-color"] = color;
	attributes["data-link-bg"] = backgroundColor;
	attributes["data-link-weight"] = (fontWeight !== "normal") ? fontWeight : "";
	attributes["data-link-style-decoration"] = decorations.length > 0 ? decorations.join(" ") : "";

	// Sjekk for emoji-konflikter i lenketeksten for de-duplisering via Extended_Pictographic
	const targetText: string = (input.visibleText ?? "").trim();
	const hasBeforeConflict = /^\p{Extended_Pictographic}/u.test(targetText) || (iconBefore.length > 0 && targetText.startsWith(iconBefore));
	const hasAfterConflict = /\p{Extended_Pictographic}$/u.test(targetText) || (iconAfter.length > 0 && targetText.endsWith(iconAfter));

	attributes["data-scl-icon-before"] = (!input.skipIconBefore && !hasBeforeConflict && iconBefore.length > 0) ? iconBefore : "";
	attributes["data-scl-icon-after"] = (!input.skipIconAfter && !hasAfterConflict && iconAfter.length > 0) ? iconAfter : "";
	attributes["data-link-tags"] = "";

	if (includeTagMatchClasses) {
		const rawTagsField: string = resolvedAttrs["tags"] ?? "";
		const tagsArray: string[] = parseSpaceSeparatedTokens(rawTagsField);

		if (tagsArray.length > 0) {
			attributes["data-link-tags"] = stringifyTags(tagsArray);
		}

		const tagsLen = tagsArray.length;
		for (let j = 0; j < tagsLen; j++) {
			const cleanTag = tagsArray[j];
			if (cleanTag !== undefined && cleanTag !== null && cleanTag.length > 0) {
				classList.push(`scl-match-tag-${cleanTag}`);
			}
		}
	}

	if (hasBeforeConflict && iconBefore.length > 0) classList.push("scl-hide-before");
	if (hasAfterConflict && iconAfter.length > 0) classList.push("scl-hide-after");

	return {
		hasMatch,
		matchedFlyweightIds: matchedIds,
		classes: classList,
		attributes,
		iconBefore: attributes["data-scl-icon-before"],
		iconAfter: attributes["data-scl-icon-after"],
		style: { color, backgroundColor, fontWeight, decorations }
	};
}