// processors/dom-reconciler

import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import { resolveRuleResolution } from "../processors/rule-engine";
import { setLinkNewProps, tagChipStyles } from "../views/dom-mutator";
import { extractCleanLinkPath, extractWikiLinkFromLine, normalizeCachePath, normalizePathForQueue } from "../utils/shared-utils";
import { AttrCache, fetchTargetAttributesCached } from "./attribute-fetcher";
import ResuperchargedLinks from "../core/main";

type RefreshScope = {
	paths: Set<string>;
	prefixes: Set<string>;
};

interface ObsidianViewMetadataInternal {
	metadataEditor?: {
		contentEl?: HTMLElement;
	};
}

interface ObsidianLeafHeaderInternal {
	tabHeaderInnerTitleEl?: HTMLElement;
}

interface QueuedDOMMutation {
	readonly element: HTMLElement;
	readonly props: Record<string, string>;
	readonly plugin: ResuperchargedLinks;
}

class DOMMutationBatcher {
	private readonly queue: QueuedDOMMutation[] = [];
	private isProcessing = false;
	private readonly CHUNK_SIZE = 200;

	/**
	 * Enqueues a targeted HTMLElement mutation into the asynchronous rendering pipeline.
	 * ✅ ARTIFACT INJECTION: Accepts explicit core plugin instances to decouple thread scopes.
	 */
	public enqueue(element: HTMLElement, props: Record<string, string>, plugin: ResuperchargedLinks): void {
		this.queue.push({ element, props, plugin });
		if (!this.isProcessing) {
			this.isProcessing = true;
			window.requestAnimationFrame(() => this.processBatch());
		}
	}

	/**
	 * Flushes a high-capacity performance slice of the mutation queue within a single animation frame.
	 */
	private processBatch(): void {
		const totalPending = this.queue.length;
		if (totalPending === 0) {
			this.isProcessing = false;
			return;
		}

		const currentBatchSize = totalPending > this.CHUNK_SIZE ? this.CHUNK_SIZE : totalPending;
		for (let i = 0; i < currentBatchSize; i++) {
			const task: QueuedDOMMutation | null = this.queue.shift() ?? null;
			
			// ✅ SAFE COUPLING: Direct frame execution bound typesafely to the context-carried reference
			if (task !== null && task.element.nodeType === 1 && task.element.isConnected) {
				setLinkNewProps(task.element, task.props, task.plugin);
			}
		}

		if (this.queue.length > 0) {
			window.requestAnimationFrame(() => this.processBatch());
		} else {
			this.isProcessing = false;
		}
	}
}

const domBatcher = new DOMMutationBatcher();

/**
 * Sweeps a container or processes targeted direct nodes to assign compiled visual styles instantly.
 * Optimized to completely bypass heavy full-container lookups during continuous scrolling sequences.
 */
export function updateContainer(
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string,
	filterCollapsible = false,
	directNodes: HTMLElement[] | null = null
): number { 
	if (!container.isConnected) return 0;

	let styledCount = 0;
	if (plugin.settings.enableTagChips) {
		tagChipStyles(container, plugin);
	}

	const nodes: HTMLElement[] = directNodes !== null ? directNodes : (typeof container.findAll === "function" ? container.findAll(selector) ?? [] : []);
	const nodesCount = nodes.length;
	if (nodesCount === 0) return 0;

	const isPopupContext: boolean =
		container.classList.contains("suggestion-container") ||
		container.classList.contains("modal-container") ||
		container.closest(".suggestion-container, .modal-container") !== null;

	const isDark: boolean = document.body.classList.contains("theme-dark");
	const globalCache = plugin.attrCycleCache;

	for (let i = 0; i < nodesCount; i++) {
		const node: HTMLElement | null = nodes[i] ?? null;
		if (node === null || node.nodeType !== 1 || !node.isConnected) continue;

		if (isPopupContext) {
			const parentItem: Element | null = node.closest(".suggestion-item, .another-quick-switcher__item, .omnisearch-result");
			let resolvedPath = "";
			if (parentItem instanceof Element && parentItem.instanceOf(HTMLElement)) {
				resolvedPath = parentItem.getAttribute("data-path") || parentItem.getAttribute("data-href") || "";
			}
			if (resolvedPath.length === 0) {
				resolvedPath = node.textContent ?? "";
			}
			if (resolvedPath.length === 0) continue;

			const dest: TFile | null = plugin.app.metadataCache.getFirstLinkpathDest(getLinkpath(resolvedPath), "") ?? null;
			if (dest === null) continue;

			const rawProps: Record<string, string> = fetchTargetAttributesCached(plugin.app, plugin, dest, false, globalCache);
			const resolution = resolveRuleResolution({
				compiledRules: plugin.compiledRules,
				resolvedAttrs: rawProps,
				isDark,
				includeTagMatchClasses: false
			});

			if (!resolution.hasMatch) continue;

			const activeColor: string = resolution.style.color;
			const activeBg: string = resolution.style.backgroundColor;

			if (activeColor.length > 0) node.style.color = activeColor;
			if (activeBg.length > 0 && activeBg !== "transparent") node.style.backgroundColor = activeBg;
			if (activeColor.length > 0) node.setAttribute("data-link-color", activeColor);
			node.addClass("data-link-text");
			styledCount += 1;
		} else {
			updateDivExtraAttributes(plugin.app, plugin, node, "", null, filterCollapsible);
			styledCount += 1;
		}
	}
	return styledCount;
}
	
