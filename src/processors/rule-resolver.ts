import { CSSLink } from "../types/css-link";
import { cleanAttributeKey, cleanRuleValue, parseSpaceSeparatedTokens } from "../utils/string-utils";

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
	readonly selectors: readonly CSSLink[];
	readonly resolvedAttrs: Readonly<Record<string, string>>;
	readonly isDark: boolean;
	readonly includeTagMatchClasses: boolean;
}

/**
 * Resolves all matching rules into a single deterministic style payload.
 * This function is side-effect free and can be shared across rendering pipelines.
 */

export function resolveRuleResolution(input: ResolveRuleResolutionInput): RuleResolution {
const selectors: readonly CSSLink[] = input.selectors;
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

for (let i: number = 0; i < selectors.length; i++) {
		const selector: CSSLink | null = selectors[i] ?? null;
		if (selector === null) continue;

		const ruleValue: string = cleanRuleValue(selector.value);
		if (ruleValue.length === 0) continue;

		let isMatch: boolean = false;

		if (selector.type === "tag") {
			const rawTags: string = resolvedAttrs["tags"] ?? resolvedAttrs["data-link-tags"] ?? "";
			const cleanFileTags: string[] = parseSpaceSeparatedTokens(rawTags);
			if (cleanFileTags.includes(ruleValue)) {
				isMatch = true;
			}
		} else if (selector.type === "path") {
			const rawPath: string = resolvedAttrs["path"] ?? resolvedAttrs["data-link-path"] ?? "";
			const cleanPath: string = rawPath.toLowerCase().trim();
			if (cleanPath.includes(ruleValue)) {
				isMatch = true;
			}
		} else if (selector.type === "attribute") {
			const cleanKey: string = cleanAttributeKey(selector.name);
			if (cleanKey.length > 0) {
				const rawAttrVal: string = resolvedAttrs[cleanKey] ?? resolvedAttrs[`data-link-${cleanKey}`] ?? "";
				const cleanAttrVal: string = rawAttrVal.toLowerCase().trim();
				if (cleanAttrVal === ruleValue) {
					isMatch = true;
				}
			}
		}

		if (!isMatch) continue;

		hasMatch = true;
		classList.push(`scl-rule-${i}`);

		const textSelection: string = isDark ? (selector.darkColor ?? "") : (selector.lightColor ?? "");
		if (textSelection.length > 0) {
			color = textSelection;
		}

		const bgSelection: string = isDark ? (selector.darkBgColor ?? "") : (selector.lightBgColor ?? "");
		if (bgSelection.length > 0) {
			backgroundColor = bgSelection;
		}

		if (selector.fontWeight === "lighter" || selector.fontWeight === "bold") {
			fontWeight = selector.fontWeight;
		}

		if (
			selector.fontStyle === "italic" ||
			selector.fontStyle === "underline" ||
			selector.fontStyle === "line-through"
		) {
			fontStyle = selector.fontStyle;
		}

		const before: string = (selector.iconBefore ?? "").trim();
		if (before.length > 0) {
			iconBefore = before;
		}

		const after: string = (selector.iconAfter ?? "").trim();
		if (after.length > 0) {
			iconAfter = after;
		}
	}
		const attributes: Record<string, string> = {};

if (color.length > 0) {
		attributes["data-link-color"] = color;
	}
	if (backgroundColor.length > 0 && backgroundColor !== "transparent") {
		attributes["data-link-bg"] = backgroundColor;
	}
	if (fontWeight !== "normal") {
		attributes["data-link-weight"] = fontWeight;
	}
	if (fontStyle !== "normal") {
		attributes["data-link-style"] = fontStyle;
	}
	if (iconBefore.length > 0) {
		attributes["data-scl-icon-before"] = iconBefore;
	}
	if (iconAfter.length > 0) {
		attributes["data-scl-icon-after"] = iconAfter;
	}

	if (includeTagMatchClasses) {
		const rawTagsField: string = resolvedAttrs["tags"] ?? "";
		const tagsArray: string[] = parseSpaceSeparatedTokens(rawTagsField);

		if (tagsArray.length > 0) {
			attributes["data-link-tags"] = tagsArray.map((t: string): string => (t.startsWith("#") ? t : `#${t}`)).join(" ");
		}

		for (let j: number = 0; j < tagsArray.length; j++) {
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

