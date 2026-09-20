// DOM-changes
import { cleanAttributeKey, parseSpaceSeparatedTokens, norm, processValue } from "../utils/string-utils";
import ResuperchargedLinks from "../main";
import { CSSLink } from "../types/css-link";
import { resolveRuleResolution } from "./rule-resolver";

/**
 * High-performance modifier cleanup. Drops data attributes and internal icon spans backwards safely.
 * Strips obsolete semantic matching flags and standardized icon components to prevent layout memory leaks.
 * ⚡ PURGED OVERHEAD: Completely removed all internal .scl-rule-[UID] tracking loops from Read Mode cleanup routines.
 */
export function clearExtraAttributes(link: HTMLElement): void {
	const attrs: NamedNodeMap = link.attributes;
	for (let i: number = attrs.length - 1; i >= 0; i--) {
		const attr: Attr | null = attrs[i] ?? null;
		if (attr !== null && attr.name.includes("data-link")) {
			link.removeAttribute(attr.name);
		}
	}
	
	const oldIcons: NodeListOf<HTMLElement> = link.querySelectorAll(".scl-inline-icon");
	for (let i: number = 0; i < oldIcons.length; i++) {
		const iconEl: HTMLElement | null = oldIcons[i] ?? null;
		if (iconEl !== null) {
			iconEl.remove();
		}
	}

	const classesToRemove: string[] = Array.from(link.classList).filter((cls: string): boolean => cls.startsWith("scl-match-") || cls.startsWith("scl-rule-"));
	for (const cls of classesToRemove) {
		link.classList.remove(cls);
	}

	link.setCssStyles({
		color: "",
		backgroundColor: "",
		fontWeight: "",
		fontStyle: "",
		textDecoration: ""
	});
}

/**
 * Extracts and normalizes tag cache tokens directly from layout elements safely.
 */
export function extractTagTokensFromElement(el: HTMLElement): string[] {
	const hrefAttr: string | null = el.getAttribute("href");
	const textContent: string | null = el.textContent;

	const candidates: string[] = [
		el.getAttribute("data-tag") ?? "",
		el.getAttribute("data-tags") ?? "",
		hrefAttr ?? "",
		textContent ?? ""
	].filter((v: string): boolean => v.length > 0);

	const out: string[] = [];
	for (const raw of candidates) {
		const parts: string[] = parseSpaceSeparatedTokens(raw);
		for (let i = 0; i < parts.length; i++) {
			const token: string | null = parts[i] ?? null;
			if (token !== null && token.length > 0) {
				out.push(token);
			}
		}
	}
	return Array.from(new Set(out));
}

/**
 * Extends Supercharged styling frameworks safely to active tag chip nodes inside view containers.
 */