/**
 * Contextual attribute updater targeting interface boundaries and multi-select pill layouts.
 */
export function updateDivExtraAttributes(
	app: App,
	plugin: ResuperchargedLinks,
	link: HTMLElement,
	destName: string,
	linkName: string | null,
	filterCollapsible = false
): void {
	const parent: HTMLElement | null = link.parentElement ?? null;
	if (filterCollapsible && parent !== null && parent.classList.contains("mod-collapsible")) return;

	let resolvedLinkName: string | null = linkName;
	if (resolvedLinkName === null) {
		const ownHref: string | null = link.getAttribute("data-href");
		const rawText: string = link.textContent ?? "";
		
		if (ownHref !== null && ownHref.length > 0) {
			resolvedLinkName = ownHref;
		} else if (parent !== null) {
			resolvedLinkName = parent.getAttribute("data-path") || parent.getAttribute("data-href") || parent.getAttribute("href") || null;
		}
		if (resolvedLinkName === null && rawText.length > 0) {
			resolvedLinkName = rawText;
		}
	}

	if (resolvedLinkName === null || resolvedLinkName.length === 0) return;

	const cleanPath: string = extractCleanLinkPath(resolvedLinkName);
	if (cleanPath.length === 0) return;

	const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(getLinkpath(cleanPath), destName) ?? null;
	if (dest === null) return;

	const localProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, true, plugin.attrCycleCache);
	// ✅ FIXED: Explicitly pass the active plugin object context directly down the chain
	domBatcher.enqueue(link, localProps, plugin);
}

/**
 * Post-processing rendering hook targeting explicit static document post-process element blocks.
 */
export function updateElLinks(app: App, plugin: ResuperchargedLinks, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
	const links: NodeListOf<Element> = el.querySelectorAll("a.internal-link");
	const linksCount: number = links.length;
	if (linksCount === 0) return;

	const destName: string = ctx.sourcePath.endsWith(".md") ? ctx.sourcePath.slice(0, -3) : ctx.sourcePath;
	const globalCache: AttrCache = plugin.attrCycleCache;

	for (let i = 0; i < linksCount; i++) {
		const node: Element | null = links[i] ?? null;
		if (node === null || !(node instanceof Element && node.instanceOf(HTMLElement)) || node.nodeType !== 1) continue;
		
		const hrefAttr: string | null = node.getAttribute("href");
		if (hrefAttr === null) continue;

		const parts: string[] = hrefAttr.split("#");
		const linkHref: string | null = parts[0] ?? null;
		if (linkHref === null || linkHref.length === 0) continue;

		const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(linkHref, destName) ?? null;
		if (dest === null) continue;

		const localProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, false, globalCache);
		// ✅ FIXED: Directly pass the context plugin reference into the mutation engine thread slice
		domBatcher.enqueue(node, localProps, plugin);
	}
}

/**
 * Advanced frontmatter string parser capable of handling both wikilinks and raw file mappings.
 */
