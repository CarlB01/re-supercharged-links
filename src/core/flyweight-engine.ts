// src/engine/flyweight-engine.ts

import { App, getLinkpath, TFile } from "obsidian";
import ResuperchargedLinks from "./main";
import { fetchTargetAttributesCached } from "../metadata/metadata-extractor";
import { compileSelectors, resolveRuleResolution } from "../engine/selector-compiler";
import { cleanAttributeKey, extractCleanLinkPath } from "../utils/shared-utils";
import { resolveVirtualPreviewResolution } from "../engine/flyweight-style-pool";
import { CSSLink } from "../types/css-link";

export interface ExternalNodeStyleFlyweight {
	readonly hasMatch: boolean;
	readonly signature: string;
	readonly color: string;
	readonly backgroundColor: string;
	readonly iconBefore: string;
	readonly iconAfter: string;
	readonly classes: readonly string[];
	readonly tags: readonly string[];
}

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

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

	public activeAttributesSet: Set<string> = new Set();
	public activeAttributesArray: string[] = [];

	public activeSemanticClassesSet: Set<string> = new Set();
	public activePresentationAttributesSet: Set<string> = new Set();

	public activeHyphenatedKeysArray: string[] = [];

	public ruleRegistry: Map<number, { 
		semanticClass: string; 
		color: string; 
		backgroundColor: string; 
		fontWeight: string;
		fontStyle: string;
		iconBefore: string;
		iconAfter: string;
		classes: string[]; 
	}> = new Map();

	constructor(app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;

		this.compileActiveAttributes();
	}

	/**
	 * Atomiserer komplekse brukerregler til et globalt Flyweight-register med unike tall-ID-er.
	 * Håndterer Light- og Dark-mode som separate, lynraske atomer.
	 */
	public compileActiveAttributes(): void {
		this.activeAttributesSet.clear();
		this.activeAttributesArray = [];
		
		this.activeSemanticClassesSet.clear();
		this.activePresentationAttributesSet.clear();
	
		this.activeHyphenatedKeysArray = ["tags", "path", "data-href"];
		this.ruleRegistry.clear();
		
		const selectorsProxy = this.plugin.settings?.selectors;
		if (!Array.isArray(selectorsProxy)) return;
		
		const len = selectorsProxy.length;
		let ruleIdCounter = 1; 

		for (let i = 0; i < len; i++) {
			const selector: CSSLink | null = selectorsProxy[i] ?? null;
			if (selector === null) continue;

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

			this.activeSemanticClassesSet.add(semanticName);

			if (selector.iconBefore && selector.iconBefore.length > 0) {
				this.activePresentationAttributesSet.add("--scl-icon-before");
			}
			if (selector.iconAfter && selector.iconAfter.length > 0) {
				this.activePresentationAttributesSet.add("--scl-icon-after");
			}

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
				classes: [semanticName]
			});

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
				classes: [semanticName]
			});
		}

		this.activeAttributesArray = Array.from(this.activeAttributesSet);
	}

	public rebuildRuleEngine(): void {
		this.plugin.cacheManager.bumpRuleConfigVersion();
		this.compileActiveAttributes();
		this.plugin.cacheManager.compiledRules = compileSelectors(this.plugin.settings?.selectors ?? []);
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
				classes: [""],
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
				classes: [""],
				styles: { color: "", backgroundColor: "", fontWeight: "", iconBefore: "", iconAfter: "", decorations: [] }
			};
		}

		const rawProps = fetchTargetAttributesCached(this.app, this.plugin, dest, this.plugin.attrCycleCache);
		return this.getResolutionFromAttrs(dest, rawProps, visibleText, true);
	}

	/**
	 * Strengt typet, V8-vennlig batch-oppslag for eksterne plugins (myBrain).
	 * Varmer opp intern attrCycleCache i tidsbudsjetterte chunks (uten å blokkere UI-tråden)
	 * og deler frosne class-arrays mellom identiske regelkombinasjoner (ekte Flyweight).
	 */
	public async resolveBatchForExternal(
		files: readonly TFile[],
		budgetMs = 5
	): Promise<Map<string, ExternalNodeStyleFlyweight>> {
		const results = new Map<string, ExternalNodeStyleFlyweight>();
		const total = files.length;
		if (total === 0) return results;

		const ruleVersion: number = this.plugin.cacheManager.getRuleConfigVersion();
		const isDark: boolean = document.body.classList.contains("theme-dark");
		const compiledRules = this.plugin.cacheManager.compiledRules;
		const attrCache = this.plugin.attrCycleCache;

		// Lokal flyweight-pool for denne batchen: identiske regelsett deler eksakt samme array-referanse
		const sharedClassArrays = new Map<string, readonly string[]>();

		let index = 0;

		while (index < total) {
			const frameStart: number = performance.now();

			while (index < total && performance.now() - frameStart < budgetMs) {
				const file: TFile | undefined = files[index];
				index++;
				if (file === undefined) continue;

				// 1. Varmer opp Re-Supercharged Links sin egen cache for senere DOM-bruk
				const rawProps: Record<string, string> = fetchTargetAttributesCached(
					this.app,
					this.plugin,
					file,
					attrCache
				);

				// 2. Ekstraher tags uten ekstra allokeringer dersom feltet er tomt
				const rawTags: string = rawProps["tags"] ?? "";
				const parsedTags: readonly string[] = rawTags.length > 0
					? Object.freeze(rawTags.split(" ").filter((t: string) => t.length > 0))
					: EMPTY_STRING_ARRAY;

				// 3. Beregn stil-oppløsning
				const resolution = resolveRuleResolution({
					compiledRules,
					resolvedAttrs: rawProps,
					isDark,
					includeTagMatchClasses: true,
					visibleText: file.basename
				});

				if (!resolution.hasMatch) {
					results.set(file.path, {
						hasMatch: false,
						signature: `${ruleVersion}||${file.path}`,
						color: "",
						backgroundColor: "",
						iconBefore: "",
						iconAfter: "",
						classes: EMPTY_STRING_ARRAY,
						tags: parsedTags
					});
					continue;
				}

				const hasBefore = resolution.iconBefore.length > 0 ? "1" : "0";
				const hasAfter = resolution.iconAfter.length > 0 ? "1" : "0";
				const ruleKey = `${resolution.matchedFlyweightIds.join(",")}|${hasBefore}${hasAfter}`;

				let sharedClasses: readonly string[] | undefined = sharedClassArrays.get(ruleKey);

				if (sharedClasses === undefined) {
					// Bygg samlet klasseliste én gang per unik regelkombinasjon
					const combined: string[] = [];
					const s = resolution.style;

					if (s.fontWeight === "bold") combined.push("scl-weight-bold");
					else if (s.fontWeight === "lighter") combined.push("scl-weight-lighter");

					const decos = s.decorations;
					for (let d = 0; d < decos.length; d++) {
						const dec: string | undefined = decos[d];
						if (dec === "italic") combined.push("scl-style-italic");
						else if (dec === "underline") combined.push("scl-decor-underline");
						else if (dec === "line-through") combined.push("scl-decor-linethrough");
					}

					if (hasBefore) combined.push("scl-with-before");
					if (hasAfter) combined.push("scl-with-after");

					const baseClasses = resolution.classes;
					for (let c = 0; c < baseClasses.length; c++) {
						const cls: string | undefined = baseClasses[c];
						if (cls !== undefined && cls.length > 0) {
							combined.push(cls);
						}
					}

					sharedClasses = Object.freeze(combined);
					sharedClassArrays.set(ruleKey, sharedClasses);
				}

				results.set(file.path, {
					hasMatch: true,
					signature: `${ruleVersion}|${ruleKey}|${file.path}`,
					color: resolution.style.color,
					backgroundColor: resolution.style.backgroundColor,
					iconBefore: resolution.iconBefore,
					iconAfter: resolution.iconAfter,
					classes: sharedClasses,
					tags: parsedTags
				});
			}

			if (index < total) {
				await new Promise<void>((resolve) => {
					window.requestAnimationFrame(() => resolve());
				});
			}
		}

		return results;
	}

	public destroy(): void {
		this.activeAttributesSet.clear();
		this.activeSemanticClassesSet.clear();
		this.activePresentationAttributesSet.clear();
		this.ruleRegistry.clear();
		this.activeAttributesArray = [];
		this.activeHyphenatedKeysArray = [];
	}
}


