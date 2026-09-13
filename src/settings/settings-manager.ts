import { Plugin } from "obsidian";
import { SCLSettings, DEFAULT_SETTINGS } from "./settings";
import { CSSLink } from "../types/css-link";
import { sanitizeRuleset } from "../processors/rule-sanitizer";

/**
 * 🔑 CONDUIT PROPERTY DICTIONARY
 * Dictionary of strict implicit parameters that under no circumstance belong on the disk layer.
 */
const GARBAGE_PROPERTIES: Record<string, string> = {
	name: "",
	value: "",
	iconBefore: "",
	iconAfter: "",
	fontWeight: "normal",
	fontStyle: "normal",
	lightColor: "",
	darkColor: "",
	lightBgColor: "transparent",
	darkBgColor: "transparent"
};

/**
 * 🚀 RUNTIME INGESTION CLEANER
 * Safely reads raw storage structures from disk and purges stale/empty/corrupted nodes.
 * Guarantees a fully hydrated, crash-immune object schema before core engines can evaluate fields.
 */
export async function loadAndSanitizeSettings(plugin: Plugin): Promise<{ settings: SCLSettings; dataRepaired: boolean }> {
	const pluginInstance: Plugin | null = plugin ?? null;
	if (pluginInstance === null) {
		return { settings: { ...DEFAULT_SETTINGS }, dataRepaired: false };
	}

	const loadedData: Record<string, unknown> | null = (await pluginInstance.loadData()) as Record<string, unknown> | null;
	const dataProxy: Record<string, any> = loadedData ?? {};
	let dataRepaired: boolean = loadedData === null;

	// 1. Force selectors to be an array primitive regardless of configuration state
	if (!dataProxy.selectors || !Array.isArray(dataProxy.selectors)) {
		dataProxy.selectors = [];
		dataRepaired = true;
	}

	// 2. Perform aggressive sanitization sweep to prune trash values before they hit memory
	dataProxy.selectors = dataProxy.selectors.map((rawRule: any): any => {
		if (!rawRule || typeof rawRule !== "object") {
			dataRepaired = true;
			return null;
		}

		const cleanRule: Record<string, any> = { ...rawRule };

		for (const [key, garbageValue] of Object.entries(GARBAGE_PROPERTIES)) {
			if (cleanRule[key] === garbageValue) {
				delete cleanRule[key];
				dataRepaired = true;
			}
		}

		if (cleanRule["matchCaseSensitive"] === false) {
			delete cleanRule["matchCaseSensitive"];
			dataRepaired = true;
		}

		return cleanRule;
	}).filter((r: any): boolean => r !== null);

	// 3. Assemble and merge compiled states securely with system defaults
	const mergedSettings: SCLSettings = Object.assign({}, DEFAULT_SETTINGS, dataProxy);
	const selectorsList: CSSLink[] = mergedSettings.selectors ?? [];
	
	// Deep mathematical structural analysis loop pass (Checks =, *= selectors)
	const { sanitized, hasChanges } = sanitizeRuleset(selectorsList);
	mergedSettings.selectors = sanitized;

	if (hasChanges) {
		dataRepaired = true;
	}

	return { settings: mergedSettings, dataRepaired };
}

/**
 * 🔑 PRISTINE DATA STORAGE ENGINE
 * Mutates and strips layout configuration models prior to disk serialization.
 * Ensures the disk channel remains completely free of empty fields and layout noise.
 */
export async function saveStrippedSettings(plugin: Plugin, settings: SCLSettings): Promise<void> {
	const pluginInstance: Plugin | null = plugin ?? null;
	if (pluginInstance === null) return;

	const settingsClone: SCLSettings = JSON.parse(JSON.stringify(settings));
	const rawSelectors: CSSLink[] = settingsClone.selectors ?? [];

	settingsClone.selectors = rawSelectors.map((rule: CSSLink): CSSLink => {
		const cleanRule: Record<string, any> = { ...(rule as unknown as Record<string, any>) };

		for (const [key, defaultValue] of Object.entries(GARBAGE_PROPERTIES)) {
			if (cleanRule[key] === defaultValue) {
				delete cleanRule[key];
			}
		}

		// 🔑 STRICT PROTOCOL: Force-obliterate 'match' unconditionally before writing to data.json
		if ("match" in cleanRule) {
			delete cleanRule["match"];
		}

		if (cleanRule["matchCaseSensitive"] === false) {
			delete cleanRule["matchCaseSensitive"];
		}

		return cleanRule as unknown as CSSLink;
	});

	await pluginInstance.saveData(settingsClone);
}