export function tagChipStyles(container: HTMLElement, plugin: ResuperchargedLinks): void {
	if (!plugin.settings.enableTagChips) return;

	const tagNodes: NodeListOf<Element> = container.querySelectorAll("a.tag");
	for (let i: number = 0; i < tagNodes.length; i++) {
		const n: Element | null = tagNodes[i] ?? null;
		if (n !== null && n.nodeType === 1) {
			const htmlEl: HTMLElement = n as HTMLElement;
			const tokens: string[] = extractTagTokensFromElement(htmlEl);
			if (tokens.length === 0) continue;

			const tagString: string = tokens.map((t: string): string => `#${t}`).join(" ");

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
 * 🚀 ALL-IN RUNTIME READ MODE ENGINE: Mutates link elements directly in the DOM stream.
 * ⚡ ATOMIC PURGE EXECUTED: All internal in-house rule-UID classes have been fully stripped from this output.
 * Downstream plugins (myBrain) map notes exclusively via standardized, explicit data-attributes.
 */
export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>, plugin: ResuperchargedLinks): void {
	clearExtraAttributes(link);

	const visibleText: string = (link.textContent ?? "").trim();
	const selectorsConfig: CSSLink[] = plugin.settings?.selectors ?? [];
	const isDark: boolean = document.body.classList.contains("theme-dark");

	const resolution = resolveRuleResolution({
		compiledRules: plugin.compiledRules, 
		resolvedAttrs: newProps,
		isDark,
		includeTagMatchClasses: true
	});

	if (resolution.hasMatch) {
		const targetStyles: Partial<CSSStyleDeclaration> = {};

		if (resolution.style.color.length > 0) {
			targetStyles.color = resolution.style.color;
		}
		if (resolution.style.backgroundColor.length > 0 && resolution.style.backgroundColor !== "transparent") {
			targetStyles.backgroundColor = resolution.style.backgroundColor;
		}
		if (resolution.style.fontWeight !== "normal") {
			targetStyles.fontWeight = resolution.style.fontWeight;
		}

		if (resolution.style.fontStyle === "italic") {
			targetStyles.fontStyle = "italic";
		} else if (resolution.style.fontStyle === "underline") {
			targetStyles.textDecoration = "underline";
		} else if (resolution.style.fontStyle === "line-through") {
			targetStyles.textDecoration = "line-through";
		}

		link.setCssStyles(targetStyles);

		// Apply resolver-produced classes (including scl-rule-* and scl-match-tag-*)
		for (let i: number = 0; i < resolution.classes.length; i++) {
			const cls: string | null = resolution.classes[i] ?? null;
			if (cls !== null && cls.length > 0 && cls !== "data-link-text") {
				link.addClass(cls);
			}
		}

		const iconBefore: string = resolution.iconBefore;
		const iconAfter: string = resolution.iconAfter;

		const cleanedText: string = norm(visibleText);
		const cleanedIconBefore: string = norm(iconBefore);
		const cleanedIconAfter: string = norm(iconAfter);

		const skipBefore: boolean = cleanedIconBefore.length > 0 && cleanedText.startsWith(cleanedIconBefore);
		let skipAfter: boolean = cleanedIconAfter.length > 0 && cleanedText.endsWith(cleanedIconAfter);

		if (cleanedIconAfter.length > 0 && !skipAfter && cleanedText.length > 1) {
			const endsWithEmojiSymbol: boolean = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedText);
			if (endsWithEmojiSymbol) {
				skipAfter = true;
			}
		}

		if (iconBefore.length > 0 && !skipBefore) {
			const spanBefore: HTMLElement = activeWindow.createEl("span", {
				cls: "scl-inline-icon scl-inline-icon-before",
				text: iconBefore
			});
			spanBefore.setAttribute("contenteditable", "false");
			spanBefore.setCssStyles({ display: "inline-block" });

			const firstChild: ChildNode | null = link.firstChild;
			if (firstChild !== null) {
				link.insertBefore(spanBefore, firstChild);
			}
		}

		if (iconAfter.length > 0 && !skipAfter) {
			const spanAfter: HTMLElement = activeWindow.createEl("span", {
				cls: "scl-inline-icon scl-inline-icon-after",
				text: iconAfter
			});
			spanAfter.setAttribute("contenteditable", "false");
			spanAfter.setCssStyles({ display: "inline-block" });

			link.appendChild(spanAfter);
		}

		// Apply resolver-produced data attributes (color/bg/weight/style/icon attrs/tags)
		for (const [attrKey, attrValue] of Object.entries(resolution.attributes)) {
			if (attrValue.length > 0) {
				link.setAttribute(attrKey, attrValue);
			}
		}
	}

	// Keep legacy metadata export behavior intact
	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey: string = cleanAttributeKey(key);
		const attributeName: string = `data-link-${domKey}`;
		let newValue: string | null = processValue(key, propValue);

		if (domKey === "tags" && newValue !== null) {
			const cleanTokens: string[] = parseSpaceSeparatedTokens(newValue);
			newValue = cleanTokens.map((t: string): string => (t.startsWith("#") ? t : `#${t}`)).join(" ");
		}

		if (newValue !== null) {
			link.setAttribute(attributeName, newValue);
		}
	}

	if (!link.classList.contains("data-link-text")) {
		link.addClass("data-link-text");
	}
}
