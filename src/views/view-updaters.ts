import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import ResuperchargedLinks from "../main";
import { isHtmlElement } from "../utils/string-utils";
import { fetchTargetAttributesSync, fetchTargetAttributesCached, AttrCache } from "../processors/attribute-fetcher";
import { setLinkNewProps, clearExtraAttributes, tagChipStyles } from "../processors/link-mutator";

// 🔑 OBSIDIAN-GODKJENT: Frittstående kontrakter som ikke prøver å arve direkte fra låste klasser
interface ObsidianViewMetadataInternal {
	metadataEditor?: {
		contentEl?: HTMLElement;
	};
}

interface ObsidianLeafHeaderInternal {
	tabHeaderInnerTitleEl?: HTMLElement;
}


function isHtmlInputElement(value: unknown): value is HTMLInputElement {
	return value instanceof HTMLInputElement;
}

function getNestedChild(root: Element | null | undefined, path: number[]): Element | null {
	let cur: Element | null = root ?? null;
	for (const idx of path) {
		cur = cur?.children.item(idx) ?? null;
		if (cur === null) return null;
	}
	return cur;
}

export function updateContainer(container: HTMLElement, plugin: ResuperchargedLinks, selector: string, filterCollapsible = false): void {
	if (!container || typeof container.findAll !== "function") return;
	
	const dataType = container.getAttribute("data-type");
	if (!plugin.settings.enableBacklinks && dataType !== "file-explorer") return;
	if (!plugin.settings.enableFileList && dataType === "file-explorer") return;

	if (plugin.settings.enableTagChips) {
		tagChipStyles(container, plugin);
	}

	const nodes = container.findAll(selector);
	if (nodes.length === 0) return;

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (isHtmlElement(node)) {
			updateDivExtraAttributes(plugin.app, plugin, node, "", null, filterCollapsible);
		}
	}
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
	if (filterCollapsible && parent && parent.classList.contains("mod-collapsible")) return;

	let resolvedLinkName = linkName;
	if (!resolvedLinkName) {
		if (parent) {
			resolvedLinkName = parent.getAttribute("data-path") || parent.getAttribute("data-href") || parent.getAttribute("href");
		}
		if (!resolvedLinkName) {
			resolvedLinkName = link.getAttribute("data-href") || link.getAttribute("href") || link.textContent || "";
		}
	}

	if (!resolvedLinkName) return;

	const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(resolvedLinkName), destName);
	if (!dest) return;

	const newProps = fetchTargetAttributesSync(app, plugin, dest, true);
	setLinkNewProps(link, newProps, plugin);
}

export function updateElLinks(app: App, plugin: ResuperchargedLinks, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
	const attrCache: AttrCache = new Map();
	const links = el.querySelectorAll("a.internal-link");
	const destName = ctx.sourcePath.replace(/(.*)\.md$/, "$1");

	links.forEach((node) => {
		if (!isHtmlElement(node)) return;
		
		const hrefAttr = node.getAttribute("href");
		if (!hrefAttr) return; // Hopper over hvis lenken mangler href-attributt

		const parts = hrefAttr.split("#");
		const linkHref = parts[0];
		
		// 🔑 TYPESIKKER GUARD: Avbryt tidlig hvis linken er tom eller undefined.
		// Dette garanterer overfor TypeScript at linkHref er en 100% gyldig streng!
		if (!linkHref) return;

		const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName);
		if (!dest) return;

		const newProps = fetchTargetAttributesCached(app, plugin, dest, false, attrCache);
		setLinkNewProps(node, newProps, plugin);
	});
}


function resolvePropertyTarget(frontmatter: Record<string, unknown>, key: string, linkText: string): string | null {
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
			if (typeof entry === "string") {
				const hit = matchWikilink(entry);
				if (hit) return hit;
			}
		}
		return null;
	}

	return typeof rawVal === "string" ? matchWikilink(rawVal) : null;
}

export function updatePropertiesPane(propertiesEl: HTMLElement, file: TFile, app: App, plugin: ResuperchargedLinks): void {
	const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter;
	if (!frontmatter) return;

	const pills = propertiesEl.querySelectorAll("div.multi-select-pill-content");
	pills.forEach((node) => {
		if (!isHtmlElement(node)) return;
		const text = node.textContent;
		if (!text) return;

		const inputCandidate = getNestedChild(node.parentElement?.parentElement?.parentElement?.parentElement, [0, 1]);
		if (!isHtmlInputElement(inputCandidate) || !inputCandidate.value) return;

		const resolvedTarget = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
		if (resolvedTarget) {
			updateDivExtraAttributes(plugin.app, plugin, node, "", resolvedTarget);
		}
	});

	const singleLinks = propertiesEl.querySelectorAll("div.metadata-link-inner");
	singleLinks.forEach((node) => {
		if (!isHtmlElement(node)) return;
		const text = node.textContent;
		if (!text) return;

		const inputCandidate = getNestedChild(node.parentElement?.parentElement?.parentElement, [0, 1]);
		if (!isHtmlInputElement(inputCandidate) || !inputCandidate.value) return;

		const resolvedTarget = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
		if (resolvedTarget) {
			updateDivExtraAttributes(plugin.app, plugin, node, "", resolvedTarget);
		}
	});
}

export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks): void {
	const settings = plugin.settings;
	const attrCache: AttrCache = plugin.attrCycleCache;

	app.workspace.iterateRootLeaves((leaf) => {
		if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;

		const file = leaf.view.file;
		const cachedFile = app.metadataCache.getFileCache(file);

		// 🔑 FIKSET TYPESIKKERHET: Cast viewet via unknown til vår interne kontrakt i stedet for any
		let metadataPane: HTMLElement | null = null;
		const internalView = leaf.view as unknown as ObsidianViewMetadataInternal;
		if (internalView.metadataEditor?.contentEl instanceof HTMLElement) {
			metadataPane = internalView.metadataEditor.contentEl;
		}

		if (metadataPane) {
			updatePropertiesPane(metadataPane, file, app, plugin);
		}

		// 🔑 FIKSET TYPESIKKERHET: Gjør det samme med tab-headeren på leaf-objektet
		let tabHeader: HTMLElement | null = null;
		const internalLeaf = leaf as unknown as ObsidianLeafHeaderInternal;
		if (internalLeaf.tabHeaderInnerTitleEl instanceof HTMLElement) {
			tabHeader = internalLeaf.tabHeaderInnerTitleEl;
		}

		if (tabHeader) {
			if (settings.enableTabHeader) {
				updateDivExtraAttributes(app, plugin, tabHeader, "", file.path);
			} else {
				clearExtraAttributes(tabHeader);
			}
		}

		cachedFile?.links?.forEach((link) => {
			const fileName = file.path.replace(/(.*)\.md$/, "$1");
			const dest = app.metadataCache.getFirstLinkpathDest(link.link, fileName);
			if (!dest) return;

			const newProps = fetchTargetAttributesCached(app, plugin, dest, false, attrCache);
			const escapedHref = CSS.escape(link.link);
			const internalLinks = leaf.view.containerEl.querySelectorAll(`a.internal-link[href="${escapedHref}"]`);

			internalLinks.forEach((node) => {
				if (isHtmlElement(node)) {
					setLinkNewProps(node, newProps, plugin);
				}
			});
		});
	});
}

