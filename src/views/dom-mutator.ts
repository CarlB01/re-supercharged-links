import ResuperchargedLinks from "../core/main";
import { populatePresentationPool } from "../processors/presentation.engine";
import { parseSpaceSeparatedTokens } from "../utils/shared-utils";
import { SCL_CLEANUP_PROPERTIES } from "../utils/shared-utils";

/**
 * Kirurgisk, sentralisert sterilisering av et element.
 * Sletter KUN attributter og klasser generert av de aktive regel-atomene.
 */
export function clearExtraAttributes(link: HTMLElement, plugin: ResuperchargedLinks): void {
	// 1. STATISK SYSTEM-RENS: Vask våre egne kjente signaturer
	link.removeAttribute("data-scl-signature");
	link.removeAttribute("data-link-tags");

	let i = link.classList.length;
	while (i--) {
    const cls = link.classList.item(i);
    if (cls !== null && cls.startsWith("scl-")) {
        link.classList.remove(cls);
    }
	}

	const style = link.style;
	for (const prop of SCL_CLEANUP_PROPERTIES) {
		style.removeProperty(prop);
	}
	
	if (style.length > 0) {
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

	clearExtraAttributes(link, plugin);
	link.setAttribute("data-scl-signature", resolution.signature);

	link.classList.add("scl-processed");
	
	const presentation = populatePresentationPool(resolution);
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
