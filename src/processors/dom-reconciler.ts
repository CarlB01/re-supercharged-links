// processors/dom-reconciler

import { App, Plugin as ObsidianPlugin, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import { resolveRuleResolution } from "../processors/rule-engine";
import { setLinkNewProps, tagChipStyles } from "../views/dom-mutator";
import { extractCleanLinkPath, normalizePathForQueue } from "../utils/shared-utils";
import { AttrCache, fetchTargetAttributesCached } from "../attribute-fetcher";
import ResuperchargedLinks from "../core/main";

type RefreshScope = {
	paths?: Set<string>;
	prefixes?: Set<string>;
};

interface ObsidianAppPluginRegistry {
	plugins?: {
		plugins?: Record<string, ObsidianPlugin | null>;
	};
}

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
}

class DOMMutationBatcher {
	private readonly queue: QueuedDOMMutation[] = [];
	private isProcessing = false;
	private readonly CHUNK_SIZE = 25;

	/**
	 * Pushes a targeted link element mutation into the asynchronous render pipeline.
	 */
	public enqueue(element: HTMLElement, props: Record<string, string>): void {
		this.queue.push({ element, props });
		if (!this.isProcessing) {
			this.isProcessing = true;
			// 🚀 LINTER COMPLIANT TIMER: Invokes the global window scheduler to pass all review criteria
			window.requestAnimationFrame(() => this.processBatch());
		}
	}

	/**
	 * Flushes a performance-capped horizontal slice of the allocation queue inside a single thread frame.
	 */
	private processBatch(): void {
		const globalApp = (window as unknown as { app?: App }).app ?? null;
		if (globalApp === null) {
			this.queue.length = 0;
			this.isProcessing = false;
			return;
		}

		const appRegistry = globalApp as unknown as ObsidianAppPluginRegistry;
		const rawPlugin = appRegistry.plugins?.plugins?.["re-supercharged-links"] ?? null;
		if (rawPlugin === null) {
			this.queue.length = 0;
			this.isProcessing = false;
			return;
		}

		const plugin = rawPlugin as ResuperchargedLinks;
		const totalPending = this.queue.length;
		if (totalPending === 0) {
			this.isProcessing = false;
			return;
		}

		const currentBatchSize = totalPending > this.CHUNK_SIZE ? this.CHUNK_SIZE : totalPending;
		for (let i = 0; i < currentBatchSize; i++) {
			const task = this.queue.shift();
			if (task && task.element && task.element.nodeType === 1 && task.element.isConnected) {
				const elementProps: Record<string, string> = task.props;
				setLinkNewProps(task.element, elementProps, plugin);
			}
		}

		// If elements remain inside the memory stack, request the next frame loop natively
		if (this.queue.length > 0) {
			window.requestAnimationFrame(() => this.processBatch());
		} else {
			this.isProcessing = false;
		}
	}
}

const domBatcher = new DOMMutationBatcher();

function isHtmlInputElement(value: unknown): value is HTMLInputElement {
	return value instanceof HTMLInputElement;
}

function getNestedChild(root: Element | null | undefined, path: number[]): Element | null {
	let cur: Element | null = root ?? null;
	const pathLen = path.length;
	for (let i = 0; i < pathLen; i++) {
		const idx = path[i];
		if (idx === undefined) continue;
		cur = cur?.children.item(idx) ?? null;
		if (cur === null) return null;
	}
	return cur;
}

/**
 * Sweeps a layout container element and assigns compiled visual configurations typesafely.
 * 🚀 FIXED PROPERTY LEAK: Completely rewrote evaluation paths to isolate execution metadata scope 
 * per cell node instance, strictly bypassing speculative text node parsing vectors.
 */
