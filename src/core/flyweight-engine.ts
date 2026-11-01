import { App, getLinkpath } from "obsidian";
import ResuperchargedLinks from "./main";
import { fetchTargetAttributesCached } from "../processors/attribute-fetcher";
import { resolveRuleResolution } from "../processors/rule-engine";
import { cleanAttributeKey, extractCleanLinkPath } from "../utils/shared-utils";
import { resolveVirtualPreviewResolution } from "../processors/presentation.engine";
import { CSSLink } from "../types/css-link";

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
	public activeAttributesSet: Set<string> = new Set();
	public activeAttributesArray: string[] = [];
	public activeHyphenatedKeysArray: string[] = [];

	// Et raskt O(1) tall-til-objekt kart for render-løkken
	public ruleRegistry: Map<number, { 
		semanticClass: string; 
		color: string; 
		backgroundColor: string; 
		fontWeight: string;
		fontStyle: string;
		iconBefore: string;
		iconAfter: string;
		attributes: Record<string, string>; 
		classes: string[]; 
	}> = new Map();

	constructor(app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;

		this.refreshGlobalStyles();
		this.compileActiveAttributes();
	}

	/**
	 * Atomiserer komplekse brukerregler til et globalt Flyweight-register med unike tall-ID-er.
	 * Håndterer Light- og Dark-mode som separate, lynraske atomer.
	 */
	public compileActiveAttributes(): void {
		this.activeAttributesSet.clear();
		this.activeAttributesArray = [];
		
		// 1. Nullstill og pre-populer den flate systemfelt-indeksen
		this.activeHyphenatedKeysArray = ["tags", "path", "data-href"];
		
		// 2. Tøm det gamle Flyweight-registeret
		this.ruleRegistry.clear();
		
		if (this.plugin.settings === null || this.plugin.settings.selectors === null) return;

		const selectorsProxy: CSSLink[] = this.plugin.settings.selectors;
		if (!Array.isArray(selectorsProxy)) return;
		
		const len = selectorsProxy.length;
		let ruleIdCounter = 1; // Unike numeriske ID-er for atomene

		for (let i = 0; i < len; i++) {
			const selector: CSSLink | null = selectorsProxy[i] ?? null;
			if (selector === null) continue;

			// Registrer rå-attributter for filskanneren
			if (selector.type === "attribute") {
				const attrName: unknown = selector.name;
				if (typeof attrName === "string" && attrName.length > 0) {
					this.activeAttributesSet.add(attrName);
					
					const cleaned: string = cleanAttributeKey(attrName);
					if (cleaned.length > 0 && !this.activeHyphenatedKeysArray.includes(cleaned)) {
						this.activeHyphenatedKeysArray.push(cleaned);
					}
				}
			}

			// 3. Generer et vakkert, semantisk klassenavn for eksterne utviklere
			let semanticName = "";
			if (selector.type === "attribute" && typeof selector.name === "string") {
				const cleanValue = typeof selector.value === "string" ? cleanAttributeKey(selector.value) : "value";
				semanticName = `scl-match-${cleanAttributeKey(selector.name)}-${cleanValue}`;
			} else if (selector.type === "tag" && typeof selector.value === "string") {
				semanticName = `scl-match-tag-${cleanAttributeKey(selector.value)}`;
			} else if (typeof selector.name === "string") {
				semanticName = `scl-rule-${cleanAttributeKey(selector.name)}`;
			} else {
				semanticName = `scl-rule-atom-${ruleIdCounter}`;
			}

			// Forbered eventuelle ekstra presentasjonsattributter (f.eks. ikoner til DOM)
			const baseAttributes: Record<string, string> = Object.create(null);
			if (selector.iconBefore && selector.iconBefore.length > 0) baseAttributes["data-link-icon-before"] = selector.iconBefore;
			if (selector.iconAfter && selector.iconAfter.length > 0) baseAttributes["data-link-icon-after"] = selector.iconAfter;

			// 4. 🔥 REGISTRER LIGHT MODE ATOM
			const lightId = ruleIdCounter++;
			selector._flyweightIdLight = lightId;
			this.ruleRegistry.set(lightId, {
				semanticClass: semanticName,
				color: selector.lightColor || "",
				backgroundColor: selector.lightBgColor || "",
				fontWeight: selector.fontWeight || "normal",
				fontStyle: selector.fontStyle || "normal",
				iconBefore: selector.iconBefore || "",
				iconAfter: selector.iconAfter || "",
				attributes: baseAttributes,
				classes: [semanticName]
			});

			// 5. 🔥 REGISTRER DARK MODE ATOM
			const darkId = ruleIdCounter++;
			selector._flyweightIdDark = darkId;
			this.ruleRegistry.set(darkId, {
				semanticClass: semanticName,
				color: selector.darkColor || "",
				backgroundColor: selector.darkBgColor || "",
				fontWeight: selector.fontWeight || "normal",
				fontStyle: selector.fontStyle || "normal",
				iconBefore: selector.iconBefore || "",
				iconAfter: selector.iconAfter || "",
				attributes: baseAttributes,
				classes: [semanticName]
			});
		}

		this.activeAttributesArray = Array.from(this.activeAttributesSet);
	}

	public getResolution(path: string, visibleText: string): FlyweightResponse {
		const cleanPath: string = extractCleanLinkPath(path);
		const ruleVersion: number = this.plugin.cacheManager.getRuleConfigVersion();
		const isDark: boolean = document.body.classList.contains("theme-dark");

		if (cleanPath.startsWith("virtual://preview/")) {
			return resolveVirtualPreviewResolution(this.plugin, cleanPath, visibleText, ruleVersion, isDark);
		}

		const dest = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(cleanPath), "") ?? null;
		
		if (dest === null) {
			return { 
				hasMatch: false, 
				signature: `v${ruleVersion}||${cleanPath}`, 
				classes: ["data-link-text"],
				styles: { color: "", backgroundColor: "", fontWeight: "", iconBefore: "", iconAfter: "", decorations: [] }
			};
		}

		const rawProps = fetchTargetAttributesCached(this.app, this.plugin, dest, this.plugin.attrCycleCache);

		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.cacheManager.compiledRules,
			resolvedAttrs: rawProps,
			isDark,
			includeTagMatchClasses: true,
			visibleText: visibleText
		});

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
		
		// Enkeltregler (Kun farge, bakgrunn og typografi)
		for (let i = 0; i < selectorsCount; i++) {
			const rule = selectors[i];
			if (!rule) continue;

			const runtimeId = String(i);
			let ruleStyles = "";

			const textSelection = isDark ? (rule.darkColor ?? "") : (rule.lightColor ?? "");
			if (textSelection.length > 0) ruleStyles += `color: ${textSelection}; --scl-link-color: ${textSelection}; `;

			const bgSelection = isDark ? (rule.darkBgColor ?? "") : (rule.lightBgColor ?? "");
			if (bgSelection.length > 0 && bgSelection !== "transparent") ruleStyles += `background-color: ${bgSelection}; `;

			if (rule.fontWeight === "bold" || rule.fontWeight === "lighter") ruleStyles += `font-weight: ${rule.fontWeight}; `;
			if (rule.fontStyle === "italic") ruleStyles += `font-style: italic; `;
			if (rule.fontStyle === "underline" || rule.fontStyle === "line-through") ruleStyles += `text-decoration: ${rule.fontStyle}; `;

			if (ruleStyles.length > 0) {
				cssString += `
					.scl-rule-${runtimeId}, .scl-composite-${runtimeId} { 
						${ruleStyles} 
					}\n`;
			}
		}

		// Sammensatte (Compound) regler
		for (let i = 0; i < selectorsCount; i++) {
			for (let j = i + 1; j < selectorsCount; j++) {
				const ruleB = selectors[j];
				if (!ruleB) continue;

				let compositeStyles = "";
				const colorB = isDark ? (ruleB.darkColor ?? "") : (ruleB.lightColor ?? "");
				if (colorB.length > 0) compositeStyles += `color: ${colorB}; --scl-link-color: ${colorB}; `;
				
				const bgB = isDark ? (ruleB.darkBgColor ?? "") : (ruleB.lightBgColor ?? "");
				if (bgB.length > 0 && bgB !== "transparent") compositeStyles += `background-color: ${bgB}; `;

				if (compositeStyles.length > 0) {
					cssString += `.scl-composite-${i}-${j} { ${compositeStyles} }\n`;
				}
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
		this.activeAttributesSet.clear();
		this.activeAttributesArray = [];
		
	}
}

