import { App, getAllTags, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { processKey } from "../utils/string-utils";

export type AttrCache = Map<string, Record<string, string>>;

let cachedDvApi: any = null;

function getDataviewApi(app: App): any {
	if (cachedDvApi) return cachedDvApi;
	const dv = (app as any).plugins?.plugins?.dataview;
	if (dv && dv.enabled) {
		cachedDvApi = dv.api;
		return cachedDvApi;
	}
	return null;
}

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

	// 1. Frontmatter extraction loop
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

	// 2. Token tag extraction cache bridge
	if (settings.targetTags) {
		const allTags = getAllTags(cache);
		if (allTags && allTags.length > 0) {
			newProps.tags += (newProps.tags ? " " : "") + allTags.join(" ");
		}
	}

	if (addDataHref) newProps["data-href"] = dest.basename;
	newProps.path = dest.path;

	// 3. Dataview Inline Fields parsing pipeline
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

	// 4. Map values into clean hyphenated CSS-ready string structures
	const hyphenatedProps: Record<string, string> = {};
	for (const [key, value] of Object.entries(newProps)) {
		hyphenatedProps[processKey(key)] = value;
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
	const key = `${dest.path}::${addDataHref ? "1" : "0"}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const resolved = fetchTargetAttributesSync(app, plugin, dest, addDataHref);
	cache.set(key, resolved);
	return resolved;
}
