// 🔑 SIKRET: Ingen import av setCssStyles her
import { processKey, processValue, norm } from "../utils/string-utils";
import { findMatchingRule } from "./rule-sanitizer";
import ResuperchargedLinks from "../main";

/**
 * High-performance modifier cleanup. Drops data attributes and internal icon spans backwards safely.
 */
export function clearExtraAttributes(link: HTMLElement): void {
	const attrs = link.attributes;
	for (let i = attrs.length - 1; i >= 0; i--) {
		const attr = attrs[i];
		if (attr && attr.name.includes("data-link")) {
			link.removeAttribute(attr.name);
		}
	}
	
	// Fjern eventuelle inline-ikoner fra tidligere renderinger trygt
	const oldIcons = link.querySelectorAll(".scl-inline-icon-before, .scl-inline-icon-after");
	for (let i = 0; i < oldIcons.length; i++) {
		const iconEl = oldIcons[i];
		if (iconEl) {
			iconEl.remove();
		}
	}

	// 🔑 FIKSET (Linje 27-31): Kalles direkte på elementet via Obsidians innebygde prototype!
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
	const candidates = [
		el.getAttribute("data-tag"),
		el.getAttribute("data-tags"),
		el.getAttribute("href"),
		el.textContent
	].filter((v): v is string => typeof v === "string" && v.length > 0);

	const out: string[] = [];
	for (const raw of candidates) {
		const parts = raw.trim().split(/\s+/).map(p => p.trim()).filter(Boolean);
		for (let token of parts) {
			token = (() => {
				try {
					return decodeURIComponent(token);
				} catch {
					return token;
				}
			})();
			const hashIdx = token.lastIndexOf("#");
			if (hashIdx > 0 && (token.startsWith("http") || token.startsWith("/"))) {
				token = token.slice(hashIdx);
			}
			const normalized = norm(token);
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

	const tagNodes = container.querySelectorAll("a.tag");
	for (let i = 0; i < tagNodes.length; i++) {
		const n = tagNodes[i];
		if (typeof n === "object" && n !== null && (n as Node).nodeType === 1) {
			const htmlEl = n as HTMLElement;
			const tokens = extractTagTokensFromElement(htmlEl);
			if (!tokens || tokens.length === 0) continue;

			let tagString = "";
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
 * 🚀 ALL-IN RUNTIME READ MODE ENGINE: Mutates link elements directly in the DOM stream
 */
export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>, plugin: ResuperchargedLinks): void {
	clearExtraAttributes(link);

	const visibleText = (link.textContent || "").trim();
	const matchedRule = findMatchingRule(plugin.settings?.selectors, newProps);

	if (matchedRule) {
		const isDark = document.body.classList.contains("theme-dark");
		const activeColor = isDark ? matchedRule.darkColor : matchedRule.lightColor;
		const activeBg = isDark ? matchedRule.darkBgColor : matchedRule.lightBgColor;

		const targetStyles: Partial<CSSStyleDeclaration> = {};
		
		if (activeColor) targetStyles.color = activeColor;
		if (activeBg && activeBg !== "transparent") targetStyles.backgroundColor = activeBg;
		if (matchedRule.fontWeight && matchedRule.fontWeight !== "normal") targetStyles.fontWeight = matchedRule.fontWeight;
		
		if (matchedRule.fontStyle === "italic") {
			targetStyles.fontStyle = "italic";
		} else if (matchedRule.fontStyle === "underline") {
			targetStyles.textDecoration = "underline";
		} else if (matchedRule.fontStyle === "line-through") {
			targetStyles.textDecoration = "line-through";
		}

		// 🔑 FIKSET (Linje 126-128+): Kalles trygt og direkte på link-elementet
		link.setCssStyles(targetStyles);

		const iconBefore = (matchedRule.iconBefore || "").trim();
		const iconAfter = (matchedRule.iconAfter || "").trim();

		const cleanedText = norm(visibleText);
		const cleanedIconBefore = norm(iconBefore);
		const cleanedIconAfter = norm(iconAfter);

		const skipBefore = !!cleanedIconBefore && cleanedText.startsWith(cleanedIconBefore);
		let skipAfter = !!cleanedIconAfter && cleanedText.endsWith(cleanedIconAfter);

		if (cleanedIconAfter && !skipAfter && cleanedText.length > 1) {
			const endsWithEmojiSymbol = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedText);
			if (endsWithEmojiSymbol) skipAfter = true;
		}

		if (iconBefore && !skipBefore) {
			// 🔑 FIKSET: Oppretter isolert i minnet, setter klasse og tekst via Obsidians hjelpere
			const spanBefore = document.createElement("span");
			spanBefore.addClass("scl-inline-icon-before");
			spanBefore.setText(iconBefore);
			
			spanBefore.setCssStyles({ marginRight: "3px", display: "inline-block" });
			
			link.insertBefore(spanBefore, link.firstChild);
		}

		// Sett inn Ikon Etter – kun hvis det ikke er duplikat
		if (iconAfter && !skipAfter) {
			const spanAfter = document.createElement("span");
			spanAfter.addClass("scl-inline-icon-after");
			spanAfter.setText(iconAfter);
			
			spanAfter.setCssStyles({ marginLeft: "3px", display: "inline-block" });
			
			link.appendChild(spanAfter);
		}
	}

	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey = processKey(key);
		const attributeName = `data-link-${domKey}`;
		const newValue = processValue(key, propValue);

		if (newValue) {
			link.setAttribute(attributeName, newValue);
		}
	}

	if (!link.classList.contains("data-link-text")) {
		link.addClass("data-link-text");
	}
}