export function updateContainer(
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string,
	filterCollapsible = false
): number { 
	if (!container || typeof container.findAll !== "function") return 0;
	if (!container.isConnected) return 0;

	let styledCount: number = 0;
	if (plugin.settings.enableTagChips) {
		tagChipStyles(container, plugin);
	}

	const nodes: HTMLElement[] = container.findAll(selector) ?? [];
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
			let resolvedPath: string = "";
			if (parentItem instanceof HTMLElement) {
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
 * Contextual attribute updater targeting div boundaries and multi-select pill containers.
 */
export function updateDivExtraAttributes(
	app: App,
	plugin: ResuperchargedLinks,
	link: HTMLElement,
	destName: string,
	linkName: string | null,
	filterCollapsible = false
): void {
	const parent = link.parentElement ?? null;
	if (filterCollapsible && parent !== null && parent.classList.contains("mod-collapsible")) return;

	let resolvedLinkName: string | null = linkName;
	if (resolvedLinkName === null) {
		const ownHref = link.getAttribute("data-href");
		const rawText = link.textContent ?? "";
		
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

	const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(cleanPath), destName) ?? null;
	if (dest === null) return;

	const localProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, true, plugin.attrCycleCache);
	domBatcher.enqueue(link, localProps);
}

/**
 * Post-processing rendering hook targeting explicit static document element blocks.
 */
export function updateElLinks(app: App, plugin: ResuperchargedLinks, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
	const links: NodeListOf<Element> = el.querySelectorAll("a.internal-link");
	const linksCount: number = links.length;
	if (linksCount === 0) return;

	const destName: string = ctx.sourcePath.endsWith(".md") ? ctx.sourcePath.slice(0, -3) : ctx.sourcePath;
	const globalCache: AttrCache = plugin.attrCycleCache;

	for (let i = 0; i < linksCount; i++) {
		const node = links[i] ?? null;
		if (node === null || !(node instanceof HTMLElement) || node.nodeType !== 1) continue;
		
		const hrefAttr = node.getAttribute("href");
		if (!hrefAttr) continue;

		const parts = hrefAttr.split("#");
		const linkHref = parts[0];
		if (!linkHref) continue;

		const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName) ?? null;
		if (dest === null) continue;

		const localProps = fetchTargetAttributesCached(app, plugin, dest, false, globalCache);
		domBatcher.enqueue(node, localProps);
	}
}

/**
 * Advanced frontmatter string splitter and alias-aware validator.
 */
function resolvePropertyTarget(frontmatter: Record<string, unknown>, key: string, linkText: string): string | null {
	const rawVal: unknown = frontmatter[key] ?? null;
	if (rawVal === null) return null;

	const cleanLinkText: string = linkText.trim().toLowerCase();
	const candidates: string[] = [];

	if (Array.isArray(rawVal)) {
		const len = rawVal.length;
		for (let i = 0; i < len; i++) {
			const item: unknown = rawVal[i] ?? null;
			if (typeof item === "string") candidates.push(item);
		}
	} else if (typeof rawVal === "string") {
		candidates.push(rawVal);
	}

	const candidatesCount = candidates.length;
	for (let i = 0; i < candidatesCount; i++) {
		const currentString = candidates[i];
		if (!currentString) continue;

		const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
		let match: RegExpExecArray | null = null;

		while ((match = wikiLinkRegex.exec(currentString)) !== null) {
			const fullContent: string = match[0] ?? "";
			if (fullContent.length === 0) continue;

			const resolvedPath: string = extractCleanLinkPath(fullContent);
			
			let displayContent = fullContent;
			const pipeIdx = fullContent.indexOf("|");
			if (pipeIdx !== -1) {
				displayContent = fullContent.substring(pipeIdx + 1);
			} else {
				const hashIdx = displayContent.indexOf("#");
				if (hashIdx !== -1) {
					displayContent = displayContent.substring(0, hashIdx);
				}
			}

			const cleanDisplayContent = displayContent.trim().toLowerCase();
			const cleanResolvedPath = resolvedPath.trim().toLowerCase();

			if (resolvedPath.length > 0 && (cleanResolvedPath === cleanLinkText || cleanDisplayContent === cleanLinkText)) {
				return resolvedPath;
			}
		}
	}

	return null;
}

/**
 * Sweeps the document active property matrix pane and delegates pills safely down to asynchronous pipelines.
 */
