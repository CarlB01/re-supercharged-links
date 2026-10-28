import { App, getAllTags, TFile } from "obsidian";
import { cleanAttributeKey, normalizeCachePath, parseSpaceSeparatedTokens } from "../utils/shared-utils";
import ResuperchargedLinks from "../core/main";
import { DataviewAPI, getDataviewApiInstance } from "../utils/obsidian-adapters";

export type AttrCache = Map<string, Record<string, string>>;

let cachedDvApi: DataviewAPI | null = null;

/**
 * Safely resolves, caches, and validates the Dataview global API instance.
 */
function getDataviewApi(app: App): DataviewAPI | null {
	const liveApi: DataviewAPI | null = getDataviewApiInstance(app);
	
	if (liveApi === null) {
		cachedDvApi = null;
		return null;
	}

	if (cachedDvApi !== null && cachedDvApi === liveApi) {
		return cachedDvApi;
	}

	cachedDvApi = liveApi;
	return cachedDvApi;
}

/**
 * Gathers and compiles all targeted user metadata attributes synchronously from a document instance.
 * Optimized with extreme mechanical sympathy for V8 engine execution and zero internal array allocation.
 */
export function fetchTargetAttributesSync(
	app: App,
	plugin: ResuperchargedLinks,
	dest: TFile,
	addDataHref: boolean
): Record<string, string> {
	const rawProps: Record<string, string> = Object.create(null) as Record<string, string>;
	
	const pluginInstance: ResuperchargedLinks | null = plugin ?? null;
	if (pluginInstance === null || !pluginInstance.settings) return rawProps;

	const settings = pluginInstance.settings;
	const cache = app.metadataCache.getFileCache(dest) ?? null;
	if (cache === null) return rawProps;

	const activeAttributes: string[] = pluginInstance.activeAttributesArray;
	const activeAttrsLen = activeAttributes.length;
	
	// 🔥 Pre-allokert indeks-tracker på stakken (ingen heap-allokering) for å unngå Object.keys()
	// Størrelsen er maksimalt antall overvåkede attributter
	const foundKeys: string[] = []; 
	let foundKeysCount = 0;

	let compiledTags = "";
	const seenTagsSet: Set<string> = new Set<string>();

	// 1. Frontmatter
	if (cache.frontmatter !== null && cache.frontmatter !== undefined && activeAttrsLen > 0) {
		const fm = cache.frontmatter as Record<string, unknown>;
		
		for (let i = 0; i < activeAttrsLen; i++) {
			const attribute = activeAttributes[i];
			if (attribute === undefined) continue;

			const value: unknown = fm[attribute] ?? null;
			if (value === null) continue;

			if (attribute === "tag" || attribute === "tags") {
				const frontmatterTags: string[] = parseSpaceSeparatedTokens(String(value));
				const fmTagsLen = frontmatterTags.length;
				for (let j = 0; j < fmTagsLen; j++) {
					const t: string | null = frontmatterTags[j] ?? null;
					if (t !== null && t.length > 0 && !seenTagsSet.has(t)) {
						seenTagsSet.add(t);
						compiledTags += (compiledTags.length === 0 ? "" : " ") + t;
					}
				}
			} else {
				rawProps[attribute] = String(value);
				// Registrer at denne nøkkelen faktisk eksisterer på objektet
				foundKeys[foundKeysCount++] = attribute;
			}
		}
	}

	// 2. Native Obsidian Tags
	const allTags: string[] = getAllTags(cache) ?? [];
	const allTagsLen = allTags.length;
	for (let j = 0; j < allTagsLen; j++) {
		const rawTagNode: string | null = allTags[j] ?? null;
		if (rawTagNode !== null) {
			const cacheTags: string[] = parseSpaceSeparatedTokens(rawTagNode);
			const cacheTagsLen = cacheTags.length;
			for (let k = 0; k < cacheTagsLen; k++) {
				const cleanCacheTag: string | null = cacheTags[k] ?? null;
				if (cleanCacheTag !== null && cleanCacheTag.length > 0 && !seenTagsSet.has(cleanCacheTag)) {
					seenTagsSet.add(cleanCacheTag);
					compiledTags += (compiledTags.length === 0 ? "" : " ") + cleanCacheTag;
				}
			}
		}
	}

	// Faste strukturer som vi vet formen på
	if (compiledTags.length > 0) rawProps.tags = compiledTags;
	if (addDataHref) rawProps["data-href"] = dest.basename;
	rawProps.path = dest.path;

	// 3. Dataview Inline
	if (settings.getFromInlineField) {
		const api: DataviewAPI | null = getDataviewApi(app);
		if (api !== null) {
			const page: Record<string, unknown> | null = api.page(dest.path) ?? null;
			if (page !== null) {
				for (let i = 0; i < activeAttrsLen; i++) {
					const field = activeAttributes[i];
					if (field === undefined) continue;

					// Unngå dobbeltlagring hvis feltet allerede ble plukket opp i frontmatter
					if (rawProps[field] !== undefined) continue;

					const value: unknown = page[field] ?? null;
					if (value !== null) {
						rawProps[field] = String(value);
						foundKeys[foundKeysCount++] = field;
					}
				}
			}
		}
	}

	// 4. 🔥 HIGH-PERFORMANCE FLATTENING USING POPULATED INDEX ONLY
	// Vi oppretter et rent objekt uten prototype for maksimal V8 O(1) lookup-hastighet
	const hyphenatedProps: Record<string, string> = Object.create(null) as Record<string, string>;

	// Først: Prosesser KUN de dynamiske nøklene vi vet vi faktisk har funnet
	for (let i = 0; i < foundKeysCount; i++) {
		const key = foundKeys[i];
		if (key !== undefined) {
			const value = rawProps[key];
			if (value !== undefined) {
				const cleanKey: string = cleanAttributeKey(key);
				if (cleanKey.length > 0) {
					hyphenatedProps[cleanKey] = value;
				}
			}
		}
	}

	// Deretter: Dytt inn de faste feltene direkte (V8 elsker faste feltbaner)
	if (rawProps.tags !== undefined) hyphenatedProps.tags = rawProps.tags;
	if (rawProps["data-href"] !== undefined) hyphenatedProps["data-href"] = rawProps["data-href"];
	hyphenatedProps.path = rawProps.path; // Alltid definert

	return hyphenatedProps;
}