function resolvePropertyTarget(frontmatter: Record<string, unknown>, key: string, linkText: string): string | null {
	const rawVal: unknown = frontmatter[key] ?? null;
	if (rawVal === null) return null;

	const cleanLinkText: string = linkText.trim().toLowerCase();
	const candidates: string[] = [];

	if (Array.isArray(rawVal)) {
		const len: number = rawVal.length;
		for (let i = 0; i < len; i++) {
			const item: unknown = rawVal[i] ?? null;
			if (typeof item === "string") candidates.push(item);
		}
	} else if (typeof rawVal === "string") {
		candidates.push(rawVal);
	}

	const candidatesCount = candidates.length;
	for (let i = 0; i < candidatesCount; i++) {
		const currentString: string = candidates[i] ?? "";
		if (currentString.length === 0) continue;

		if (currentString.includes("[[")) {
			const extractedPath: string | null = extractWikiLinkFromLine(currentString, cleanLinkText);
			if (extractedPath !== null) {
				return extractedPath;
			}
		} else {
			const cleanResolvedPath: string = normalizeCachePath(currentString);
			const cleanExtractedPath: string = normalizeCachePath(extractCleanLinkPath(currentString));
			
			if (cleanResolvedPath === cleanLinkText || cleanExtractedPath === cleanLinkText) {
				return currentString;
			}
		}
	}

	return null;
}


/**
 * Sweeps the document metadata property panel pane and balances elements securely.
 */
export function updatePropertiesPane(propertiesEl: HTMLElement, file: TFile, app: App, plugin: ResuperchargedLinks): number {
	const frontmatter: Record<string, unknown> | null = app.metadataCache.getCache(file.path)?.frontmatter ?? null;
	if (frontmatter === null) return 0;

	let count = 0;

	const pills: NodeListOf<Element> = propertiesEl.querySelectorAll("div.multi-select-pill-content");
	const pillsCount = pills.length;

	for (let i = 0; i < pillsCount; i++) {
		const node: Element | null = pills[i] ?? null;
		if (node === null || !(node instanceof Element && node.instanceOf(HTMLElement)) || !node.isConnected) continue;

		const text: string = (node.textContent ?? "").trim();
		if (text.length === 0) continue;

		const rowContainer: Element | null = node.closest(".metadata-property");
		const inputCandidate: Element | null = rowContainer ? rowContainer.querySelector(".metadata-property-key input") : null;
		
		if (inputCandidate instanceof HTMLInputElement && inputCandidate.value.length > 0) {
			const resolvedTarget: string | null = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
			
			if (resolvedTarget !== null) {
				const currentDataHref: string = node.getAttribute("data-href") || "";
				if (currentDataHref !== resolvedTarget) {
					node.setAttribute("data-href", resolvedTarget);
				}
				updateDivExtraAttributes(plugin.app, plugin, node, "", resolvedTarget);
				count += 1;
			}
		}
	}

	const singleLinks: NodeListOf<Element> = propertiesEl.querySelectorAll("div.metadata-link-inner");
	const singleLinksCount = singleLinks.length;
	for (let i = 0; i < singleLinksCount; i++) {
		const node: Element | null = singleLinks[i] ?? null;
		if (node === null || !(node instanceof Element && node.instanceOf(HTMLElement)) || node.nodeType !== 1 || !node.isConnected) continue;

		const text: string = (node.textContent ?? "").trim();
		if (text.length === 0) continue;

		const rowContainer: Element | null = node.closest(".metadata-property");
		const inputCandidate: Element | null = rowContainer ? rowContainer.querySelector(".metadata-property-key input") : null;

		if (inputCandidate instanceof HTMLInputElement && inputCandidate.value.length > 0) {
			const resolvedTarget: string | null = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
			
			if (resolvedTarget !== null) {
				const currentDataHref: string = node.getAttribute("data-href") || "";
				if (currentDataHref !== resolvedTarget) {
					node.setAttribute("data-href", resolvedTarget);
				}
				updateDivExtraAttributes(plugin.app, plugin, node, "", resolvedTarget);
				count += 1;
			}
		}
	}

	return count;
}

interface LeafWithMarkdownView {
	view: MarkdownView;
}

function updateLeafPropertiesPane(app: App, plugin: ResuperchargedLinks, file: TFile, leaf: LeafWithMarkdownView): number {
	let metadataPane: HTMLElement | null = null;
	const internalView = leaf.view as unknown as ObsidianViewMetadataInternal;
	if (internalView.metadataEditor?.contentEl instanceof HTMLElement) {
		metadataPane = internalView.metadataEditor.contentEl;
	}
	if (metadataPane !== null) {
		return updatePropertiesPane(metadataPane, file, app, plugin);
	}
	return 0;
}

