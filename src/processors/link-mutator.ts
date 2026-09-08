import { processKey, processValue, startsWithToken, endsWithToken, normalizeTagToken, isHtmlElement } from "../utils/string-utils";
import ResuperchargedLinks from "../main";

/**
 * High-performance modifier cleanup. Loops backwards to safely drop properties without GC thrashing.
 */
export function clearExtraAttributes(link: HTMLElement): void {
	const attrs = link.attributes;
	for (let i = attrs.length - 1; i >= 0; i--) {
		const attr = attrs[i];
		if (attr && attr.name.includes("data-link")) {
			link.removeAttribute(attr.name);
		}
	}
}

export function extractTagTokensFromElement(el: HTMLElement): string[] {
	const candidates = [
		el.getAttribute("data-tag"),
		el.getAttribute("data-tags"),
		el.getAttribute("href"),
		el.textContent
	].filter((v): v is string => !!v);

	const out: string[] = [];
	for (const raw of candidates) {
		const parts = raw.trim().split(/\s+/).map(p => p.trim()).filter(Boolean);
		for (let token of parts) {
			try { token = decodeURIComponent(token); } catch {}
			const hashIdx = token.lastIndexOf("#");
			if (hashIdx > 0 && (token.startsWith("http") || token.startsWith("/"))) {
				token = token.slice(hashIdx);
			}
			const normalized = normalizeTagToken(token);
			if (normalized) out.push(normalized);
		}
	}
	return Array.from(new Set(out));
}

// Sørg for at denne eksporteres fra src/processors/link-mutator.ts
export function tagChipStyles(container: HTMLElement, plugin: ResuperchargedLinks): void {
	if (!plugin.settings.enableTagChips) return;

	const tagNodes = container.querySelectorAll("a.tag");
	for (let i = 0; i < tagNodes.length; i++) {
		const n = tagNodes[i];
		if (!isHtmlElement(n)) continue;

		const tokens = extractTagTokensFromElement(n);
		if (!tokens || tokens.length === 0) continue;

		let tagString = "";
		for (const t of tokens) {
			if (!t) continue;
			tagString += (tagString ? " " : "") + t;
			if (t.startsWith("#") && t.length > 1) {
				tagString += " " + t.slice(1);
			}
		}

		if (n.getAttribute("data-link-tags") !== tagString) {
			n.setAttribute("data-link-tags", tagString);
		}
		if (!n.classList.contains("data-link-text")) {
			n.classList.add("data-link-text");
		}
	}
}

export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>): void {
	let shouldHideBefore = false;
	let shouldHideAfter = false;

	const attrs = link.attributes;
	for (let i = attrs.length - 1; i >= 0; i--) {
		const attr = attrs[i];
		if (!attr) continue; 

		if (attr.name.includes("data-link")) {
			const rawKey = attr.name.replace("data-link-", "");
			if (!Object.prototype.hasOwnProperty.call(newProps, rawKey)) {
				link.removeAttribute(attr.name);
			}
		}
	}

	const cssProperties: Record<string, string> = {};
	const visibleText = (link.textContent || "").trim();

	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey = processKey(key);
		const attributeName = `data-link-${domKey}`;
		const curValue = link.getAttribute(attributeName);
		const newValue = processValue(key, propValue);

		if (!newValue) {
			if (curValue !== null) link.removeAttribute(attributeName);
			continue;
		}

		if (domKey === "icon" && startsWithToken(visibleText, newValue)) {
			shouldHideBefore = true;
			if (curValue !== null) link.removeAttribute(attributeName);
			continue;
		}
		if (domKey === "icon-after" && endsWithToken(visibleText, newValue)) {
			shouldHideAfter = true;
			if (curValue !== null) link.removeAttribute(attributeName);
			continue;
		}

		if (curValue !== newValue) {
			link.setAttribute(attributeName, newValue);
		}

		const variableKey = `--data-link-${domKey}`;
		cssProperties[variableKey] = (newValue.startsWith("http") || newValue.startsWith("data:"))
			? `url(${newValue})`
			: newValue;
	}

	if (Object.keys(cssProperties).length > 0) {
		link.setCssProps(cssProperties);
	}

	if (shouldHideBefore) {
		if (!link.classList.contains("scl-hide-before")) link.classList.add("scl-hide-before");
	} else {
		if (link.classList.contains("scl-hide-before")) link.classList.remove("scl-hide-before");
	}

	if (shouldHideAfter) {
		if (!link.classList.contains("scl-hide-after")) link.classList.add("scl-hide-after");
	} else {
		if (link.classList.contains("scl-hide-after")) link.classList.remove("scl-hide-after");
	}

	if (!link.classList.contains("data-link-text")) {
		link.classList.add("data-link-text");
	}
}
