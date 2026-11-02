import ResuperchargedLinks from "../core/main";
import { populatePresentationPool } from "../processors/presentation.engine";
import { parseSpaceSeparatedTokens } from "../utils/shared-utils";
import { SCL_CLEANUP_CLASSES, SCL_CLEANUP_PROPERTIES } from "../utils/shared-utils";

/**
 * Universell og kompromissløs sterilisering av et element.
 * Fjerner alle dynamiske data-attributter, sletter fysiske ikoner,
 * og nullstiller alle klasser og CSS-variabler generert av regelmotoren.
 */
export function clearExtraAttributes(link: HTMLElement): void {
	// 1. RENS ATRIBUTTER (Fjerner data-link-*, data-scl-*, og signaturer)
	link.removeAttribute("data-scl-signature");
	link.removeAttribute("data-link-color");
	
	const attrs: NamedNodeMap = link.attributes;
	let i: number = attrs.length;
	while (i--) {
		const attr: Attr | null = attrs.item(i);
		if (attr !== null) {
			const name: string = attr.name;
			if (name.includes("data-link") || name.startsWith("data-scl-")) {
				link.removeAttribute(name);
			}
		}
	}
	
	// 2. FJERN FYSISKE INLINE-IKONER
	const oldIcons: NodeListOf<HTMLElement> = link.querySelectorAll(".scl-inline-icon");
	const oldIconsCount: number = oldIcons.length;
	for (let j = 0; j < oldIconsCount; j++) {
		const iconEl: HTMLElement | null = oldIcons[j] ?? null;
		if (iconEl !== null) {
			iconEl.remove();
		}
	}

	// 3. BLIND KLASSE-VASK (Bruker de felles sentraliserte konstantene)
	for (const cls of SCL_CLEANUP_CLASSES) {
		link.removeClass(cls);
	}

	// Dynamiske brukergenererte klasser og sammensatte regel-kompositter
	const currentClasses: DOMTokenList = link.classList;
	let k: number = currentClasses.length;
	while (k--) {
		const cls = currentClasses.item(k);
		if (cls !== null && (
			cls.startsWith("scl-match-") || 
			cls.startsWith("scl-rule-") || 
			cls.startsWith("scl-composite-") // 🌟 KNUSER SPØKELSES-BAKGRUNNER PERMANENT
		)) {
			link.classList.remove(cls);
		}
	}

	// 4. BLIND STIL- OG VARIABEL-VASK
	const style = link.style;
	for (const prop of SCL_CLEANUP_PROPERTIES) {
		style.removeProperty(prop);
	}
	
	// Fallback for eldre element-styles
	if (style.length > 0) {
		style.removeProperty("font-weight");
		style.removeProperty("font-style");
		style.removeProperty("text-decoration");
	}
}

/**
 * Extracts and normalizes tag cache tokens directly from layout elements safely.
 */
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

/**
 * Extends Supercharged styling frameworks safely to active tag chip nodes inside view containers.
 */
export function tagChipStyles(container: HTMLElement, plugin: ResuperchargedLinks): void {
	if (!plugin.settings.enableTagChips) return;

	const tagNodes: NodeListOf<Element> = container.querySelectorAll("a.tag");
	const tagNodesCount: number = tagNodes.length;

	for (let i = 0; i < tagNodesCount; i++) {
		const n: Element | null = tagNodes[i] ?? null;
		if (n !== null && n.nodeType === 1) {
			const htmlEl: HTMLElement = n as HTMLElement;
			const tokens: string[] = extractTagTokensFromElement(htmlEl);
			const tokensLen = tokens.length;
			if (tokensLen === 0) continue;
			
			const tagString: string = tokensLen > 0 ? "#" + tokens.join(" #") : "";

			if (htmlEl.getAttribute("data-link-tags") !== tagString) {
				htmlEl.setAttribute("data-link-tags", tagString);
			}
			if (!htmlEl.classList.contains("data-link-text")) {
				htmlEl.addClass("data-link-text");
			}
		}
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

	if (link.getAttribute("data-scl-signature") === resolution.signature && link.classList.contains("scl-processed")) {
		return; 
	}

	// 🚀 1. Én felles totalvask (Sletter alt av gamle stiler, variabler og ikoner)
	clearExtraAttributes(link);
	link.setAttribute("data-scl-signature", resolution.signature);

	const presentation = populatePresentationPool(resolution);
	const inlineStyle: CSSStyleDeclaration = link.style;

	if (presentation.hasMatch) {
		// 2. Påfør inline-stiler fra pool via rå indeks-loop
		const stylesCount = presentation.stylesCount;
		for (let i = 0; i < stylesCount; i++) {
			const key = presentation.styleKeys[i];
			const val = presentation.styleValues[i];
			if (key && val) {
				inlineStyle.setProperty(key, val);
				
				if (key === "color") {
					link.setAttribute("data-link-color", val);
				}
			}
		}

		// 3. Påfør klasser fra pool via rå indeks-loop
		const classesCount = presentation.classesCount;
		for (let i = 0; i < classesCount; i++) {
			const cls = presentation.classes[i];
			if (cls && !link.classList.contains(cls)) {
				link.classList.add(cls);
			}
		}
	} else {
		// 🌟 Siden clearExtraAttributes akkurat kjørte, er elementet helt sterilt.
		// Vi trenger bare å sette på de standard u-stylede fallback-klassene!
		if (!link.classList.contains("data-link-text")) {
			link.classList.add("data-link-text");
		}
		link.classList.add("scl-hide-before");
		link.classList.add("scl-hide-after");
	}

	link.classList.add("scl-processed");
}

