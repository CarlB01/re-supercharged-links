import { App, getAllTags, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { cleanAttributeKey, parseSpaceSeparatedTokens } from "../utils/string-utils";

export type AttrCache = Map<string, Record<string, string>>;

interface DataviewAPI {
	page(path: string): Record<string, unknown> | undefined;
}

interface InternalPluginRegistry {
	plugins?: {
		dataview?: {
			enabled?: boolean;
			api?: DataviewAPI;
		};
	};
}

let cachedDvApi: DataviewAPI | null = null;

function getDataviewApi(app: App): DataviewAPI | null {
	if (cachedDvApi !== null) return cachedDvApi;
	
	const internalPlugins: InternalPluginRegistry = (app as unknown as { plugins: InternalPluginRegistry }).plugins ?? {};
	const dv = internalPlugins.plugins?.dataview ?? null;
	
	if (dv !== null && dv.enabled && dv.api) {
		cachedDvApi = dv.api;
		return cachedDvApi;
	}
	return null;
}

/**
 * Gathers and compiles all targeted user metadata attributes synchronously from a document instance.
 * STRICT PROTOCOL: Zero implicit indices or overlapping loop counters to isolate execution threads completely.
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

	const activeAttributes: Set<string> = pluginInstance.activeAttributesSet ?? new Set<string>();
	const dynamicTagsList: string[] = [];

	// 1. Extract structural Frontmatter block fields safely
	if (cache.frontmatter && activeAttributes.size > 0) {
		const fm: Record<string, unknown> = cache.frontmatter as Record<string, unknown>;
		for (const attribute of activeAttributes) {
			const value: unknown = fm[attribute] ?? null;
			if (value === null) continue;

			if (attribute === "tag" || attribute === "tags") {
				const frontmatterTags: string[] = parseSpaceSeparatedTokens(String(value));
				for (let j: number = 0; j < frontmatterTags.length; j++) {
					const t: string | null = frontmatterTags[j] ?? null;
					if (t !== null) dynamicTagsList.push(t);
				}
			} else {
				newProps[attribute] = String(value);
			}
		}
	}

	// 2. Map standard indexed tag cache tokens seamlessly
	if (settings.targetTags) {
		const allTags: string[] = getAllTags(cache) ?? [];
		for (let j: number = 0; j < allTags.length; j++) {
			const rawTagNode: string | null = allTags[j] ?? null;
			if (rawTagNode !== null) {
				const cacheTags: string[] = parseSpaceSeparatedTokens(rawTagNode);
				// 🔑 STRICT PROTOCOL FIX: Explicit iterator isolation ('k') maps limits perfectly to 'cacheTags'
				for (let k: number = 0; k < cacheTags.length; k++) {
					const cleanCacheTag: string | null = cacheTags[k] ?? null;
					if (cleanCacheTag !== null) {
						dynamicTagsList.push(cleanCacheTag);
					}
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

	// 3. Parse experimental third-party Dataview inline nodes fully typesafe
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

	// 4. Flatten arrays and keys into hyphenated properties using the global cleaner hook
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
	const key: string = `${dest.path}::${addDataHref ? "1" : "0"}`;
	const hit: Record<string, string> | null = cache.get(key) ?? null;
	if (hit !== null) return hit;

	const resolved: Record<string, string> = fetchTargetAttributesSync(app, plugin, dest, addDataHref);
	cache.set(key, resolved);
	return resolved;
}
