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

	// Nullstill inline stiler fullstendig
	link.style.color = "";
	link.style.backgroundColor = "";
	link.style.fontWeight = "";
	link.style.fontStyle = "";
	link.style.textDecoration = "";
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
 * using high-performance inline styles and physical icon node insertion.
 */
export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>, plugin: ResuperchargedLinks): void {
	// 1. LIFECYCLE CLEANUP: Fjern gamle stiler og ikoner for å starte med blanke ark
	clearExtraAttributes(link);

	const visibleText = (link.textContent || "").trim();
	const matchedRule = findMatchingRule(plugin.settings?.selectors, newProps);
	
	// 2. VISUELL STYLING (Kjører ALLTID uavhengig av ikoner eller duplikater)
	if (matchedRule) {
		const isDark = document.body.classList.contains("theme-dark");
		const activeColor = isDark ? matchedRule.darkColor : matchedRule.lightColor;
		const activeBg = isDark ? matchedRule.darkBgColor : matchedRule.lightBgColor;

		if (activeColor) link.style.color = activeColor;
		if (activeBg && activeBg !== "transparent") link.style.backgroundColor = activeBg;
		
		if (matchedRule.fontWeight && matchedRule.fontWeight !== "normal") {
			link.style.fontWeight = matchedRule.fontWeight;
		}
		
		if (matchedRule.fontStyle === "italic") link.style.fontStyle = "italic";
		else if (matchedRule.fontStyle === "underline") link.style.textDecoration = "underline";
		else if (matchedRule.fontStyle === "line-through") link.style.textDecoration = "line-through";

		// 3. ISOLERT IKON-HÅNDTERING (Skreddersydd hemming i fødselen)
		const iconBefore = (matchedRule.iconBefore || "").trim();
		const iconAfter = (matchedRule.iconAfter || "").trim();

		const cleanedText = norm(visibleText);
		const cleanedIconBefore = norm(iconBefore);
		const cleanedIconAfter = norm(iconAfter);

		// Sjekk om teksten allerede starter eller slutter med det aktuelle ikonet
		const skipBefore = !!cleanedIconBefore && cleanedText.startsWith(cleanedIconBefore);
		let skipAfter = !!cleanedIconAfter && cleanedText.endsWith(cleanedIconAfter);

		// Fallback for sammensatte Unicode-tegn (f.eks. medisinske symboler ⚕️) lenger ut i strengen
		if (cleanedIconAfter && !skipAfter && cleanedText.length > 1) {
			const endsWithEmojiSymbol = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedText);
			if (endsWithEmojiSymbol) skipAfter = true;
		}

		// Sett inn Ikon Før – kun hvis det ikke er duplikat
		if (iconBefore && !skipBefore) {
			const spanBefore = document.createElement("span");
			spanBefore.className = "scl-inline-icon-before";
			spanBefore.textContent = iconBefore;
			link.insertBefore(spanBefore, link.firstChild);
		}

		// Sett inn Ikon Etter – kun hvis det ikke er duplikat
		if (iconAfter && !skipAfter) {
			const spanAfter = document.createElement("span");
			spanAfter.className = "scl-inline-icon-after";
			spanAfter.textContent = iconAfter;
			link.appendChild(spanAfter);
		}
	}

	// 4. INJECT DATA ATTRIBUTES (Sørger for at data-link-* er tilstede for bakoverkompatibilitet)
	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey = processKey(key);
		const attributeName = `data-link-${domKey}`;
		const newValue = processValue(key, propValue);

		if (newValue) {
			link.setAttribute(attributeName, newValue);
		}
	}

	// Sikre at kjerneklassen alltid ligger på elementet for stabil DOM-identifikasjon
	if (!link.classList.contains("data-link-text")) {
		link.addClass("data-link-text");
	}
}
