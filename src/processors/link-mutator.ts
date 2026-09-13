import { cleanAttributeKey, parseSpaceSeparatedTokens, norm, processValue } from "../utils/string-utils";
import { findMatchingRule } from "./rule-sanitizer";
import ResuperchargedLinks from "../main";
import { CSSLink } from "../types/css-link";

/**
 * High-performance modifier cleanup. Drops data attributes and internal icon spans backwards safely.
 * Strips obsolete semantic matching flags and standardized icon components to prevent layout memory leaks.
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
		for (let token of parts) {
			token = (() => {
				try {
					return decodeURIComponent(token);
				} catch {
					return token;
				}
			})();
			const hashIdx: number = token.lastIndexOf("#");
			if (hashIdx > 0 && (token.startsWith("http") || token.startsWith("/"))) {
				token = token.slice(hashIdx);
			}
			const normalized: string | null = norm(token);
			if (normalized) {
				out.push(`#${normalized.replace(/^#/, "")}`);
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

			let tagString: string = "";
			for (const t of tokens) {
				if (!t) continue;
				tagString += (tagString ? " " : "") + t;
				if (t.startsWith("#") && t.length > 1) {
					tagString += " " + t.slice(1);
				}
			}

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
 */
export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>, plugin: ResuperchargedLinks): void {
	clearExtraAttributes(link);

	const visibleText: string = (link.textContent ?? "").trim();
	const selectorsConfig: CSSLink[] = plugin.settings?.selectors ?? [];
	const matchedProfile = findMatchingRule(selectorsConfig, newProps);

	if (matchedProfile.hasAnyMatch) {
		const isDark: boolean = document.body.classList.contains("theme-dark");
		const activeColor: string | null = isDark ? matchedProfile.darkColor : matchedProfile.lightColor;
		const activeBg: string | null = isDark ? matchedProfile.darkBgColor : matchedProfile.lightBgColor;

		const targetStyles: Partial<CSSStyleDeclaration> = {};
		
		if (activeColor) targetStyles.color = activeColor;
		if (activeBg && activeBg !== "transparent") targetStyles.backgroundColor = activeBg;
		if (matchedProfile.fontWeight && matchedProfile.fontWeight !== "normal") targetStyles.fontWeight = matchedProfile.fontWeight;
		
		if (matchedProfile.fontStyle === "italic") {
			targetStyles.fontStyle = "italic";
		} else if (matchedProfile.fontStyle === "underline") {
			targetStyles.textDecoration = "underline";
		} else if (matchedProfile.fontStyle === "line-through") {
			targetStyles.textDecoration = "line-through";
		}

		link.setCssStyles(targetStyles);

		// === PHASE 2: SEMANTIC INTEROPERABILITY MATCHING ===
		const ruleUid: string | null = matchedProfile.uid;
		if (ruleUid !== null) {
			link.addClass(`scl-rule-${ruleUid}`);
			
			const rawTags: string = newProps["tags"] ?? "";
			const tagsArray: string[] = parseSpaceSeparatedTokens(rawTags);
			for (let j: number = 0; j < tagsArray.length; j++) {
				const cleanTag: string | null = tagsArray[j] ?? null;
				if (cleanTag !== null && cleanTag.length > 0) {
					link.addClass(`scl-match-tag-${cleanTag}`);
				}
			}
		}

		// === PHASE 3: INJECTED ICON CONTAINER STANDARDIZATION ===
		const iconBefore: string | null = matchedProfile.iconBefore;
		const iconAfter: string | null = matchedProfile.iconAfter;

		const cleanedText: string | null = norm(visibleText);
		const cleanedIconBefore: string | null = norm(iconBefore ?? "");
		const cleanedIconAfter: string | null = norm(iconAfter ?? "");

		const skipBefore: boolean = !!cleanedIconBefore && (cleanedText ?? "").startsWith(cleanedIconBefore);
		let skipAfter: boolean = !!cleanedIconAfter && (cleanedText ?? "").endsWith(cleanedIconAfter);

		if (cleanedIconAfter && !skipAfter && (cleanedText ?? "").length > 1) {
			const endsWithEmojiSymbol: boolean = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedText ?? "");
			if (endsWithEmojiSymbol) skipAfter = true;
		}

		if (iconBefore && !skipBefore) {
			const spanBefore: HTMLElement = link.doc.createElement("span");
			spanBefore.addClass("scl-inline-icon");
			spanBefore.addClass("scl-inline-icon-before");
			spanBefore.setAttribute("contenteditable", "false");
			spanBefore.setText(iconBefore);
			spanBefore.setCssStyles({ display: "inline-block" });
			
			const firstChild: ChildNode | null = link.firstChild;
			link.insertBefore(spanBefore, firstChild);
		}

		if (iconAfter && !skipAfter) {
			const spanAfter: HTMLElement = link.doc.createElement("span");
			spanAfter.addClass("scl-inline-icon");
			spanAfter.addClass("scl-inline-icon-after");
			spanAfter.setAttribute("contenteditable", "false");
			spanAfter.setText(iconAfter);
			spanAfter.setCssStyles({ display: "inline-block" });
			
			link.appendChild(spanAfter);
		}
	}

	// === PHASE 1: LEGACY METADATA FOOTPRINT SPECIATION ===
	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey: string = cleanAttributeKey(key);
		const attributeName: string = `data-link-${domKey}`;
		const newValue: string | null = processValue(key, propValue);

		if (newValue !== null) {
			link.setAttribute(attributeName, newValue);
		}
	}

	if (!link.classList.contains("data-link-text")) {
		link.addClass("data-link-text");
	}
}
