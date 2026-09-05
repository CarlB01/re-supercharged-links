import {
	App,
	getAllTags,
	getLinkpath,
	LinkCache,
	MarkdownPostProcessorContext,
	MarkdownView,
	TFile
} from "obsidian";
import ResuperchargedLinks from "./main";

interface DataviewAPI {
	page(path: string): Record<string, unknown> | undefined;
}

type DataviewPluginContainer = {
	enabledPlugins?: Set<string>;
	plugins?: {
		dataview?: {
			api?: DataviewAPI;
		};
	};
};

type MetadataEditorLike = {
	contentEl?: HTMLElement;
};

type LeafWithOptionalTabHeader = {
	tabHeaderInnerTitleEl?: HTMLElement;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function isHtmlInputElement(value: unknown): value is HTMLInputElement {
	return value instanceof HTMLInputElement;
}

function isMetadataEditorLike(value: unknown): value is MetadataEditorLike {
	if (typeof value !== "object" || value === null) return false;
	const rec = value as Record<string, unknown>;
	return rec.contentEl === undefined || rec.contentEl instanceof HTMLElement;
}

function hasMetadataEditor(value: unknown): value is { metadataEditor?: MetadataEditorLike } {
	if (typeof value !== "object" || value === null) return false;
	const rec = value as Record<string, unknown>;
	return rec.metadataEditor === undefined || isMetadataEditorLike(rec.metadataEditor);
}

function hasTabHeaderInnerTitleEl(value: unknown): value is LeafWithOptionalTabHeader {
	if (typeof value !== "object" || value === null) return false;
	const rec = value as Record<string, unknown>;
	return (
		rec.tabHeaderInnerTitleEl === undefined ||
		rec.tabHeaderInnerTitleEl instanceof HTMLElement
	);
}

function getNestedChild(
  root: Element | null | undefined,
  path: number[]
): Element | null {
  let cur: Element | null = root ?? null;

  for (const idx of path) {
    cur = cur?.children.item(idx) ?? null;
    if (cur === null) return null;
  }

  return cur;
}

function getDataviewContainer(app: App): DataviewPluginContainer | null {
	const appRec = asRecord(app);
	const pluginsRec = asRecord(appRec?.plugins);
	if (!pluginsRec) return null;

	const enabledPlugins =
		pluginsRec.enabledPlugins instanceof Set ? pluginsRec.enabledPlugins : undefined;

	const pluginsMap = asRecord(pluginsRec.plugins);
	const dataviewRec = asRecord(pluginsMap?.dataview);
	const api = dataviewRec?.api as DataviewAPI | undefined;

	return {
		enabledPlugins,
		plugins: { dataview: { api } }
	};
}

export function clearExtraAttributes(link: HTMLElement): void {
	Array.from(link.attributes).forEach((attr) => {
		if (attr.name.includes("data-link")) link.removeAttribute(attr.name);
	});
}

export function processKey(key: string): string {
	return key.replace(/ /g, "-");
}

export function processValue(key: string, value: string): string {
	if (!value) return value;
	if (key.includes("publishedIn") && value.startsWith("[[") && value.endsWith("]]")) {
		return value.slice(2, -2);
	}
	return value;
}

/**
 * 🟢 PURE LOGIC SCAVENGER: Collects properties without touching the DOM.
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

	const frontmatter = cache.frontmatter;
	const activeAttributes = plugin.activeAttributesSet;

	if (frontmatter && activeAttributes.size > 0) {
		activeAttributes.forEach((attribute) => {
			if (!Object.prototype.hasOwnProperty.call(frontmatter, attribute)) return;
			const value = frontmatter[attribute];
			if (value === null || value === undefined) return;

			if (attribute === "tag" || attribute === "tags") {
				newProps.tags += String(value);
			} else {
				newProps[attribute] = String(value);
			}
		});
	}

	if (settings.targetTags) {
		const allTags = getAllTags(cache);
		if (allTags) newProps.tags += allTags.join(" ");
	}

	if (addDataHref) newProps["data-href"] = dest.basename;
	newProps.path = dest.path;

	const dv = getDataviewContainer(app);
	const hasDataview = dv?.enabledPlugins?.has("dataview") ?? false;

	if (settings.getFromInlineField && hasDataview) {
		const api = dv?.plugins?.dataview?.api;
		const page = api?.page?.(dest.path);
		if (page) {
			activeAttributes.forEach((field) => {
				const value = page[field];
				if (value !== null && value !== undefined) {
					newProps[field] = String(value);
				}
			});
		}
	}

	const hyphenatedProps: Record<string, string> = {};
	for (const [key, value] of Object.entries(newProps)) {
		hyphenatedProps[processKey(key)] = value;
	}

	return hyphenatedProps;
}

/**
 * 🚀 BATCHED INJECTOR: Commits attributes and CSS classes in single operational cycles.
 */
function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>): void {
	Array.from(link.attributes).forEach((attr) => {
		if (
			attr.name.includes("data-link") &&
			!Object.prototype.hasOwnProperty.call(
				newProps,
				attr.name.replace("data-link-", "")
			)
		) {
			link.removeAttribute(attr.name);
		}
	});

	const cssProperties: Record<string, string> = {};

	for (const [key, propValue] of Object.entries(newProps)) {
		const domKey = processKey(key);
		const attributeName = `data-link-${domKey}`;
		const curValue = link.getAttribute(attributeName);
		const newValue = processValue(key, propValue);

		if (!newValue || curValue !== newValue) {
			link.setAttribute(attributeName, newValue);
			const variableKey = `--data-link-${domKey}`;
			if (newValue.startsWith("http") || newValue.startsWith("data:")) {
				cssProperties[variableKey] = `url(${newValue})`;
			} else {
				cssProperties[variableKey] = newValue;
			}
		}
	}

	link.setCssProps(cssProperties);
	link.addClass("data-link-icon", "data-link-icon-after", "data-link-text");
}

