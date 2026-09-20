import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { fetchTargetAttributesSync, fetchTargetAttributesCached, AttrCache } from "../processors/attribute-fetcher";
import { setLinkNewProps, tagChipStyles } from "../processors/link-mutator";
import { resolveRuleResolution } from "../processors/rule-resolver";
import { extractCleanLinkPath, isHtmlElement, normalizePathForQueue } from "../utils/shared-utils";

type RefreshScope = {
	paths?: Set<string>;
	prefixes?: Set<string>;
};

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
			activeWindow.requestAnimationFrame(() => this.processBatch());
		}
	}

	/**
	 * Iterates and flushes a strict slice of the queue inside a single layout frame.
	 */
	private processBatch(): void {
		const plugin = (window as any).app.plugins?.plugins?.["re-supercharged-links"];
		if (!plugin) {
			this.queue.length = 0;
			this.isProcessing = false;
			return;
		}

		// Calculate how many elements to safely process this frame
		const currentBatchSize = Math.min(this.queue.length, this.CHUNK_SIZE);
		
		for (let i = 0; i < currentBatchSize; i++) {
			const task = this.queue.shift();
			if (task && task.element.isConnected) {
				// Perform the actual heavy DOM mutation here
				setLinkNewProps(task.element, task.props, plugin);
			}
		}

		// If elements remain, request a new animation frame loop dynamically
		if (this.queue.length > 0) {
			activeWindow.requestAnimationFrame(() => this.processBatch());
		} else {
			this.isProcessing = false;
		}
	}
}

// Global instance allocated statically to optimize memory footprint
const domBatcher = new DOMMutationBatcher();

/**
 * Scans view links and routes them via the async mutation batcher to maintain fluid frame rates.
 */
function updateLeafInternalLinks(
	app: App,
	plugin: ResuperchargedLinks,
	file: TFile,
	containerEl: HTMLElement,
	attrCache: AttrCache
): number {
	const cachedFile = app.metadataCache.getFileCache(file);
	const links = cachedFile?.links ?? [];
	let localCount = 0;

	for (let i = 0; i < links.length; i++) {
		const link = links[i];
		if (!link) continue;

		const dest = app.metadataCache.getFirstLinkpathDest(link.link, file.basename);
		if (!dest) continue;

		const newProps = fetchTargetAttributesCached(app, plugin, dest, false, attrCache);
		const escapedHref: string = CSS.escape(link.link);
		const internalLinks: NodeListOf<Element> = containerEl.querySelectorAll(`a.internal-link[href="${escapedHref}"]`);

		for (let j = 0; j < internalLinks.length; j++) {
			const node = internalLinks[j];
			if (node && isHtmlElement(node)) {
				// 🚀 BREAK SYNCHRONOUS BOTTLENECK: Deflect mutations to the asynchronous chunk engine
				domBatcher.enqueue(node, newProps);
				localCount += 1;
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
		const genericTracker = plugin.telemetry as unknown as Record<string, number>;
		if (plugin.telemetry && plugin.telemetry.getTrackingState()) {
			plugin.telemetry.setLastNodeCount(totalNodesStyled);
		}
	}
}