function updateLeafTabHeader(app: App, plugin: ResuperchargedLinks, file: TFile, leaf: unknown): number {
	let tabHeader: HTMLElement | null = null;
	const internalLeaf = leaf as ObsidianLeafHeaderInternal;
	if (internalLeaf.tabHeaderInnerTitleEl instanceof HTMLElement) {
		tabHeader = internalLeaf.tabHeaderInnerTitleEl;
	}
	if (tabHeader !== null) {
		updateDivExtraAttributes(app, plugin, tabHeader, "", file.path);
		return 1;
	}
	return 0;
}

function updateLeafInternalLinks(
	app: App, 
	plugin: ResuperchargedLinks, 
	file: TFile, 
	containerEl: HTMLElement, 
	attrCache: AttrCache
): number {
	const cachedFile = app.metadataCache.getFileCache(file) ?? null;
	if (cachedFile === null || !cachedFile.links) return 0;
	
	const links = cachedFile.links;
	const linksCount = links.length;
	let localCount = 0;

	for (let i = 0; i < linksCount; i++) {
		const link = links[i];
		if (!link) continue;

		const escapedHref: string = CSS.escape(link.link);
		const selector = `a.internal-link[href="${escapedHref}"], .multi-select-pill-content[data-href="${escapedHref}"]`;
		const internalLinks: NodeListOf<Element> = containerEl.querySelectorAll(selector);
		const foundNodesCount = internalLinks.length;

		for (let j = 0; j < foundNodesCount; j++) {
			const node: Element | null = internalLinks[j] ?? null;
			
			if (node !== null && node instanceof Element && node.instanceOf(HTMLElement) && node.isConnected) {
				const rawHref: string | null = node.getAttribute("data-href");
				const rawText: string | null = node.textContent;
				
				const runtimeHref: string = rawHref !== null ? rawHref : (rawText !== null ? rawText : link.link);
				const cleanRuntimeHref: string = extractCleanLinkPath(runtimeHref);
				
				const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(cleanRuntimeHref, file.basename) ?? null;
				if (dest !== null) {
					const currentProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, false, attrCache);
					domBatcher.enqueue(node, currentProps, plugin);
					localCount += 1;
				}
			}
		}
	}
	return localCount;
}

function isPathInScope(path: string, scope?: RefreshScope): boolean {
	if (!scope) return true;
	const normalizedPath: string = normalizePathForQueue(path);
	if (normalizedPath.length === 0) return true;

	const paths: Set<string> = scope.paths;
	const prefixes: Set<string> = scope.prefixes;

	if (paths.size === 0 && prefixes.size === 0) return true;
	if (paths.has(normalizedPath)) return true;

	for (const prefix of prefixes) {
		const p: string = normalizePathForQueue(prefix);
		if (p.length === 0) continue;

		const normalizedPrefix: string = p.endsWith("/") ? p : `${p}/`;
		if (normalizedPath === p || normalizedPath.startsWith(normalizedPrefix)) {
			return true;
		}
	}
	return false;
}

export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks, scope?: RefreshScope): void {
	const attrCache: AttrCache = plugin.attrCycleCache;
	let totalNodesStyled = 0;

	const normalizedScope: RefreshScope | null = scope
		? {
				paths: new Set(Array.from(scope.paths).map((p) => normalizePathForQueue(p)).filter((p) => p.length > 0)),
				prefixes: new Set(Array.from(scope.prefixes).map((p) => normalizePathForQueue(p)).filter((p) => p.length > 0))
		  }
		: null;

	app.workspace.iterateRootLeaves((leaf) => {
		if (!(leaf.view instanceof MarkdownView)) return;
		if (leaf.view.getMode() !== "preview") return;

		const file: TFile | null = leaf.view.file;
		if (file === null) return;
		if (normalizedScope !== null && !isPathInScope(file.path, normalizedScope)) return;

		const markdownLeaf: LeafWithMarkdownView = { view: leaf.view };
		
		totalNodesStyled += updateLeafPropertiesPane(app, plugin, file, markdownLeaf);
		totalNodesStyled += updateLeafTabHeader(app, plugin, file, leaf);
		totalNodesStyled += updateLeafInternalLinks(app, plugin, file, markdownLeaf.view.containerEl, attrCache);
	});

	if (plugin.telemetry && plugin.telemetry.getTrackingState()) {
		plugin.telemetry.setLastNodeCount(totalNodesStyled);
	}
}