export function updateDivExtraAttributes(
	app: App,
	plugin: ResuperchargedLinks,
	link: HTMLElement,
	destName: string,
	linkName: string | null,
	filterCollapsible = false
): void {
	const parent = link.parentElement;
	if (filterCollapsible && parent?.className.includes("mod-collapsible")) return;

	let resolvedLinkName = linkName ?? link.textContent ?? "";

	const attributeSources = [
		parent?.getAttribute("data-path"),
		parent?.getAttribute("data-href"),
		parent?.getAttribute("href"),
		link.getAttribute("data-href"),
		link.getAttribute("href")
	];

	for (const value of attributeSources) {
		if (value) {
			resolvedLinkName = value;
			break;
		}
	}

	const dest = app.metadataCache.getFirstLinkpathDest(
		getLinkpath(resolvedLinkName),
		destName
	);

	if (!dest) return;

	const newProps = fetchTargetAttributesSync(app, plugin, dest, true);
	setLinkNewProps(link, newProps);
}

export function updateElLinks(
	app: App,
	plugin: ResuperchargedLinks,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): void {
	const links = el.querySelectorAll("a.internal-link");
	const destName = ctx.sourcePath.replace(/(.*)\.md$/, "$1");

	links.forEach((node) => {
		if (!node.instanceOf(HTMLElement)) return;
		const hrefAttr = node.getAttribute("href");
		const linkHref = hrefAttr?.split("#")[0];
		if (!linkHref) return;

		const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName);
		if (!dest) return;

		const newProps = fetchTargetAttributesSync(app, plugin, dest, false);
		setLinkNewProps(node, newProps);
	});
}

