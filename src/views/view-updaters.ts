import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { isHtmlElement, extractCleanLinkPath } from "../utils/string-utils";
import { fetchTargetAttributesSync, fetchTargetAttributesCached, AttrCache } from "../processors/attribute-fetcher";
import { setLinkNewProps, clearExtraAttributes, tagChipStyles } from "../processors/link-mutator";
import { CSSLink } from "../types/css-link";
import { findMatchingRule } from "../processors/rule-sanitizer";

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
	if (plugin.settings.enableTagChips) {
		tagChipStyles(container, plugin);
	}

	const nodes = container.findAll(selector);
	const nodesCount = nodes.length;
	if (nodesCount === 0) return;

	// Check if this container belongs to a suggestion popup or modal frame
	const isPopupContext = container.classList.contains("suggestion-container") || 
	                       container.classList.contains("modal-container") || 
	                       container.closest(".suggestion-container, .modal-container") !== null;

	for (let i = 0; i < nodesCount; i++) {
		const node = nodes[i];
		if (node !== undefined && node !== null && isHtmlElement(node)) {
			// 🔑 SUGGESTOR PROTECTOR: If we are inside a typing lookup popup, bypass heavy DOM reshaping.
			// Instead, we safely extract the target from the parent's data-path attributes if available,
			// or read the text content directly without letting clearExtraAttributes touch Obsidian's spans.
			if (isPopupContext) {
				const parentItem = node.closest(".suggestion-item, .another-quick-switcher__item, .omnisearch-result");
				let resolvedPath = "";
				
				if (parentItem instanceof HTMLElement) {
					resolvedPath = parentItem.getAttribute("data-path") || parentItem.getAttribute("data-href") || "";
				}
				if (!resolvedPath) {
					resolvedPath = node.textContent ?? "";
				}
				
				if (resolvedPath) {
					const dest = plugin.app.metadataCache.getFirstLinkpathDest(getLinkpath(resolvedPath), "");
					if (dest) {
						const isDark: boolean = document.body.classList.contains("theme-dark");
						const selectorsConfig: CSSLink[] = plugin.settings?.selectors ?? [];
						const rawProps = fetchTargetAttributesSync(plugin.app, plugin, dest, false);
						const matchedProfile = findMatchingRule(selectorsConfig, rawProps);
						
						if (matchedProfile.hasAnyMatch) {
							const activeColor = isDark ? matchedProfile.darkColor : matchedProfile.lightColor;
							const activeBg = isDark ? matchedProfile.darkBgColor : matchedProfile.lightBgColor;
							
							// Direct atomic style injection. This keeps Obsidian's internal structure perfectly intact!
							if (activeColor) node.style.color = activeColor;
							if (activeBg && activeBg !== "transparent") node.style.backgroundColor = activeBg;
							
							node.setAttribute("data-link-color", activeColor || "");
							node.addClass("data-link-text");
						}
					}
				}
			} else {
				// Standard safe layout route for stable document trees and sidebars
				updateDivExtraAttributes(plugin.app, plugin, node, "", null, filterCollapsible);
			}
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
	
	// ⚡ STRIPPED OVERHEAD: Safely look lookup text targets without regressing via loose regex match strings
	const destName = ctx.sourcePath.endsWith(".md") ? ctx.sourcePath.slice(0, -3) : ctx.sourcePath;

	links.forEach((node) => {
		if (!isHtmlElement(node)) return;
		
		const hrefAttr = node.getAttribute("href");
		if (!hrefAttr) return;

		const parts = hrefAttr.split("#");
		const linkHref = parts[0];
		
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

	// ⚡ ARCHITECTURAL CONSOLIDATION: Re-use your global extractCleanLinkPath utility cleanly.
	// This discards manual raw pipe splits and string slicing loops entirely.
	const matchWikilink = (entry: string): string | null => {
		if (entry.length <= 4 || !entry.startsWith("[[") || !entry.endsWith("]]")) return null;
		
		const resolvedTarget: string = extractCleanLinkPath(entry);
		if (resolvedTarget.length > 0) {
			return resolvedTarget;
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

		let metadataPane: HTMLElement | null = null;
		const internalView = leaf.view as unknown as ObsidianViewMetadataInternal;
		if (internalView.metadataEditor?.contentEl instanceof HTMLElement) {
			metadataPane = internalView.metadataEditor.contentEl;
		}

		if (metadataPane) {
			updatePropertiesPane(metadataPane, file, app, plugin);
		}

		let tabHeader: HTMLElement | null = null;
		const internalLeaf = leaf as unknown as ObsidianLeafHeaderInternal;
		if (internalLeaf.tabHeaderInnerTitleEl instanceof HTMLElement) {
			tabHeader = internalLeaf.tabHeaderInnerTitleEl;
		}

		if (tabHeader) {
			// 🔑 UNIVERSAL PROTOCOL: Tab headers are now styled automatically and natively out of the box,
			// completely free of legacy configuration switches.
			updateDivExtraAttributes(app, plugin, tabHeader, "", file.path);
		}

		cachedFile?.links?.forEach((link) => {
			// ⚡ ZERO OVERHEAD LOOKUP: Ditch regex and reference the file basename natively
			const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.basename);
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
