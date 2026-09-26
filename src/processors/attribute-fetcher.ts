// processors/attribute-fetcher

import { App, getAllTags, TFile } from "obsidian";
import { buildCacheKey, cleanAttributeKey, normalizeCachePath, parseSpaceSeparatedTokens } from "../utils/shared-utils";
import ResuperchargedLinks from "../core/main";

export type AttrCache = Map<string, Record<string, string>>;

interface DataviewAPI {
	page(path: string): Record<string, unknown> | null;
}

interface InternalPluginRegistry {
	plugins: {
		dataview?: {
			enabled?: boolean;
			api?: DataviewAPI;
		};
	};
}

let cachedDvApi: DataviewAPI | null = null;

/**
 * Safely resolves and caches the Dataview global API instance via decoupled internal registry queries.
 */
function getDataviewApi(app: App): DataviewAPI | null {
	if (cachedDvApi !== null) return cachedDvApi;
	
	const internalPlugins: InternalPluginRegistry = (app as unknown as { plugins: InternalPluginRegistry }).plugins;
	if (internalPlugins === null) return null;

	const dv = internalPlugins.plugins?.dataview ?? null;
	if (dv !== null && dv.enabled && dv.api) {
		cachedDvApi = dv.api;
		return cachedDvApi;
	}
	return null;
}

/**
 * Gathers and compiles all targeted user metadata attributes synchronously from a document instance.
 * ⚡ ZERO-BLEED CORE: Generates clean, isolated property blocks unique to the structural file layout.
 */
export function fetchTargetAttributesSync(
	app: App,
	plugin: ResuperchargedLinks,
	dest: TFile,
	addDataHref: boolean
): Record<string, string> {
	const newProps: Record<string, string> = { tags: "" };
	
	const pluginInstance: ResuperchargedLinks | null = plugin ?? null;
	if (pluginInstance === null || !pluginInstance.settings) return newProps;

	const settings = pluginInstance.settings;
	const cache = app.metadataCache.getFileCache(dest) ?? null;
	if (cache === null) return newProps;

	const activeAttributes: Set<string> = pluginInstance.activeAttributesSet;
	const dynamicTagsList: string[] = [];

	if (cache.frontmatter !== null && cache.frontmatter !== undefined && activeAttributes.size > 0) {
		const fm = cache.frontmatter as Record<string, unknown>;
		
		for (const attribute of activeAttributes) {
			const value: unknown = fm[attribute] ?? null;
			if (value === null) continue;

			if (attribute === "tag" || attribute === "tags") {
				const frontmatterTags: string[] = parseSpaceSeparatedTokens(String(value));
				const fmTagsLen = frontmatterTags.length;
				for (let j = 0; j < fmTagsLen; j++) {
					const t: string | null = frontmatterTags[j] ?? null;
					if (t !== null && t.length > 0) {
						dynamicTagsList.push(t);
					}
				}
			} else {
				newProps[attribute] = String(value);
			}
		}
	}

	const allTags: string[] = getAllTags(cache) ?? [];
	const allTagsLen = allTags.length;
	for (let j = 0; j < allTagsLen; j++) {
		const rawTagNode: string | null = allTags[j] ?? null;
		if (rawTagNode !== null) {
			const cacheTags: string[] = parseSpaceSeparatedTokens(rawTagNode);
			const cacheTagsLen = cacheTags.length;
			for (let k = 0; k < cacheTagsLen; k++) {
				const cleanCacheTag: string | null = cacheTags[k] ?? null;
				if (cleanCacheTag !== null && cleanCacheTag.length > 0) {
					dynamicTagsList.push(cleanCacheTag);
				}
			}
		}
	}

	if (dynamicTagsList.length > 0) {
		newProps.tags = Array.from(new Set(dynamicTagsList)).join(" ");
	}

	if (addDataHref) {
		newProps["data-href"] = dest.basename;
	}
	newProps.path = dest.path;

	if (settings.getFromInlineField) {
		const api: DataviewAPI | null = getDataviewApi(app);
		if (api !== null) {
			const page: Record<string, unknown> | null = api.page(dest.path) ?? null;
			if (page !== null) {
				for (const field of activeAttributes) {
					const value: unknown = page[field] ?? null;
					if (value !== null) {
						newProps[field] = String(value);
					}
				}
			}
		}
	}

	const hyphenatedProps: Record<string, string> = {};
	for (const [key, value] of Object.entries(newProps)) {
		const cleanKey: string = cleanAttributeKey(key);
		if (cleanKey.length > 0) {
			hyphenatedProps[cleanKey] = value;
		}
	}

	return hyphenatedProps;
}

export function fetchTargetAttributesCached(
	app: App,
	plugin: ResuperchargedLinks,
	dest: TFile,
	addDataHref: boolean,
	cache: AttrCache
): Record<string, string> {
	const ruleConfigVersion: number = typeof plugin.getRuleConfigVersion === "function" ? plugin.getRuleConfigVersion() : 0;
	
	// Enforce strict canonical lowercased path indexing across all retrieval layers
	const normalizedPath: string = normalizeCachePath(dest.path);
	const newKey: string = buildCacheKey(ruleConfigVersion, normalizedPath, addDataHref);
	
	const hit: Record<string, string> | null = cache.get(newKey) ?? null;

	if (hit !== null) {
		if (plugin.telemetry !== null) {
			// Trigger the dedicated canonical verification pulse tracking channel
			if (typeof (plugin.telemetry as unknown as Record<string, unknown>).logCanonicalHit === "function") {
				(plugin.telemetry as unknown as { logCanonicalHit(): void }).logCanonicalHit();
			} else {
				plugin.telemetry.logHit();
			}
		}
		plugin.touchAttrCacheKey(newKey);
		return hit;
	}

	if (plugin.telemetry !== null) {
		plugin.telemetry.logMiss();
	}

	const resolved: Record<string, string> = fetchTargetAttributesSync(app, plugin, dest, addDataHref);
	
	// Commit exclusively to the clean canonical cache key allocation layer
	cache.set(newKey, resolved);
	
	plugin.touchAttrCacheKey(newKey);
	if (plugin.cacheManager !== null) {
		plugin.cacheManager.registerIndexedKey(normalizedPath, newKey);
	}

	return resolved;
}