function resolvePropertyTarget(
	frontmatter: Record<string, unknown>,
	key: string,
	linkText: string
): string | null {
	const rawVal = frontmatter[key];
	if (!rawVal) return null;

	const matchWikilink = (entry: string): string | null => {
		if (entry.length <= 4 || !entry.startsWith("[[") || !entry.endsWith("]]")) return null;
		const inner = entry.slice(2, -2);
		const segments = inner.split("|");
		const target = segments[0] ?? null;
		const alias = segments[1] ?? null;

		if ((segments.length === 1 && target === linkText) || (segments.length === 2 && alias === linkText)) {
			return target;
		}
		return null;
	};

	if (Array.isArray(rawVal)) {
		for (const entry of rawVal) {
			if (typeof entry !== "string") continue;
			const hit = matchWikilink(entry);
			if (hit) return hit;
		}
		return null;
	}

	if (typeof rawVal === "string") return matchWikilink(rawVal);
	return null;
}

export function updatePropertiesPane(
	propertiesEl: HTMLElement,
	file: TFile,
	app: App,
	plugin: ResuperchargedLinks
): void {
	const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter;
	if (!frontmatter) return;

	const pills = propertiesEl.querySelectorAll("div.multi-select-pill-content");
	pills.forEach((node) => {
		const el = node as HTMLElement;
		const text = el.textContent;
		if (!text) return;

		const inputCandidate = getNestedChild(
			el.parentElement?.parentElement?.parentElement?.parentElement,
			[0, 1]
		);

		if (!isHtmlInputElement(inputCandidate) || !inputCandidate.value) return;

		const resolvedTarget = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
		if (resolvedTarget) {
			updateDivExtraAttributes(plugin.app, plugin, el, "", resolvedTarget);
		}
	});

	const singleLinks = propertiesEl.querySelectorAll("div.metadata-link-inner");
	singleLinks.forEach((node) => {
		const el = node as HTMLElement;
		const text = el.textContent;
		if (!text) return;

		const inputCandidate = getNestedChild(el.parentElement?.parentElement?.parentElement, [0, 1]);
		if (!isHtmlInputElement(inputCandidate) || !inputCandidate.value) return;

		const resolvedTarget = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
		if (resolvedTarget) {
			updateDivExtraAttributes(plugin.app, plugin, el, "", resolvedTarget);
		}
	});
}

export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks): void {
	const settings = plugin.settings;

	app.workspace.iterateRootLeaves((leaf) => {
		if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;

		const file = leaf.view.file;
		const cachedFile = app.metadataCache.getFileCache(file);

		let metadataPane: HTMLElement | null = null;
		const unknownView: unknown = leaf.view;
		if (hasMetadataEditor(unknownView) && unknownView.metadataEditor?.contentEl instanceof HTMLElement) {
			metadataPane = unknownView.metadataEditor.contentEl;
		}

		if (metadataPane) {
			updatePropertiesPane(metadataPane, file, app, plugin);
		}

		let tabHeader: HTMLElement | null = null;
		const unknownLeaf: unknown = leaf;
		if (hasTabHeaderInnerTitleEl(unknownLeaf) && unknownLeaf.tabHeaderInnerTitleEl instanceof HTMLElement) {
			tabHeader = unknownLeaf.tabHeaderInnerTitleEl;
		}

		if (tabHeader) {
			if (settings.enableTabHeader) {
				updateDivExtraAttributes(app, plugin, tabHeader, "", file.path);
			} else {
				clearExtraAttributes(tabHeader);
			}
		}

		cachedFile?.links?.forEach((link: LinkCache) => {
			const fileName = file.path.replace(/(.*)\.md$/, "$1");
			const dest = app.metadataCache.getFirstLinkpathDest(link.link, fileName);
			if (!dest) return;

			const newProps = fetchTargetAttributesSync(app, plugin, dest, false);
			const escapedHref = CSS.escape(link.link);
			const internalLinks = leaf.view.containerEl.querySelectorAll(
				`a.internal-link[href="${escapedHref}"]`
			);

			internalLinks.forEach((node) => {
				if (node.instanceOf(HTMLElement)) setLinkNewProps(node, newProps);
			});
		});
	});
}