/**
 * Oversetter en rå FlyweightResponse til standardiserte, typesikre 
 * klasser og stiler som er identiske for både DOM og CodeMirror 6.
 */
export function mapResolutionToPresentation(
	resolution: FlyweightResponse,
	skipIconBefore: boolean = false,
	skipIconAfter: boolean = false
): PresentationPayload {
	const classes: string[] = [];
	const inlineStyles: Record<string, string> = Object.create(null) as Record<string, string>;
	const s = resolution.styles;

	// 1. Alltid inkluder basistekst-klassen hvis matchen er gyldig
	if (resolution.hasMatch) {
		classes.push("data-link-text");

		// 2. Farger og bakgrunner (både som rå verdier og CSS-variabler for popup-likhet)
		if (s.color.length > 0) {
			inlineStyles["--scl-color"] = s.color;
			inlineStyles["color"] = s.color;
		}
		if (s.backgroundColor.length > 0 && s.backgroundColor !== "transparent") {
			inlineStyles["--scl-bg"] = s.backgroundColor;
			inlineStyles["background-color"] = s.backgroundColor;
		}

		// 3. Typografi fra det sentrale oppslaget
		if (s.fontWeight === "bold") classes.push("scl-weight-bold");
		if (s.fontWeight === "lighter") classes.push("scl-weight-lighter");

		const decosLen = s.decorations.length;
		for (let i = 0; i < decosLen; i++) {
			const dec = s.decorations[i];
			if (dec === "italic") classes.push("scl-style-italic");
			if (dec === "underline") classes.push("scl-decor-underline");
			if (dec === "line-through") classes.push("scl-decor-linethrough");
		}

		// 4. Ikon-håndtering med streng posisjonell overstyring
		if (s.iconBefore.length > 0 && !skipIconBefore) {
			inlineStyles["--scl-icon-before"] = `"${s.iconBefore}"`;
		} else {
			classes.push("scl-hide-before");
		}

		if (s.iconAfter.length > 0 && !skipIconAfter) {
			inlineStyles["--scl-icon-after"] = `"${s.iconAfter}"`;
		} else {
			classes.push("scl-hide-after");
		}

		// 5. Kompositt-klasser fra regel-motoren (.scl-composite-X-Y)
		const resolutionClassesLen = resolution.classes.length;
		for (let i = 0; i < resolutionClassesLen; i++) {
			const cls = resolution.classes[i];
			if (cls && cls !== "data-link-text" && !classes.includes(cls)) {
				classes.push(cls);
			}
		}
	} else {
		// Fallback for nøytrale noder: Sørg for at variabler og ikoner vaskes bort
		classes.push("data-link-text");
		classes.push("scl-hide-before");
		classes.push("scl-hide-after");
	}

	return { classes, inlineStyles };
}
