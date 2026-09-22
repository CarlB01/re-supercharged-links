import { App, Plugin as ObsidianPlugin, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { fetchTargetAttributesCached, AttrCache } from "../processors/attribute-fetcher";
import { setLinkNewProps, tagChipStyles } from "../processors/link-mutator";
import { resolveRuleResolution } from "../processors/rule-resolver";
import { extractCleanLinkPath, isHtmlElement, normalizePathForQueue } from "../utils/shared-utils";

type RefreshScope = {
	paths?: Set<string>;
	prefixes?: Set<string>;
};

/**
 * Structural interface mapping Obsidian's internal plugin registry layer typesafely.
 */
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
	if (nodes.length === 0) return 0;

	const isPopupContext: boolean =
		container.classList.contains("suggestion-container") ||
		container.classList.contains("modal-container") ||
		container.closest(".suggestion-container, .modal-container") !== null;

	const isDark: boolean = document.body.classList.contains("theme-dark");
	const globalCache = plugin.attrCycleCache; // 🚀 Bruk den felles globale versjonerte cachen!

	for (let i = 0; i < nodes.length; i++) {
		const node: HTMLElement | null = nodes[i] ?? null;
		if (node === null || !isHtmlElement(node)) continue;

		if (isPopupContext) {
			const parentItem: Element | null = node.closest(
				".suggestion-item, .another-quick-switcher__item, .omnisearch-result"
			);

			let resolvedPath: string = "";
			if (parentItem instanceof HTMLElement) {
				resolvedPath =
					parentItem.getAttribute("data-path") ||
					parentItem.getAttribute("data-href") ||
					"";
			}

			if (resolvedPath.length === 0) {
				resolvedPath = node.textContent ?? "";
			}
			if (resolvedPath.length === 0) continue;

			const dest: TFile | null = plugin.app.metadataCache.getFirstLinkpathDest(
				getLinkpath(resolvedPath),
				""
			);
			if (dest === null) continue;

			// 🚀 FIX: Byttet fra Sync til Cached for å bryte race condition i popups
			const rawProps: Record<string, string> = fetchTargetAttributesCached(
				plugin.app,
				plugin,
				dest,
				false,
				globalCache
			);

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
			if (activeBg.length > 0 && activeBg !== "transparent") {
				node.style.backgroundColor = activeBg;
			}

			if (activeColor.length > 0) {
				node.setAttribute("data-link-color", activeColor);
			}
			node.addClass("data-link-text");
			styledCount += 1;
		} else {
			updateDivExtraAttributes(plugin.app, plugin, node, "", null, filterCollapsible);
			styledCount += 1;
		}
	}
	return styledCount;
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

	// 🚀 FIX: Hent fra felles global cache i stedet for å tvinge frem tunge rå-skanninger synkront
	const newProps = fetchTargetAttributesCached(app, plugin, dest, true, plugin.attrCycleCache);
	setLinkNewProps(link, newProps, plugin);
}


export function updateElLinks(app: App, plugin: ResuperchargedLinks, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
	const attrCache: AttrCache = new Map();
	const links = el.querySelectorAll("a.internal-link");
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

export function updatePropertiesPane(propertiesEl: HTMLElement, file: TFile, app: App, plugin: ResuperchargedLinks): number {
	const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter;
	if (!frontmatter) return 0;

	let count: number = 0;
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
			count += 1;
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
			count += 1;
		}
	});

	return count;
}

interface LeafWithMarkdownView {
	view: MarkdownView;
}

function updateLeafPropertiesPane(
	app: App,
	plugin: ResuperchargedLinks,
	file: TFile,
	leaf: LeafWithMarkdownView
): number {
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

function updateLeafTabHeader(
	app: App,
	plugin: ResuperchargedLinks,
	file: TFile,
	leaf: unknown
): number {
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

interface QueuedDOMMutation {
	readonly element: HTMLElement;
	readonly props: Record<string, string>;
}

/**
 * High-performance asynchronous DOM mutation queue.
 * Processes link styling in micro-batches to eliminate layout thrashing during heavy scrolling.
 */
class DOMMutationBatcher {
	private readonly queue: QueuedDOMMutation[] = [];
	private isProcessing = false;
	private readonly CHUNK_SIZE = 25; // Process max 25 elements per frame to secure 60 FPS

	/**
	 * Pushes a targeted link element mutation into the asynchronous render pipeline.
	 */
	public enqueue(element: HTMLElement, props: Record<string, string>): void {
		this.queue.push({ element, props });
		if (!this.isProcessing) {
			this.isProcessing = true;
			// Schedule the batch process on the next native animation frame
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
			// task.element.nodeType === 1: web-standard (W3C).
			if (task && task.element && task.element.nodeType === 1 && task.element.isConnected) {
				const elementProps: Record<string, string> = task.props;
				setLinkNewProps(task.element, elementProps, plugin);
			}
		}

		if (this.queue.length > 0) {
			window.requestAnimationFrame(() => this.processBatch());
		} else {
			this.isProcessing = false;
		}
	}

}

// Global instance allocated statically to optimize memory footprint
const domBatcher = new DOMMutationBatcher();

/**
 * Scans internal file anchors typesafely and handles multi-select pill scenarios cleanly.
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
			
			// Strict structural boundary check replacing speculative type casts
			if (node !== null && node instanceof HTMLElement && node.nodeType === 1 && node.isConnected) {
				// 🚀 EXPLICIT ISOLATION channel: Read directly from the actual node hand context
				const rawHref: string | null = node.getAttribute("data-href");
				const rawText: string | null = node.textContent;
				
				// Handle missing parameters via clean, defensive fallbacks to null
				const runtimeHref: string = rawHref !== null ? rawHref : (rawText !== null ? rawText : link.link);
				const cleanRuntimeHref: string = extractCleanLinkPath(runtimeHref);
				
				const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(cleanRuntimeHref, file.basename) ?? null;
				
				if (dest !== null) {
					// Extract an isolated memory block unique to THIS explicit file node assignment
					const currentProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, false, attrCache);
					
					// Transfer execution safely to the thread-capped frame queue
					domBatcher.enqueue(node, currentProps);
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

export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks, scope?: RefreshScope): void {
	const attrCache: AttrCache = plugin.attrCycleCache;
	let totalNodesStyled: number = 0;

	const normalizedScope: RefreshScope | undefined = scope
		? {
				paths: new Set(
					Array.from(scope.paths ?? [])
						.map((p: string): string => normalizePathForQueue(p))
						.filter((p: string): boolean => p.length > 0)
				),
				prefixes: new Set(
					Array.from(scope.prefixes ?? [])
						.map((p: string): string => normalizePathForQueue(p))
						.filter((p: string): boolean => p.length > 0)
				)
		  }
		: undefined;

	app.workspace.iterateRootLeaves((leaf) => {
		if (!(leaf.view instanceof MarkdownView)) return;

		const file: TFile | null = leaf.view.file;
		if (file === null) return;

		if (!isPathInScope(file.path, normalizedScope)) return;

		const markdownLeaf: LeafWithMarkdownView = { view: leaf.view };

		totalNodesStyled += updateLeafPropertiesPane(app, plugin, file, markdownLeaf);
		totalNodesStyled += updateLeafTabHeader(app, plugin, file, leaf);
		totalNodesStyled += updateLeafInternalLinks(app, plugin, file, markdownLeaf.view.containerEl, attrCache);
	});

	if (plugin.telemetry && plugin.telemetry.getTrackingState()) {
		if (plugin.telemetry && plugin.telemetry.getTrackingState()) {
			plugin.telemetry.setLastNodeCount(totalNodesStyled);
		}
	}
}
