import ResuperchargedLinks from "../core/main";
import { resolveRuleResolution } from "../processors/rule-engine";
import { cleanAttributeKey, parseSpaceSeparatedTokens, processValue, stringifyTags } from "../utils/shared-utils";

/**
 * Completely purges all supercharged style properties and data-link attributes.
 */
export function clearExtraAttributes(link: HTMLElement): void {
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
	
	const oldIcons: NodeListOf<HTMLElement> = link.querySelectorAll(".scl-inline-icon");
	const oldIconsCount: number = oldIcons.length;
	for (let j = 0; j < oldIconsCount; j++) {
		const iconEl: HTMLElement | null = oldIcons[j] ?? null;
		if (iconEl !== null) {
			iconEl.remove();
		}
	}

	// Safely iterate backward over the live class list tokens to eliminate array allocations and double loops
	const currentClasses: DOMTokenList = link.classList;
	let k: number = currentClasses.length;

	while (k--) {
		const cls: string | null = currentClasses.item(k);
		if (cls !== null) {
			if (
				cls.startsWith("scl-match-") || 
				cls.startsWith("scl-rule-") || 
				cls === "scl-hide-before" || 
				cls === "scl-hide-after"
			) {
				link.classList.remove(cls);
			}
		}
	}

	if (link.style.length > 0) {
		link.setCssStyles({
			color: "",
			backgroundColor: "",
			fontWeight: "",
			fontStyle: "",
			textDecoration: ""
		});
	}
}

/**
 * Extracts and normalizes tag cache tokens directly from layout elements safely.
 */
export function extractTagTokensFromElement(el: HTMLElement): string[] {
	const hrefAttr: string | null = el.getAttribute("href");
	const textContent: string | null = el.textContent;

	// Fallback to empty strings to permanently eliminate processing crashes
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

	// Deduplicate values inline to completely eliminate intermediate Set object allocations
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
			
			// Extremely fast single-pass string assembly via compiled join pipelines
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

/**
 * V8 OPTIMIZED: Globally mutates a link element safely without layout thrashing.
 * Bypasses intermediate style objects and micro-allocations on hot path.
 */
export function applyStylesAndAttributesToLink(link: HTMLElement, dataAttrs: Record<string, string>, plugin: ResuperchargedLinks): void {
	const isDark: boolean = document.body.classList.contains("theme-dark");
	const visibleText: string = (link.textContent ?? "").trim();

	const resolution = resolveRuleResolution({
		compiledRules: plugin.compiledRules, 
		resolvedAttrs: dataAttrs,
		isDark,
		includeTagMatchClasses: true,
		visibleText: visibleText
	});

	const targetColor: string = resolution.style.color || "";
	const targetBg: string = resolution.style.backgroundColor || "";
	const currentTrackedColor: string = link.getAttribute("data-link-color") || "";
	const currentTrackedBg: string = link.getAttribute("data-link-bg") || "";

	if (currentTrackedColor === targetColor && currentTrackedBg === targetBg && link.classList.contains("scl-processed")) {
		return;
	}

	clearExtraAttributes(link);

	if (resolution.hasMatch) {
		const style = link.style;

		if (targetColor.length > 0) style.color = targetColor;
		
		if (targetBg.length > 0 && targetBg !== "transparent") {
			style.backgroundColor = targetBg;
		}

		if (resolution.style.fontWeight !== "normal") {
			style.fontWeight = resolution.style.fontWeight;
		}

		const decorations = resolution.style.decorations;
		style.fontStyle = decorations.includes("italic") ? "italic" : "";

		// Lynrask streng-sammensetting uten array-allokering (.push / .join)
		let textDeco = "";
		if (decorations.includes("underline")) textDeco = "underline";
		if (decorations.includes("line-through")) {
			textDeco = textDeco.length > 0 ? "underline line-through" : "line-through";
		}
		style.textDecoration = textDeco;

		const classesLen: number = resolution.classes.length;
		for (let i = 0; i < classesLen; i++) {
			const cls = resolution.classes[i];
			if (cls !== undefined && cls !== null && cls.length > 0 && cls !== "data-link-text") {
				link.addClass(cls);
			}
		}

		const resAttrs = resolution.attributes;
		const attrKeys = Object.keys(resAttrs);
		const attrKeysLen = attrKeys.length;

		for (let i = 0; i < attrKeysLen; i++) {
			const attrKey = attrKeys[i];
			
			if (attrKey !== undefined && attrKey !== null) {
				const attrValue = resAttrs[attrKey]; // Nå klager ikke TS på indeksen lenger!
				
				if (attrValue !== undefined && attrValue !== null && attrValue.length > 0) {
					link.setAttribute(attrKey, attrValue);
				}
			}
		}
		
		if (targetColor.length > 0) {
			link.setAttribute("data-link-color", targetColor);
		}
	}

	const propKeys = Object.keys(dataAttrs); 
	const propKeysLen = propKeys.length;

	for (let i = 0; i < propKeysLen; i++) {
			const key = propKeys[i];
			
			// ✨ TS-FIKS: Sikre indeks-typen før vi slår opp i objektet
			if (key !== undefined && key !== null) {
					const propValue = dataAttrs[key]; // TS vet nå at 'key' er en gyldig string-indeks!
					if (propValue === undefined || propValue === null) continue;
					
					const domKey: string = cleanAttributeKey(key);
					const attributeName = `data-link-${domKey}`;
					let newValue: string | null = processValue(key, propValue);

					if (domKey === "tags" && newValue !== null) {
							const cleanTokens: string[] = parseSpaceSeparatedTokens(newValue);
							newValue = stringifyTags(cleanTokens);
					}

					if (newValue !== null) {
							link.setAttribute(attributeName, newValue);
					}
			}
	}

	if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
	link.addClass("scl-processed");
}