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
	const isDark: boolean = document.body.classList.contains("theme-dark");
	const pathKey: string = rawAttrs["path"] || "";

	// 🔥 Hent nodens faktiske synlige tekst for O(1) de-duplisering i dypet
	const visibleText: string = (link.textContent || "").trim();

	// 1. Kjør regel-motoren
	const resolution = resolveRuleResolution({
		compiledRules: plugin.compiledRules,
		resolvedAttrs: rawAttrs,
		isDark,
		includeTagMatchClasses: true,
		visibleText: visibleText
	});

	// 2. DYP FLYWEIGHT BARRIERE-SJEKK
	const ruleVersion: number = plugin.getRuleConfigVersion();
	const targetSignature: string = `${ruleVersion}|${resolution.matchedFlyweightIds.join(",")}|${pathKey}`;
	
	if (link.getAttribute("data-scl-signature") === targetSignature && link.classList.contains("scl-processed")) {
		return;
	}

	clearExtraAttributes(link);
	link.setAttribute("data-scl-signature", targetSignature);

	if (resolution.hasMatch) {
		const targetStyles: Partial<CSSStyleDeclaration> = {};
		
		if (resolution.style.color && resolution.style.color.length > 0) {
			targetStyles.color = resolution.style.color;
		}
		if (resolution.style.backgroundColor && resolution.style.backgroundColor !== "transparent" && resolution.style.backgroundColor.length > 0) {
			targetStyles.backgroundColor = resolution.style.backgroundColor;
		}

		link.setCssStyles(targetStyles);

		// 🔥 SKYV DATA DIREKTE UT FRA DATA-KONTRAKTEN:
		const inlineStyle: CSSStyleDeclaration = link.style;
		
		if (resolution.iconBefore && resolution.iconBefore.length > 0) {
			inlineStyle.setProperty("--scl-icon-before", `"${resolution.iconBefore}"`);
			link.setAttribute("data-scl-icon-before", resolution.iconBefore);
		} else {
			inlineStyle.removeProperty("--scl-icon-before");
			link.removeAttribute("data-scl-icon-before");
		}

		if (resolution.iconAfter && resolution.iconAfter.length > 0) {
			inlineStyle.setProperty("--scl-icon-after", `"${resolution.iconAfter}"`);
			link.setAttribute("data-scl-icon-after", resolution.iconAfter);
		} else {
			inlineStyle.removeProperty("--scl-icon-after");
			link.removeAttribute("data-scl-icon-after");
		}

		if (resolution.style.fontWeight === "bold") link.addClass("scl-weight-bold");
		if (resolution.style.fontWeight === "lighter") link.addClass("scl-weight-lighter");

		const decorations: readonly string[] = resolution.style.decorations || [];
		if (decorations.includes("italic")) link.addClass("scl-style-italic");
		if (decorations.includes("underline")) link.addClass("scl-decor-underline");
		if (decorations.includes("line-through")) link.addClass("scl-decor-linethrough");

		// Rull ut atomene
		const matchedIds: number[] = resolution.matchedFlyweightIds;
		const matchedIdsLen: number = matchedIds.length;
		const registry = plugin.ruleRegistry;

		for (let i = 0; i < matchedIdsLen; i++) {
			const rawAtomId = matchedIds[i];
			if (rawAtomId === undefined || rawAtomId === null) continue;
			const atomId: number = rawAtomId;
			const atom = registry.get(atomId);
			
			if (atom !== undefined && atom !== null) {
				link.addClass(atom.semanticClass);

				const atomAttrs = atom.attributes;
				const staticKeys: string[] = plugin.activeHyphenatedKeysArray;
				const staticKeysLen: number = staticKeys.length;
				for (let j = 0; j < staticKeysLen; j++) {
					const rawAttrKey = staticKeys[j];
					if (rawAttrKey === undefined || rawAttrKey === null) continue;

					const attrKey: string = rawAttrKey;
					const attrValue = atomAttrs[attrKey];
					if (attrValue !== undefined && attrValue !== null && attrValue.length > 0) {
						link.setAttribute(attrKey, attrValue);
					}
				}
			}
		}
	} else {
		link.setCssStyles({ color: "", backgroundColor: "" });
		link.style.removeProperty("--scl-icon-before");
		link.style.removeProperty("--scl-icon-after");
		link.removeAttribute("data-scl-icon-before");
		link.removeAttribute("data-scl-icon-after");
	}

	// 5. Metadata-injisering
	const propKeys: string[] = plugin.activeHyphenatedKeysArray;
	const propKeysLen: number = propKeys.length;
	for (let i = 0; i < propKeysLen; i++) {
		const rawKey = propKeys[i];
		if (rawKey === undefined || rawKey === null) continue;

		const key: string = rawKey;
		if (key === "href" || key === "data-href" || key === "id" || key === "path") {
			continue;
		}
		
		const propValue: string | undefined | null = rawAttrs[key];
		if (propValue === undefined || propValue === null) continue;

		const domKey: string = cleanAttributeKey(key);
		const attributeName: string = `data-link-${domKey}`;
		let newValue: string | null = processValue(key, propValue);

		if (domKey === "tags" && newValue !== null) {
			const cleanTokens: string[] = parseSpaceSeparatedTokens(newValue);
			newValue = stringifyTags(cleanTokens);
		}

		if (newValue !== null && newValue.length > 0) {
			link.setAttribute(attributeName, newValue);
		}
	}

	// Til slutt, rull ut klassene fra resolusjonen direkte (inkludert felles scl-hide-before/after!)
	const resClassesLen = resolution.classes.length;
	for (let i = 0; i < resClassesLen; i++) {
		const cls = resolution.classes[i];
		if (cls && !link.classList.contains(cls)) {
			link.addClass(cls);
		}
	}

	link.addClass("scl-processed");
}
