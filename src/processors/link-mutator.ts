// DOM-changes
import ResuperchargedLinks from "../main";
import { CSSLink } from "../types/css-link";
import { resolveRuleResolution } from "./rule-resolver";
import { cleanAttributeKey, endsWithToken, norm, parseSpaceSeparatedTokens, processValue, startsWithToken } from "../utils/shared-utils";

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
	const targetColor = resolution.style.color || "";
	const targetBg = resolution.style.backgroundColor || "";
	const currentTrackedColor = link.getAttribute("data-link-color") || "";

	// 🚀 IMMUTABILITY GUARD: If the element is already correctly styled by a previous execution frame, 
	// abort immediately. This snaps the infinite mutation/observer chain instantly.
	if (currentTrackedColor === targetColor && link.classList.contains("scl-processed")) {
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
		for (let i = 0; i < resolution.classes.length; i++) {
			const cls = resolution.classes[i];
			if (cls && cls.length > 0 && cls !== "data-link-text") {
				link.addClass(cls);
			}
		}

		// Icon insertion prevention routines using high-performance token processing
		const visibleText = (link.textContent ?? "").trim();
		const iconBefore = resolution.iconBefore;
		const iconAfter = resolution.iconAfter;

		const skipBefore = iconBefore.length > 0 && startsWithToken(visibleText, iconBefore);
		let skipAfter = iconAfter.length > 0 && endsWithToken(visibleText, iconAfter);

		if (iconAfter.length > 0 && !skipAfter && visibleText.length > 1) {
			if (/[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]\$/u.test(visibleText)) {
				skipAfter = true;
			}
		}

		if (iconBefore.length > 0 && !skipBefore) {
			const spanBefore = activeWindow.createEl("span", {
				cls: "scl-inline-icon scl-inline-icon-before",
				text: iconBefore
			});
			spanBefore.setAttribute("contenteditable", "false");
			spanBefore.setCssStyles({ display: "inline-block" });

			const firstChild = link.firstChild;
			if (firstChild !== null) {
				link.insertBefore(spanBefore, firstChild);
			}
		}

		if (iconAfter.length > 0 && !skipAfter) {
			const spanAfter = activeWindow.createEl("span", {
				cls: "scl-inline-icon scl-inline-icon-after",
				text: iconAfter
			});
			spanAfter.setAttribute("contenteditable", "false");
			spanAfter.setCssStyles({ display: "inline-block" });

			link.appendChild(spanAfter);
		}

		// Inject attributes securely
		for (const [attrKey, attrValue] of Object.entries(resolution.attributes)) {
			if (attrValue.length > 0) {
				link.setAttribute(attrKey, attrValue);
			}
		}
		
		if (targetColor.length > 0) {
			link.setAttribute("data-link-color", targetColor);
		}
	}

	// Downstream data tracking integrity export logic
	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey = cleanAttributeKey(key);
		const attributeName = `data-link-${domKey}`;
		let newValue: string | null = processValue(key, propValue);

		if (domKey === "tags" && newValue !== null) {
			const cleanTokens = parseSpaceSeparatedTokens(newValue);
			newValue = cleanTokens.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
		}

		if (newValue !== null) {
			link.setAttribute(attributeName, newValue);
		}
	}

	// Append core tracking classes to complete the execution block lock
	if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
	link.addClass("scl-processed"); // 🚀 LOCK FLAG: Prevents re-processing if states remain unchanged
}

