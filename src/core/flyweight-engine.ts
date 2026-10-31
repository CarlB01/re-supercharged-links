import { App, getLinkpath } from "obsidian";
import ResuperchargedLinks from "./main";
import { fetchTargetAttributesCached } from "../processors/attribute-fetcher";
import { resolveRuleResolution } from "../processors/rule-engine";
import { extractCleanLinkPath } from "../utils/shared-utils";

export interface FlyweightResponse {
	readonly hasMatch: boolean;
	readonly signature: string;
	readonly classes: string[];
	readonly styles: {
		readonly color: string;
		readonly backgroundColor: string;
		readonly fontWeight: string;
		readonly iconBefore: string;
		readonly iconAfter: string;
		readonly decorations: readonly string[];
	};
}

export interface PresentationPayload {
	readonly classes: string[];
	readonly inlineStyles: Record<string, string>;
}

export class FlyweightEngine {
	private app: App;
	private plugin: ResuperchargedLinks;
	private globalStyleEl: HTMLStyleElement | null = null;

	constructor(app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;
	}

	public getResolution(path: string, visibleText: string): FlyweightResponse {
		const isDark: boolean = document.body.classList.contains("theme-dark");
		const cleanPath: string = extractCleanLinkPath(path);
		
		const dest = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(cleanPath), "") ?? null;
		
		if (dest === null) {
			return { 
				hasMatch: false, 
				signature: `v${this.plugin.getRuleConfigVersion()}||${cleanPath}`, 
				classes: ["data-link-text"],
				styles: { color: "", backgroundColor: "", fontWeight: "", iconBefore: "", iconAfter: "", decorations: [] }
			};
		}

		const rawProps = fetchTargetAttributesCached(this.app, this.plugin, dest, this.plugin.attrCycleCache);

		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawProps,
			isDark,
			includeTagMatchClasses: true,
			visibleText: visibleText
		});

		const ruleVersion: number = this.plugin.getRuleConfigVersion();
		const targetSignature: string = `${ruleVersion}|${resolution.matchedFlyweightIds.join(",")}|${dest.path}`;

		return {
			hasMatch: resolution.hasMatch,
			signature: targetSignature,
			classes: resolution.classes,
			styles: {
				color: resolution.style.color,
				backgroundColor: resolution.style.backgroundColor,
				fontWeight: resolution.style.fontWeight !== "normal" ? resolution.style.fontWeight : "",
				iconBefore: resolution.iconBefore,
				iconAfter: resolution.iconAfter,
				decorations: resolution.style.decorations
			}
		};
	}

	public refreshGlobalStyles(): void {
		if (this.globalStyleEl) {
			this.globalStyleEl.remove();
			this.globalStyleEl = null;
		}

		const selectors = Array.isArray(this.plugin.settings?.selectors) ? this.plugin.settings.selectors : [];
		const selectorsCount = selectors.length;
		if (selectorsCount === 0) return;

		let cssString = "";
		const isDark: boolean = document.body.classList.contains("theme-dark");
		
		for (let i = 0; i < selectorsCount; i++) {
			const rule = selectors[i];
			if (!rule) continue;

			const runtimeId = String(i);
			let ruleStyles = "";

			const textSelection = isDark ? (rule.darkColor ?? "") : (rule.lightColor ?? "");
			if (textSelection.length > 0) ruleStyles += `color: ${textSelection}; `;

			const bgSelection = isDark ? (rule.darkBgColor ?? "") : (rule.lightBgColor ?? "");
			if (bgSelection.length > 0 && bgSelection !== "transparent") {
				ruleStyles += `background-color: ${bgSelection}; `;
			}

			if (rule.fontWeight === "bold" || rule.fontWeight === "lighter") {
				ruleStyles += `font-weight: ${rule.fontWeight}; `;
			}

			const fontStyle = rule.fontStyle ?? "normal";
			if (fontStyle === "italic") ruleStyles += `font-style: italic; `;
			if (fontStyle === "underline" || fontStyle === "line-through") {
				ruleStyles += `text-decoration: ${fontStyle}; `;
			}

			if (ruleStyles.length > 0) {
				// Sikrer ren og stabil prioritet for individuelle klasser og kompositt-sammensetninger
				cssString += `
					.scl-rule-${runtimeId},
					.scl-composite-${runtimeId},
					[class*="scl-composite-${runtimeId}"] {
						${ruleStyles}
					}
				`;
			}
		}

		if (cssString.length > 0) {
			const styleEl: HTMLStyleElement = document.createElement("style");
			styleEl.id = "scl-global-flyweight-rules";
			styleEl.textContent = cssString;
			document.head.appendChild(styleEl);
			this.globalStyleEl = styleEl;
		}
	}

	public destroy(): void {
		if (this.globalStyleEl) {
			this.globalStyleEl.remove();
			this.globalStyleEl = null;
		}
	}
}

/**
 * Tar en rå FlyweightResponse og oversetter den til standardiserte 
 * klasser og stiler som er 100% identiske for både DOM og CM6 attributes.
 */
export function mapResolutionToPresentation(resolution: FlyweightResponse): PresentationPayload {
	const classes: string[] = [...resolution.classes];
	const inlineStyles: Record<string, string> = Object.create(null);
	const s = resolution.styles;

	// Farger levert via standard CSS custom properties for popup/DOM-likhet
	if (s.color) {
		inlineStyles["--scl-color"] = s.color;
		inlineStyles["color"] = s.color;
	}
	if (s.backgroundColor && s.backgroundColor !== "transparent") {
		inlineStyles["--scl-bg"] = s.backgroundColor;
		inlineStyles["background-color"] = s.backgroundColor;
	}

	// Ikon-variabler
	if (s.iconBefore) {
		inlineStyles["--scl-icon-before"] = `"${s.iconBefore}"`;
	} else {
		classes.push("scl-hide-before");
	}

	if (s.iconAfter) {
		inlineStyles["--scl-icon-after"] = `"${s.iconAfter}"`;
	} else {
		classes.push("scl-hide-after");
	}

	// Typografi og dekorasjoner mappet til statiske nytteklasser (ingen inline-kaos)
	if (s.fontWeight === "bold") classes.push("scl-weight-bold");
	if (s.fontWeight === "lighter") classes.push("scl-weight-lighter");

	const decosLen = s.decorations.length;
	for (let i = 0; i < decosLen; i++) {
		const dec = s.decorations[i];
		if (dec === "italic") classes.push("scl-style-italic");
		if (dec === "underline") classes.push("scl-decor-underline");
		if (dec === "line-through") classes.push("scl-decor-linethrough");
	}

	return { classes, inlineStyles };
}

