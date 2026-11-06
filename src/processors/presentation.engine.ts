import { FlyweightResponse } from "../core/flyweight-engine";
import ResuperchargedLinks from "../core/main";
import { cleanAttributeKey, cleanRuleValue } from "../utils/shared-utils";
import { resolveRuleResolution } from "./rule-engine";

export interface PreAllocatedPresentation {
	hasMatch: boolean;
	classesCount: number;
	stylesCount: number;
	readonly classes: string[];
	readonly styleKeys: string[];
	readonly styleValues: string[];
}

const SHARED_PRESENTATION_POOL: PreAllocatedPresentation = {
	hasMatch: false,
	classesCount: 0,
	stylesCount: 0,
	classes: new Array<string>(64).fill(""),       
	styleKeys: new Array<string>(32).fill(""),     
	styleValues: new Array<string>(32).fill("")
};

export function populatePresentationPool(
	resolution: FlyweightResponse,
	skipIconBefore = false,
	skipIconAfter = false
): PreAllocatedPresentation {
	const pool = SHARED_PRESENTATION_POOL;
	
	const oldClassesCount = pool.classesCount;
	for (let i = 0; i < oldClassesCount; i++) pool.classes[i] = "";
	const oldStylesCount = pool.stylesCount;
	for (let i = 0; i < oldStylesCount; i++) {
		pool.styleKeys[i] = "";
		pool.styleValues[i] = "";
	}

	pool.hasMatch = resolution.hasMatch;
	pool.classesCount = 0;
	pool.stylesCount = 0;
	pool.classes[pool.classesCount++] = "data-link-text";

	if (!resolution.hasMatch) {
		pool.classes[pool.classesCount++] = "data-link-text";
		return pool;
	}

	const s = resolution.styles;
	if (s.color.length > 0) {
		pool.styleKeys[pool.stylesCount] = "--scl-color";
		pool.styleValues[pool.stylesCount++] = s.color;
	}
	if (s.backgroundColor.length > 0 && s.backgroundColor !== "transparent") {
		pool.styleKeys[pool.stylesCount] = "--scl-bg";
		pool.styleValues[pool.stylesCount++] = s.backgroundColor;
	}

	if (s.fontWeight === "bold") pool.classes[pool.classesCount++] = "scl-weight-bold";
	if (s.fontWeight === "lighter") pool.classes[pool.classesCount++] = "scl-weight-lighter";

	const decosLen = s.decorations.length;
	for (let i = 0; i < decosLen; i++) {
		const dec = s.decorations[i];
		if (dec === "italic") pool.classes[pool.classesCount++] = "scl-style-italic";
		if (dec === "underline") pool.classes[pool.classesCount++] = "scl-decor-underline";
		if (dec === "line-through") pool.classes[pool.classesCount++] = "scl-decor-linethrough";
	}

	if (s.iconBefore.length > 0 && !skipIconBefore) {
		pool.classes[pool.classesCount++] = "scl-with-before";
		pool.styleKeys[pool.stylesCount] = "--scl-icon-before";
		pool.styleValues[pool.stylesCount++] = `"${s.iconBefore}"`;
	}

	if (s.iconAfter.length > 0 && !skipIconAfter) {
		pool.classes[pool.classesCount++] = "scl-with-after";
		pool.styleKeys[pool.stylesCount] = "--scl-icon-after";
		pool.styleValues[pool.stylesCount++] = `"${s.iconAfter}"`;
	}

	const resClassesLen = resolution.classes.length;
	for (let i = 0; i < resClassesLen; i++) {
		const cls = resolution.classes[i];
		if (cls && cls !== "data-link-text") {
			pool.classes[pool.classesCount++] = cls;
		}
	}

	return pool;
}

/**
 * Dedikert virtuell kanal for eksterne applikasjoner (Mybrain) og innstillingspanelet.
 * Isolert utenfor den hotte scroll-banen for å beskytte V8-motorens inlining-optimalisering.
 */
export function resolveVirtualPreviewResolution(
	plugin: ResuperchargedLinks,
	cleanPath: string,
	visibleText: string,
	ruleVersion: number,
	isDark: boolean
): FlyweightResponse {
	const ruleIndexStr = cleanPath.replace("virtual://preview/", "");
	const ruleIndex = parseInt(ruleIndexStr, 10);
	const rawProps: Record<string, string> = Object.create(null) as Record<string, string>;
	const classesList: string[] = ["data-link-text"];

	const selectors = plugin.settings?.selectors ?? [];
	const rule = selectors[ruleIndex];
	
	if (rule) {
		const rawValue = cleanRuleValue(rule.value);
		if (rule.type === "tag" && rawValue.length > 0) rawProps["tags"] = `#${rawValue}`;
		if (rule.type === "path" && rawValue.length > 0) rawProps["path"] = rawValue;
		if (rule.type === "attribute" && rawValue.length > 0) {
			const attrKey = cleanAttributeKey(rule.name);
			if (attrKey.length > 0) rawProps[attrKey] = rawValue;
		}
		classesList.push(`scl-composite-${ruleIndex}`);
	}
	
	const resolution = resolveRuleResolution({
		compiledRules: plugin.cacheManager.compiledRules,
		resolvedAttrs: rawProps,
		isDark,
		includeTagMatchClasses: true,
		visibleText: visibleText
	});

	return {
		hasMatch: resolution.hasMatch,
		signature: `preview|${ruleVersion}|${ruleIndex}`,
		classes: classesList,
		styles: {
			color: resolution.style.color,
			backgroundColor: resolution.style.backgroundColor,
			fontWeight: resolution.style.fontWeight !== "normal" ? resolution.style.fontWeight : "",
			iconBefore: resolution.iconBefore,
			iconAfter: resolution.iconAfter,
			decorations: resolution.style.decorations
		}
	};
}
