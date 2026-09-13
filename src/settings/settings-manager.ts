import { Plugin } from "obsidian";
import { SCLSettings, DEFAULT_SETTINGS } from "./settings";
import { CSSLink } from "../types/css-link";
import { sanitizeRuleset } from "../processors/rule-sanitizer";
import { cloneSettingsObject } from "../utils/string-utils";

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

	const loadedData: unknown = await pluginInstance.loadData();
	const dataProxy: Record<string, unknown> = typeof loadedData === "object" && loadedData !== null 
		? (loadedData as Record<string, unknown>) 
		: {};
	
	let dataRepaired: boolean = loadedData === null;

	const rawSelectors: unknown = dataProxy["selectors"] ?? null;
	let selectorsArray: Record<string, unknown>[] = [];

	if (Array.isArray(rawSelectors)) {
		for (let i: number = 0; i < rawSelectors.length; i++) {
			const item: unknown = rawSelectors[i] ?? null;
			if (typeof item === "object" && item !== null) {
				selectorsArray.push(item as Record<string, unknown>);
			} else {
				dataRepaired = true;
			}
		}
	} else {
		dataRepaired = true;
	}

	// Clean up explicit blanks and structural defaults from the ingestion matrix
	const sanitizedSelectors: Record<string, unknown>[] = [];
	for (let i: number = 0; i < selectorsArray.length; i++) {
		const rawRule: Record<string, unknown> | null = selectorsArray[i] ?? null;
		if (rawRule === null) continue;

		const cleanRule: Record<string, unknown> = { ...rawRule };

		for (const [key, garbageValue] of Object.entries(GARBAGE_PROPERTIES)) {
			if (String(cleanRule[key] ?? "") === garbageValue) {
				delete cleanRule[key];
				dataRepaired = true;
			}
		}

		if (cleanRule["matchCaseSensitive"] === false) {
			delete cleanRule["matchCaseSensitive"];
			dataRepaired = true;
		}

		sanitizedSelectors.push(cleanRule);
	}

	dataProxy["selectors"] = sanitizedSelectors;

	const mergedSettings: SCLSettings = Object.assign({}, DEFAULT_SETTINGS, dataProxy);
	const selectorsList: CSSLink[] = mergedSettings.selectors ?? [];
	
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
 */
export async function saveStrippedSettings(plugin: Plugin, settings: SCLSettings): Promise<void> {
	const pluginInstance: Plugin | null = plugin ?? null;
	if (pluginInstance === null) return;

	const settingsClone: SCLSettings = cloneSettingsObject(settings);
	const rawSelectors: CSSLink[] = settingsClone.selectors ?? [];

	const strippedSelectors: CSSLink[] = [];
	for (let i: number = 0; i < rawSelectors.length; i++) {
		const rule: CSSLink | null = rawSelectors[i] ?? null;
		if (rule === null) continue;

		const cleanRule: Record<string, unknown> = { ...(rule as unknown as Record<string, unknown>) };

		for (const [key, defaultValue] of Object.entries(GARBAGE_PROPERTIES)) {
			if (String(cleanRule[key] ?? "") === defaultValue) {
				delete cleanRule[key];
			}
		}

		if ("match" in cleanRule) {
			delete cleanRule["match"];
		}

		if (cleanRule["matchCaseSensitive"] === false) {
			delete cleanRule["matchCaseSensitive"];
		}

		strippedSelectors.push(cleanRule as unknown as CSSLink);
	}

	settingsClone.selectors = strippedSelectors;
	await pluginInstance.saveData(settingsClone);
}