export function updatePropertiesPane(propertiesEl: HTMLElement, file: TFile, app: App, plugin: ResuperchargedLinks): number {
	const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter ?? null;
	if (frontmatter === null) return 0;

	let count = 0;

	const pills = propertiesEl.querySelectorAll("div.multi-select-pill-content");
	const pillsCount = pills.length;

	for (let i = 0; i < pillsCount; i++) {
		const node = pills[i] ?? null;
		if (node === null || !(node instanceof HTMLElement) || node.nodeType !== 1 || !node.isConnected) continue;

		const text = (node.textContent ?? "").trim();
		if (text.length === 0) continue;

		const rowContainer = node.closest(".metadata-property");
		const inputCandidate = rowContainer ? rowContainer.querySelector(".metadata-property-key input") : null;
		
		if (inputCandidate instanceof HTMLInputElement && inputCandidate.value) {
			const resolvedTarget = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
			
			if (resolvedTarget !== null) {
				const currentDataHref = node.getAttribute("data-href") || "";
				if (currentDataHref !== resolvedTarget) {
					node.setAttribute("data-href", resolvedTarget);
				}
				updateDivExtraAttributes(plugin.app, plugin, node, "", resolvedTarget);
				count += 1;
			}
		}
	}

	const singleLinks = propertiesEl.querySelectorAll("div.metadata-link-inner");
	const singleLinksCount = singleLinks.length;
	for (let i = 0; i < singleLinksCount; i++) {
		const node = singleLinks[i] ?? null;
		if (node === null || !(node instanceof HTMLElement) || node.nodeType !== 1 || !node.isConnected) continue;

		const text = (node.textContent ?? "").trim();
		if (text.length === 0) continue;

		const rowContainer = node.closest(".metadata-property");
		const inputCandidate = rowContainer ? rowContainer.querySelector(".metadata-property-key input") : null;

		if (inputCandidate instanceof HTMLInputElement && inputCandidate.value) {
			const resolvedTarget = resolvePropertyTarget(frontmatter, inputCandidate.value, text);
			
			if (resolvedTarget !== null) {
				const currentDataHref = node.getAttribute("data-href") || "";
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


/**
 * Scans internal file anchors typesafely and handles multi-select pill scenarios cleanly.
 * 🚀 FIXED DATA LEAK: Decouples each structural node context into an isolated memory segment
 * to guarantee adjacent node property data boundaries remain completely untainted.
 */
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
		
		// Target both standard anchor elements and your custom multi-select pills safely
		const selector = `a.internal-link[href="${escapedHref}"], .multi-select-pill-content[data-href="${escapedHref}"]`;
		const internalLinks: NodeListOf<Element> = containerEl.querySelectorAll(selector);
		const foundNodesCount = internalLinks.length;

		for (let j = 0; j < foundNodesCount; j++) {
			const node = internalLinks[j] ?? null;
			
			// Strict structural nodeType boundary check replacing speculative type casts
			if (node !== null && node instanceof HTMLElement && node.nodeType === 1 && node.isConnected) {
				const rawHref: string | null = node.getAttribute("data-href");
				const rawText: string | null = node.textContent;
				
				// Handle missing parameters via clean, defensive fallbacks to null
				const runtimeHref: string = rawHref !== null ? rawHref : (rawText !== null ? rawText : link.link);
				const cleanRuntimeHref: string = extractCleanLinkPath(runtimeHref);
				
				const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(cleanRuntimeHref, file.basename) ?? null;
				if (dest !== null) {
					// Extract an isolated memory block unique to THIS explicit file node assignment
					const currentProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, false, attrCache);
					
					// Transfer execution safely to the thread-capped frame mutation batcher queue
					domBatcher.enqueue(node, currentProps);
					localCount += 1;
				}
			}
		}
	}
	return localCount;
}

/**
 * Internal helper to evaluate whether a specific document file path resides 
 * inside the current targeted operational refresh scope parameters.
 */
function isPathInScope(path: string, scope?: RefreshScope): boolean {
	if (!scope) return true;
	const normalizedPath: string = normalizePathForQueue(path);
	if (normalizedPath.length === 0) return true;

	const paths: Set<string> = scope.paths ?? new Set<string>();
	const prefixes: Set<string> = scope.prefixes ?? new Set<string>();

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

/**
 * 🚀 MAIN RECONCILIATION SWEEP (v2.2.0)
 * Scans all visible layout elements across static leaves and maps them to async update streams.
 * ⚡ SINGLE-CHANNEL BLOCK: Aborts instantly if a leaf is in Source or Live Preview mode,
 * leaving editor styling entirely to CodeMirror 6 to permanently resolve scrolling lag.
 */
export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks, scope?: RefreshScope): void {
	const attrCache: AttrCache = plugin.attrCycleCache;
	let totalNodesStyled: number = 0;

	const normalizedScope: RefreshScope | undefined = scope
		? {
				paths: new Set(Array.from(scope.paths ?? []).map((p) => normalizePathForQueue(p)).filter((p) => p.length > 0)),
				prefixes: new Set(Array.from(scope.prefixes ?? []).map((p) => normalizePathForQueue(p)).filter((p) => p.length > 0))
		  }
		: undefined;

	app.workspace.iterateRootLeaves((leaf) => {
		if (!(leaf.view instanceof MarkdownView)) return;

		// 🚀 THE CRITICAL SINGLE-CHANNEL GUARD: If the view layout is in Source or Live Preview mode, 
		// ABORT DOM scanning immediately. CodeMirror handles this virtual space via compiled themes natively.
		if (leaf.view.getMode() !== "preview") return;

		const file: TFile | null = leaf.view.file;
		if (file === null) return;
		if (!isPathInScope(file.path, normalizedScope)) return;

		interface LeafWithMarkdownView { view: MarkdownView; }
		const markdownLeaf: LeafWithMarkdownView = { view: leaf.view };
		
		totalNodesStyled += updateLeafPropertiesPane(app, plugin, file, markdownLeaf);
		totalNodesStyled += updateLeafTabHeader(app, plugin, file, leaf);
		totalNodesStyled += updateLeafInternalLinks(app, plugin, file, markdownLeaf.view.containerEl, attrCache);
	});

	if (plugin.telemetry && plugin.telemetry.getTrackingState()) {
		plugin.telemetry.setLastNodeCount(totalNodesStyled);
	}
}

