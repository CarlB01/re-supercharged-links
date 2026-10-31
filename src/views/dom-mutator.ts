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
				cls === "scl-hide-after" ||
				cls === "scl-weight-bold" ||
				cls === "scl-weight-lighter" ||
				cls === "scl-style-italic" ||
				cls === "scl-decor-underline" ||
				cls === "scl-decor-linethrough"
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

export function applyStylesAndAttributesToLink(link: HTMLElement, rawAttrs: Record<string, string>, plugin: ResuperchargedLinks): void {
	const pathKey: string = rawAttrs["path"] || "";
	const visibleText: string = (link.textContent || "").trim();

	// 1. Hent fasiten fra det sentrale bakgrunns-API-et (O(1))
	const resolution = plugin.flyweightEngine.getResolution(pathKey, visibleText);

	// 2. O(1) Dyp barriere-sjekk via den unike kompositt-signaturen
	if (link.getAttribute("data-scl-signature") === resolution.signature && link.classList.contains("scl-processed")) {
		return; 
	}

	// 3. Nullstill forrige syklus sine klasser og attributter
	clearExtraAttributes(link);
	
	// 4. Lås den nye signaturen fast på elementet
	link.setAttribute("data-scl-signature", resolution.signature);

	if (resolution.hasMatch) {
		const targetStyles: Partial<CSSStyleDeclaration> = {};
		const s = resolution.styles;

		// 🌟 ROBUST HYBRID-REFLEKSJON: Farger og bakgrunn settes inline for 100% 
		// kompatibilitet med Lesemodus/DOM, mens ikoner tildeles via lette CSS-variabler.
		if (s.color && s.color.length > 0) {
			targetStyles.color = s.color;
			link.setAttribute("data-link-color", s.color);
		}
		if (s.backgroundColor && s.backgroundColor !== "transparent" && s.backgroundColor.length > 0) {
			targetStyles.backgroundColor = s.backgroundColor;
		}

		const inlineStyle: CSSStyleDeclaration = link.style;
		
		if (s.iconBefore && s.iconBefore.length > 0) {
			inlineStyle.setProperty("--scl-icon-before", `"${s.iconBefore}"`);
		} else {
			inlineStyle.removeProperty("--scl-icon-before");
		}

		if (s.iconAfter && s.iconAfter.length > 0) {
			inlineStyle.setProperty("--scl-icon-after", `"${s.iconAfter}"`);
		} else {
			inlineStyle.removeProperty("--scl-icon-after");
		}

		link.setCssStyles(targetStyles);

		// Typografi fra det sentrale oppslaget
		if (s.fontWeight === "bold") link.addClass("scl-weight-bold");
		if (s.fontWeight === "lighter") link.addClass("scl-weight-lighter");

		if (s.decorations.includes("italic")) link.addClass("scl-style-italic");
		if (s.decorations.includes("underline")) link.addClass("scl-decor-underline");
		if (s.decorations.includes("line-through")) link.addClass("scl-decor-linethrough");

		// Klask på klassene fra det sentrale API-svaret (inkludert .scl-composite-X-Y)
		const classesLen = resolution.classes.length;
		for (let i = 0; i < classesLen; i++) {
			const cls = resolution.classes[i];
			if (cls && !link.classList.contains(cls)) {
				link.addClass(cls);
			}
		}
	} else {
		link.setCssStyles({ color: "", backgroundColor: "" });
		link.style.removeProperty("--scl-icon-before");
		link.style.removeProperty("--scl-icon-after");
	}

	if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
	link.addClass("scl-processed");
}


