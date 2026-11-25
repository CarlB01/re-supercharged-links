// src/rendering/dom-writer.ts

import ResuperchargedLinks from "../core/main";
import { populatePresentationPool, PreAllocatedPresentation } from "../engine/flyweight-style-pool";
import { parseSpaceSeparatedTokens } from "../utils/shared-utils";

export function clearExtraDOMAttributes(link: HTMLElement, plugin: ResuperchargedLinks): void {
	link.removeAttribute("data-scl-signature");

	let i = link.classList.length;
	while (i--) {
		const cls = link.classList.item(i);
		if (cls !== null) {
			if (cls === "scl-processed" || cls.startsWith("scl-")) {
				link.classList.remove(cls);
			}
		}
	}

	// 3. UNROLLED INLINE-STYLE CLEANING
	// Hardkodet lineært for 0% iterator-overhead (Beskytter V8-inlining).
	const style = link.style;
	if (style.length > 0) {
		style.removeProperty("--scl-color");
		style.removeProperty("--scl-bg");
		style.removeProperty("--scl-icon-before");
		style.removeProperty("--scl-icon-after");
		style.removeProperty("font-weight");
		style.removeProperty("font-style");
		style.removeProperty("text-decoration");
	}
}

export function extractTagTokensFromElement(el: HTMLElement): string[] {
	const hrefAttr: string | null = el.getAttribute("href");
	const textContent: string | null = el.textContent;

	const c1: string = el.getAttribute("data-tag") || "";
	const c2: string = el.getAttribute("data-tags") || "";
	const c3: string = hrefAttr || "";
	const c4: string = textContent || "";

	const parts: string[] = [];
	if (c1) parts.push(c1);
	if (c2) parts.push(c2);
	if (c3) parts.push(c3);
	if (c4) parts.push(c4);

	if (parts.length === 0) return [];
	const rawTokens: string[] = parseSpaceSeparatedTokens(parts.join(" "));
	const tokensLen = rawTokens.length;
	if (tokensLen <= 1) return rawTokens;

	const uniqueTokens: string[] = [];
	for (let i = 0; i < tokensLen; i++) {
		const token = rawTokens[i];
		if (token && uniqueTokens.indexOf(token) === -1) {
			uniqueTokens.push(token);
		}
	}
	return uniqueTokens;
}

export function tagChipStyles(container: HTMLElement, plugin: ResuperchargedLinks): void {
	if (!plugin.settings.enableTagChips) {
		const existingTags = container.querySelectorAll<HTMLElement>(".scl-tag-chip");
		for (let i = 0; i < existingTags.length; i++) {
			const el = existingTags[i];
			if (el) {
				clearExtraDOMAttributes(el, plugin);
				el.classList.remove("scl-tag-chip");
			}
		}
		return;
	}

	if (plugin.cacheManager.compiledTagRules.length === 0) return;

	const tagNodes = container.querySelectorAll<HTMLElement>(
		'a.tag, .metadata-property[data-property-key="tags"] .multi-select-pill-content'
	);
	const tagNodesCount = tagNodes.length;

for (let i = 0; i < tagNodesCount; i++) {
		const htmlEl = tagNodes[i];
		if (!htmlEl || htmlEl.nodeType !== 1 || !htmlEl.isConnected) continue;

		const rawText = (htmlEl.getAttribute("href") || htmlEl.textContent || "").trim();
		if (rawText.length === 0) continue;

		const visibleText = (htmlEl.textContent || "").trim();
		const resolution = plugin.flyweightEngine.getTagResolution(rawText, visibleText);

		if (htmlEl.getAttribute("data-scl-signature") === resolution.signature && htmlEl.classList.contains("scl-processed")) {
			continue;
		}

		const presentation = populatePresentationPool(resolution);
		applyPoolToLinkElement(htmlEl, presentation, plugin);
		htmlEl.classList.add("scl-tag-chip");
	}
}

export function applyStylesAndAttributesToLink(
	link: HTMLElement, 
	rawAttrs: Record<string, string>, 
	plugin: ResuperchargedLinks
): void {
	const pathKey: string = rawAttrs["path"] || "";
	const visibleText: string = (link.textContent || "").trim();

	const resolution = plugin.flyweightEngine.getResolution(pathKey, visibleText);

	// 1. V8 INLINED EARLY EXIT (skjer FØR populatePresentationPool!)
	if (link.getAttribute("data-scl-signature") === resolution.signature && link.classList.contains("scl-processed")) {
		return; 
	}
	const presentation = populatePresentationPool(resolution);
	applyPoolToLinkElement(link, presentation, plugin);
}

/**
 * Påfører ferdig populert SHARED_PRESENTATION_POOL på et HTML-element.
 * Skipper automatisk hvis signaturen allerede matcher og "scl-processed" er satt.
 * Kan kalles direkte av både dom-writer og eksterne plugins (MyBrain).
 */
export function applyPoolToLinkElement(
	link: HTMLElement,
	presentation: PreAllocatedPresentation,
	plugin: ResuperchargedLinks
): void {

	clearExtraDOMAttributes(link, plugin);
	link.setAttribute("data-scl-signature", presentation.signature);
	link.classList.add("scl-processed");

	if (!presentation.hasMatch) return;

	const inlineStyle = link.style;
	const stylesCount = presentation.stylesCount;
	for (let i = 0; i < stylesCount; i++) {
		const key = presentation.styleKeys[i];
		const val = presentation.styleValues[i];
		if (key && val) {
			inlineStyle.setProperty(key, val);
		}
	}

	const classesCount = presentation.classesCount;
	for (let i = 0; i < classesCount; i++) {
		const cls = presentation.classes[i];
		if (cls) link.classList.add(cls);
	}
}