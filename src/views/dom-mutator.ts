// views/dom-mutator

import ResuperchargedLinks from "../core/main";
import { resolveRuleResolution } from "../processors/rule-engine";
import { cleanAttributeKey, endsWithEmoji, endsWithToken, parseSpaceSeparatedTokens, processValue, startsWithToken } from "../utils/shared-utils";

/**
 * Completely purges all supercharged style properties, inline icon spans, and data-link attributes.
 * ⚡ LEAK REMOVER: Iterates backward over element attributes to clear out stale values before fresh writes.
 */
export function clearExtraAttributes(link: HTMLElement): void {
	const attrs: NamedNodeMap = link.attributes;
	let i: number = attrs.length;
	
	// 🚀 FIXED UNDEFINED POTENTIAL: Strict backward loop iteration with concrete null checks
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

	// 1. Gather all dynamic supercharged classes that need to be evicted
	const classesToRemove: string[] = [];
	const currentClasses: DOMTokenList = link.classList;
	const currentClassesCount: number = currentClasses.length;

	for (let k = 0; k < currentClassesCount; k++) {
		const cls: string | null = currentClasses.item(k);
		if (cls !== null && (cls.startsWith("scl-match-") || cls.startsWith("scl-rule-"))) {
			classesToRemove.push(cls);
		}
	}

	const classesToRemoveCount: number = classesToRemove.length;
	for (let m = 0; m < classesToRemoveCount; m++) {
		const targetClass: string | null = classesToRemove[m] ?? null;
		if (targetClass !== null) {
			link.classList.remove(targetClass);
		}
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
	const tagNodesCount: number = tagNodes.length;

	for (let i = 0; i < tagNodesCount; i++) {
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
 * Globally mutates a link element safely by evaluating active compile configurations.
 * ⚡ RACE-CONDITION KILLER: Verifies existing states before execution to prevent endless DOM thrashing loops.
 */
export function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>, plugin: ResuperchargedLinks): void {
	const isDark: boolean = document.body.classList.contains("theme-dark");

	// 1. Resolve the static compiled target rule properties
	const resolution = resolveRuleResolution({
		compiledRules: plugin.compiledRules, 
		resolvedAttrs: newProps,
		isDark,
		includeTagMatchClasses: true
	});

	// Compute a unique signature string for this specific resolution state
	const targetColor: string = resolution.style.color || "";
	const targetBg: string = resolution.style.backgroundColor || "";
	const currentTrackedColor: string = link.getAttribute("data-link-color") || "";
	const currentTrackedBg: string = link.getAttribute("data-link-bg") || "";

	if (currentTrackedColor === targetColor && currentTrackedBg === targetBg && link.classList.contains("scl-processed")) {
		return;
	}

	// 2. Perform destructive cleanup ONLY if a real state change is required
	clearExtraAttributes(link);

	if (resolution.hasMatch) {
		const targetStyles: Partial<CSSStyleDeclaration> = {};

		if (targetColor.length > 0) targetStyles.color = targetColor;
		if (targetBg.length > 0 && targetBg !== "transparent") targetStyles.backgroundColor = targetBg;
		if (resolution.style.fontWeight !== "normal") targetStyles.fontWeight = resolution.style.fontWeight;

		if (resolution.style.fontStyle === "italic") {
			targetStyles.textDecoration = "";
			targetStyles.fontStyle = "italic";
		} else if (resolution.style.fontStyle === "underline") {
			targetStyles.fontStyle = "";
			targetStyles.textDecoration = "underline";
		} else if (resolution.style.fontStyle === "line-through") {
			targetStyles.fontStyle = "";
			targetStyles.textDecoration = "line-through";
		}

		link.setCssStyles(targetStyles);

		// Apply target compiled system classes
		const classesLen: number = resolution.classes.length;
		for (let i = 0; i < classesLen; i++) {
			const cls: string | null = resolution.classes[i] ?? null;
			if (cls !== null && cls.length > 0 && cls !== "data-link-text") {
				link.addClass(cls);
			}
		}

		// Icon insertion prevention routines using high-performance token processing
		const visibleText: string = (link.textContent ?? "").trim();
		const iconBefore: string = resolution.iconBefore;
		const iconAfter: string = resolution.iconAfter;

		const skipBefore: boolean = iconBefore.length > 0 && startsWithToken(visibleText, iconBefore);
		let skipAfter: boolean = iconAfter.length > 0 && endsWithToken(visibleText, iconAfter);

		if (iconAfter.length > 0 && !skipAfter && endsWithEmoji(visibleText)) {
			skipAfter = true;
		}

		if (iconBefore.length > 0 && !skipBefore) {
			const spanBefore = link.createSpan({
				cls: "scl-inline-icon scl-inline-icon-before",
				text: iconBefore
			});
			spanBefore.setAttribute("contenteditable", "false");
			spanBefore.setCssStyles({ display: "inline-block" });

			const firstChild: ChildNode | null = link.firstChild;
			if (firstChild !== null && firstChild !== spanBefore) {
				link.insertBefore(spanBefore, firstChild);
			}
		}

		if (iconAfter.length > 0 && !skipAfter) {
			const spanAfter = link.createSpan({
				cls: "scl-inline-icon scl-inline-icon-after",
				text: iconAfter
			});
			spanAfter.setAttribute("contenteditable", "false");
			spanAfter.setCssStyles({ display: "inline-block" });
			
			link.appendChild(spanAfter);
		}

		// 🚀 LYNRAST DIRECT LOOKUP: Slipper å allokere minne for arrays med Object.entries under scrolling
		const resAttrs = resolution.attributes;
		for (const attrKey in resAttrs) {
			if (Object.prototype.hasOwnProperty.call(resAttrs, attrKey)) {
				const attrValue: string = resAttrs[attrKey] || "";
				if (attrValue.length > 0) {
					link.setAttribute(attrKey, attrValue);
				}
			}
		}
		
		if (targetColor.length > 0) {
			link.setAttribute("data-link-color", targetColor);
		}
	}

	// 🚀 LYNRAST DIRECT LOOKUP: Slipper å allokere minne for arrays med Object.entries under scrolling
	for (const key in newProps) {
		if (Object.prototype.hasOwnProperty.call(newProps, key)) {
			const propValue: string = newProps[key] || "";
			
			const domKey: string = cleanAttributeKey(key);
			const attributeName = `data-link-${domKey}`;
			let newValue: string | null = processValue(key, propValue);

			if (domKey === "tags" && newValue !== null) {
				const cleanTokens: string[] = parseSpaceSeparatedTokens(newValue);
				newValue = cleanTokens.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
			}

			if (newValue !== null) {
				link.setAttribute(attributeName, newValue);
			}
		}
	}

	// Append core tracking classes to complete the execution block lock
	if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
	link.addClass("scl-processed");
}



