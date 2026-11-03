import { App, getLinkpath, TFile } from "obsidian";
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

	/**
	 * Henter stil-oppløsningen direkte basert på ferdig oppslåtte attributter.
	 * Isolert for å tillate gjenbruk fra popup-kontekster uten redundant metadata-skanning.
	 */
	public getResolutionFromAttrs(
		dest: TFile,
		rawProps: Record<string, string>,
		visibleText: string,
		includeTagMatchClasses = true
	): FlyweightResponse {
		const ruleVersion: number = this.plugin.cacheManager.getRuleConfigVersion();
		const isDark: boolean = document.body.classList.contains("theme-dark");

		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.cacheManager.compiledRules,
			resolvedAttrs: rawProps,
			isDark,
			includeTagMatchClasses,
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

	public getResolution(pathOrFile: string | TFile, visibleText: string): FlyweightResponse {
		const ruleVersion: number = this.plugin.cacheManager.getRuleConfigVersion();
		const isDark: boolean = document.body.classList.contains("theme-dark");

		// 1. FAST PATH: Hvis visningslaget allerede har sendt oss en ferdig TFile
		if (pathOrFile instanceof TFile) {
			const rawProps = fetchTargetAttributesCached(this.app, this.plugin, pathOrFile, this.plugin.attrCycleCache);
			return this.getResolutionFromAttrs(pathOrFile, rawProps, visibleText, true);
		}

		// 2. SLOW PATH: Fallback hvis vi kun mottar en rå streng-sti
		const cleanPath: string = extractCleanLinkPath(pathOrFile);

		if (cleanPath.length === 0) {
			return { 
				hasMatch: false, 
				signature: `v${ruleVersion}||empty`, 
				classes: ["data-link-text"],
				styles: { color: "", backgroundColor: "", fontWeight: "", iconBefore: "", iconAfter: "", decorations: [] }
			};
		}

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
		return this.getResolutionFromAttrs(dest, rawProps, visibleText, true);
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
			const styleEl = activeDocument.head.createEl("style", { text: cssString });
    	styleEl.id = "scl-global-flyweight-rules";
    
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