export function fetchTargetAttributesCached(
	app: App,
	plugin: ResuperchargedLinks,
	dest: TFile,
	cache: AttrCache 
): Record<string, string> {
	const ruleConfigVersion: number = typeof plugin.getRuleConfigVersion === "function" ? plugin.getRuleConfigVersion() : 0;
	const normalizedPath: string = normalizeCachePath(dest.path);
	
	// Pure file tracking independent of layout context
	const cleanKey: string = `${ruleConfigVersion}-${normalizedPath}`;
	
	const hit: Record<string, string> | null = cache.get(cleanKey) ?? null;

	if (hit !== null) {
		const tracker = plugin.telemetry;
		if (tracker !== null) {
			tracker.logHit();
		}
		plugin.touchAttrCacheKey(cleanKey);
		return hit;
	}

	const tracker = plugin.telemetry;
	if (tracker !== null) {
		tracker.logMiss();
	}

	// Fetch pure metadata (always call sync without addDataHref payload inside)
	const resolved: Record<string, string> = fetchTargetAttributesSync(app, plugin, dest, false);
	
	cache.set(cleanKey, resolved);
	plugin.touchAttrCacheKey(cleanKey);
	
	if (plugin.cacheManager !== null) {
		plugin.cacheManager.registerIndexedKey(normalizedPath, cleanKey);
	}

	return resolved;
}
