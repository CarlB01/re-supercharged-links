import { parseSpaceSeparatedTokens } from "../utils/shared-utils";
import { CompiledRule } from "./rule-compiler";

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
	readonly compiledRules: readonly CompiledRule[]; // 🔑 Tar nå imot ferdigkompilerte regler
	readonly resolvedAttrs: Readonly<Record<string, string>>;
	readonly isDark: boolean;
	readonly includeTagMatchClasses: boolean;
}

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

	// ⚡ LYNRAST LOOP: Ingen if/else-branching for typer eller vasking av strenger lenger!
	for (let i: number = 0; i < compiledRules.length; i++) {
		const rule: CompiledRule | null = compiledRules[i] ?? null;
		if (rule === null) continue;

		// Kjør den pre-kompilerte matcher-funksjonen direkte
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

		if (
			rule.fontStyle === "italic" ||
			rule.fontStyle === "underline" ||
			rule.fontStyle === "line-through"
		) {
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
