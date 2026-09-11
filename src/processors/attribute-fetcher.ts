import { App, getAllTags, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { processKey } from "../utils/string-utils";

export type AttrCache = Map<string, Record<string, string>>;

/**
 * Explicit contract for the external Dataview API endpoints.
 */
interface DataviewAPI {
	page(path: string): Record<string, unknown> | undefined;
}

/**
 * Isolated structural model for Obsidian's hidden third-party plugin registry tree.
 */
interface InternalPluginRegistry {
	plugins?: {
		dataview?: {
			enabled?: boolean;
			api?: DataviewAPI;
		};
	};
}

let cachedDvApi: DataviewAPI | null = null;

/**
 * Safe accessor targeting the Dataview infrastructure without global runtime hazards.
 */
function getDataviewApi(app: App): DataviewAPI | null {
	if (cachedDvApi) return cachedDvApi;
	
	// Secure structural casting mapping via unknown to bypass native App object seal restrictions
	const internalPlugins = (app as unknown as { plugins: InternalPluginRegistry }).plugins;
	const dv = internalPlugins.plugins?.dataview;
	
	if (dv && dv.enabled && dv.api) {
		cachedDvApi = dv.api;
		return cachedDvApi;
	}
	return null;
}

/**
 * Gathers and compiles all targeted user metadata attributes synchronously from a document instance.
 */
export function fetchTargetAttributesSync(
	app: App,
	plugin: ResuperchargedLinks,
	dest: TFile,
	addDataHref: boolean
): Record<string, string> {
	const newProps: Record<string, string> = { tags: "" };
	if (!plugin?.settings) return newProps;

	const settings = plugin.settings;
	const cache = app.metadataCache.getFileCache(dest);
	if (!cache) return newProps;

	const activeAttributes = plugin.activeAttributesSet;

	// 1. Extract structural Frontmatter block fields
	if (cache.frontmatter && activeAttributes.size > 0) {
		const fm = cache.frontmatter as Record<string, unknown>;
		for (const attribute of activeAttributes) {
			const value = fm[attribute];
			if (value === null || value === undefined) continue;

			if (attribute === "tag" || attribute === "tags") {
				newProps.tags += (newProps.tags ? " " : "") + String(value);
			} else {
				newProps[attribute] = String(value);
			}
		}
	}

	// 2. Map standard indexed tag cache tokens
	if (settings.targetTags) {
		const allTags = getAllTags(cache);
		if (allTags && allTags.length > 0) {
			newProps.tags += (newProps.tags ? " " : "") + allTags.join(" ");
		}
	}

	if (addDataHref) newProps["data-href"] = dest.basename;
	newProps.path = dest.path;

	// 3. Parse experimental third-party Dataview inline nodes fully typesafe
	if (settings.getFromInlineField) {
		const api = getDataviewApi(app);
		if (api) {
			const page = api.page(dest.path);
			if (page) {
				for (const field of activeAttributes) {
					const value = page[field];
					if (value !== null && value !== undefined) {
						newProps[field] = String(value);
					}
				}
			}
		}
	}

	// 4. Flatten arrays and keys into hyphenated properties strings contextually
	const hyphenatedProps: Record<string, string> = {};
	for (const [key, value] of Object.entries(newProps)) {
		hyphenatedProps[processKey(key)] = value;
	}

	return hyphenatedProps;
}

/**
 * High-performance transaction cache boundary routing requests safely.
 */
export function fetchTargetAttributesCached(
	app: App,
	plugin: ResuperchargedLinks,
	dest: TFile,
	addDataHref: boolean,
	cache: AttrCache
): Record<string, string> {
	const key = `${dest.path}::${addDataHref ? "1" : "0"}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const resolved = fetchTargetAttributesSync(app, plugin, dest, addDataHref);
	cache.set(key, resolved);
	return resolved;
}
