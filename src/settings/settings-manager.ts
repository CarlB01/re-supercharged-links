import { Plugin } from "obsidian";
import { SCLSettings, DEFAULT_SETTINGS } from "./settings";
import { CSSLink } from "../types/css-link";
import { sanitizeRuleset } from "../processors/rule-sanitizer";
import { cloneSettingsObject } from "../utils/string-utils";

/**
 * 🔑 CONDUIT PROPERTY DICTIONARY
 * Dictionary of strict implicit parameters that under no circumstance belong inside individual rule objects.
 */
const GARBAGE_PROPERTIES: Record<string, string | boolean | unknown[]> = {
	name: "",
	value: "",
	iconBefore: "",
	iconAfter: "",
	fontWeight: "normal",
	fontStyle: "normal",
	lightColor: "",
	darkColor: "",
	lightBgColor: "transparent",
	darkBgColor: "transparent",
	selectText: [true, false],
	selectAppend: [true, false],
	selectPrepend: [true, false],
	selectBackground: [true, false]
};

/**
 * 🔑 GLOBAL ROOT GARBAGE REGISTER
 * One single truth array containing all obsolete legacy root keys slated for absolute eviction.
 * ⚡ CENTRALIZED: Adding any future obsolete root-level keys here scrubs them in both directions.
 */
const GLOBAL_ROOT_GARBAGE_KEYS: readonly string[] = [
	"targetTags", 
	"activateSnippet", 
	"enableTabHeader", 
	"enableEditor", 
	"enableFileList", 
	"enableBacklinks", 
	"enableQuickSwitcher", 
	"enableSuggestor", 
	"enableBases", 
	"targetAttributes" // Unified blueprint tracking register
];

/**
 * 🚀 RUNTIME INGESTION CLEANER (v1.1.0)
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

	// ⚡ CENTRALIZED ROOT PURGE (Ingestion): Instantly evicts obsolete root parameters from RAM
	for (let i = 0; i < GLOBAL_ROOT_GARBAGE_KEYS.length; i++) {
		const garbageKey = GLOBAL_ROOT_GARBAGE_KEYS[i];
		if (garbageKey !== undefined && dataProxy[garbageKey] !== undefined) {
			delete dataProxy[garbageKey];
			dataRepaired = true;
		}
	}

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

	const sanitizedSelectors: Record<string, unknown>[] = [];
	for (let i: number = 0; i < selectorsArray.length; i++) {
		const rawRule: Record<string, unknown> | null = selectorsArray[i] ?? null;
		if (rawRule === null) continue;

		const cleanRule: Record<string, unknown> = { ...rawRule };

		for (const [key, garbageTarget] of Object.entries(GARBAGE_PROPERTIES)) {
			if (cleanRule[key] !== undefined) {
				const currentValue = cleanRule[key];
				const isGarbage = Array.isArray(garbageTarget)
					? garbageTarget.includes(currentValue)
					: String(currentValue ?? "") === String(garbageTarget);

				if (isGarbage) {
					delete cleanRule[key];
					dataRepaired = true;
				}
			}
		}

		if (cleanRule["matchCaseSensitive"] === false) {
			delete cleanRule["matchCaseSensitive"];
			dataRepaired = true;
		}

		// 🔑 THE ATOMIC PURGE: Strip individual rule unique IDs uconditionally during boot
		if (cleanRule["uid"] !== undefined) {
			delete cleanRule["uid"];
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
 * 🔑 PRISTINE DATA STORAGE ENGINE (v1.1.0)
 */
export async function saveStrippedSettings(plugin: Plugin, settings: SCLSettings): Promise<void> {
	const pluginInstance: Plugin | null = plugin ?? null;
	if (pluginInstance === null) return;

	const settingsClone: SCLSettings = cloneSettingsObject(settings);
	
	// ⚡ CENTRALIZED ROOT PURGE (Egress): Strips explicit defaults before JSON disk serialization
	const rawSettingsProxy = settingsClone as unknown as Record<string, unknown>;
	for (let i = 0; i < GLOBAL_ROOT_GARBAGE_KEYS.length; i++) {
		const garbageKey = GLOBAL_ROOT_GARBAGE_KEYS[i];
		if (garbageKey !== undefined && rawSettingsProxy[garbageKey] !== undefined) {
			delete rawSettingsProxy[garbageKey];
		}
	}

	const rawSelectors: CSSLink[] = settingsClone.selectors ?? [];
	const strippedSelectors: CSSLink[] = [];

	for (let i: number = 0; i < rawSelectors.length; i++) {
		const rule: CSSLink | null = rawSelectors[i] ?? null;
		if (rule === null) continue;

		const cleanRule: Record<string, unknown> = { ...(rule as unknown as Record<string, unknown>) };

		for (const [key, garbageTarget] of Object.entries(GARBAGE_PROPERTIES)) {
			if (cleanRule[key] !== undefined) {
				const currentValue = cleanRule[key];
				const isGarbage = Array.isArray(garbageTarget)
					? garbageTarget.includes(currentValue)
					: String(currentValue ?? "") === String(garbageTarget);

				if (isGarbage) {
					delete cleanRule[key];
				}
			}
		}

		if ("match" in cleanRule) {
			delete cleanRule["match"];
		}

		if (cleanRule["matchCaseSensitive"] === false) {
			delete cleanRule["matchCaseSensitive"];
		}

		// 🔑 THE ATOMIC PURGE: Ensure no legacy active rule UIDs leak onto the hard drive configuration files
		if ("uid" in cleanRule) {
			delete cleanRule["uid"];
		}

		strippedSelectors.push(cleanRule as unknown as CSSLink);
	}

	settingsClone.selectors = strippedSelectors;
	await pluginInstance.saveData(settingsClone);
}
