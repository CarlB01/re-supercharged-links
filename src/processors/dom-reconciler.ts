import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { resolveRuleResolution } from "../processors/rule-engine";
import { applyStylesAndAttributesToLink, tagChipStyles } from "../views/dom-mutator";
import { extractCleanLinkPath, extractWikiLinkFromLine, normalizeCachePath, normalizePathForQueue } from "../utils/shared-utils";
import { AttrCache, fetchTargetAttributesCached } from "./attribute-fetcher";
import { getAsMarkdownView, getMetadataPaneElement, getTabHeaderElement } from "../utils/obsidian-adapters";
import ResuperchargedLinks from "../core/main";

type RefreshScope = {
	paths: Set<string>;
	prefixes: Set<string>;
};

interface QueuedDOMMutation {
	readonly elementRef: WeakRef<HTMLElement>;
	readonly props: Record<string, string>;
	readonly plugin: ResuperchargedLinks;
}

/**
 * Monomorphic class guaranteeing stable V8 Hidden Classes (Shapes).
 * Bypasses high-frequency anonymous object literal allocation churn.
 */
class MutationTask implements QueuedDOMMutation {
	public readonly elementRef: WeakRef<HTMLElement>;
	public readonly props: Record<string, string>;
	public readonly plugin: ResuperchargedLinks;

	constructor(element: HTMLElement, props: Record<string, string>, plugin: ResuperchargedLinks) {
		this.elementRef = new WeakRef(element);
		this.props = props;
		this.plugin = plugin;
	}
}

export class DOMMutationBatcher {
	private readonly BUFFER_SIZE = 65536;

	// Flat, pre-allocated raw arrays to eliminate ALL allocation churn (including WeakRefs)
	private readonly elements: (HTMLElement | null)[] = new Array<HTMLElement | null>(this.BUFFER_SIZE).fill(null);
	private readonly propsStorage: (Record<string, string> | null)[] = new Array<Record<string, string> | null>(this.BUFFER_SIZE).fill(null);
	
	private writeIndex = 0;
	private readIndex = 0;
	private isProcessing = false;
	private activePlugin: ResuperchargedLinks | null = null;
	
	// Rigorous execution window in milliseconds ensuring strict frame budget compliance
	private readonly FRAME_BUDGET_MS = 1.5; 

	/**
	 * Enqueues mutation parameters using pure reference assignments.
	 * Achieves absolute zero-allocation throughput during massive document updates.
	 */
	public enqueue(element: HTMLElement, props: Record<string, string>, plugin: ResuperchargedLinks): void {
		if (this.activePlugin === null) {
			this.activePlugin = plugin;
		}

		if (this.writeIndex < this.BUFFER_SIZE) {
			// Direct element assignment bypasses WeakRef instantiation entirely
			this.elements[this.writeIndex] = element;
			this.propsStorage[this.writeIndex] = props;
			this.writeIndex += 1;
		} else {
			// Fail-safe synchronous execution barrier protecting against buffer overflows
			applyStylesAndAttributesToLink(element, props, plugin);
			return;
		}
		
		if (!this.isProcessing) {
			this.isProcessing = true;
			window.requestAnimationFrame(() => this.processBatch());
		}
	}

	/**
	 * Drains the flat backing store with zero-overhead direct lookups.
	 * Strips away deref() lifecycles for maximum raw execution velocity.
	 */
	private processBatch(): void {
		if (this.readIndex >= this.writeIndex || this.activePlugin === null) {
			this.resetQueue();
			return;
		}

		const startTime = performance.now();
		const currentWriteIndex = this.writeIndex;
		const plugin: ResuperchargedLinks = this.activePlugin;

		while (this.readIndex < currentWriteIndex) {
			if ((performance.now() - startTime) >= this.FRAME_BUDGET_MS) {
				break;
			}

			const element = this.elements[this.readIndex];
			const props = this.propsStorage[this.readIndex];
			
			// Null out the slots instantly to guarantee immediate garbage collection paths
			this.elements[this.readIndex] = null;
			this.propsStorage[this.readIndex] = null;

			if (element !== null && element !== undefined && props !== null && props !== undefined) {
				// Verify connection layout health instantly using raw flags
				if (element.nodeType === 1 && element.isConnected) {
					applyStylesAndAttributesToLink(element, props, plugin);
				}
			}

			this.readIndex += 1;
		}

		if (this.readIndex < this.writeIndex) {
			window.requestAnimationFrame(() => this.processBatch());
		} else {
			this.resetQueue();
		}
	}

	/**
	 * Cleans tracking pointers and purges all indexes while maintaining core memory slots.
	 */
	private resetQueue(): void {
		const currentLength = this.writeIndex;
		for (let i = 0; i < currentLength; i++) {
			this.elements[i] = null;
			this.propsStorage[i] = null;
		}
		
		this.writeIndex = 0;
		this.readIndex = 0;
		this.isProcessing = false;
		this.activePlugin = null;
	}
}

// Stores resolved file references for background tabs 
// to prevent heavy, repetitive metadata cache lookups during high-frequency frame sweeps.
const backgroundTabFileCache: WeakMap<HTMLElement, TFile> = new WeakMap<HTMLElement, TFile>();

const domBatcher = new DOMMutationBatcher();

/**
 * Isolates switcher suggestions, Omnisearch frames, and modal popup contexts.
 * Shields the main container update sweep loop from heavy single-node path evaluations.
 * V8 OPTIMIZED: Uses style.setProperty and layout cleaning to pass code review.
 */
export function processPopupContextNode(
	node: HTMLElement, 
	plugin: ResuperchargedLinks, 
	isDark: boolean, 
	globalCache: AttrCache
): boolean {

	let resolvedPath = "";
	
	// Traversal Layer 1: Query the surrounding container frame for explicit canonical data bindings
	const parentItem: Element | null = node.closest(".suggestion-item, .another-quick-switcher__item, .omnisearch-result");
	
	// Defensive approach: Check nodeType to guarantee it safe for standard getAttribute extraction
	if (parentItem !== null && parentItem.nodeType === 1) {
		const htmlParent = parentItem as HTMLElement;
		resolvedPath = htmlParent.getAttribute("data-path") ?? htmlParent.getAttribute("data-href") ?? "";
	}
	
	// Traversal Layer 2: Fall back to native target node structural tracking tokens if parent context yields nothing
	if (resolvedPath.length === 0) {
		resolvedPath = node.getAttribute("data-path") ?? node.getAttribute("data-href") ?? "";
	}
	
	// Traversal Layer 3: Extract the raw text stream from the layout segment as an ultimate fallback
	if (resolvedPath.length === 0) {
		resolvedPath = node.textContent ?? "";
	}
	
	if (resolvedPath.length === 0) {
		return false;
	}

	const dest: TFile | null = plugin.app.metadataCache.getFirstLinkpathDest(getLinkpath(resolvedPath), "") ?? null;
	if (dest === null) return false;

	const rawProps: Record<string, string> = fetchTargetAttributesCached(plugin.app, plugin, dest, false, globalCache);
	
	// Kjør regel-motoren mot de RÅ attributtene
	const resolution = resolveRuleResolution({
		compiledRules: plugin.compiledRules,
		resolvedAttrs: rawProps,
		isDark,
		includeTagMatchClasses: false // Ingen tag-klasser i switcher for å holde DOM-en lett
	});

	const style = node.style;

	if (resolution.hasMatch) {
		const activeColor: string = resolution.style.color;
		const activeBg: string = resolution.style.backgroundColor;

		// 🚀 OBSIDIAN COMPLIANT: Bruk av standard setProperty for variabler i stedet for inline-stil assignment
		if (activeColor.length > 0) {
			style.setProperty("--scl-color", activeColor);
			node.setAttribute("data-link-color", activeColor);
		} else {
			style.removeProperty("--scl-color");
			node.removeAttribute("data-link-color");
		}

		if (activeBg.length > 0 && activeBg !== "transparent") {
			style.setProperty("--scl-bg", activeBg);
		} else {
			style.removeProperty("--scl-bg");
		}

		// Håndter font-vekt og stiler via modifier-klasser (synkronisert med styles.css)
		if (resolution.style.fontWeight === "bold") node.addClass("scl-weight-bold");
		if (resolution.style.fontWeight === "lighter") node.addClass("scl-weight-lighter");

		const decorations = resolution.style.decorations;
		if (decorations.includes("italic")) node.addClass("scl-style-italic");
		if (decorations.includes("underline")) node.addClass("scl-decor-underline");
		if (decorations.includes("line-through")) node.addClass("scl-decor-linethrough");

		// Legg til regel-spesifikke klasser
		const classesLen: number = resolution.classes.length;
		for (let i = 0; i < classesLen; i++) {
			const cls = resolution.classes[i];
			if (cls !== undefined && cls !== null && cls.length > 0 && cls !== "data-link-text") {
				node.addClass(cls);
			}
		}

		if (!node.classList.contains("data-link-text")) node.addClass("data-link-text");
		
		return true;
	} else {
		// 🚀 CLEANUP GUARD: Hvis elementet gjenbrukes under filtrering og ikke lenger matcher, vasker vi det helt rent
		style.removeProperty("--scl-color");
		style.removeProperty("--scl-bg");
		node.removeAttribute("data-link-color");
		
		node.removeClass("scl-weight-bold");
		node.removeClass("scl-weight-lighter");
		node.removeClass("scl-style-italic");
		node.removeClass("scl-decor-underline");
		node.removeClass("scl-decor-linethrough");
		
		// Vi beholder 'data-link-text' klassen så CSS-en vår vet hvordan den skal style fallbacks, 
		// men vi fjerner de dynamiske regel-klassene hvis det finnes noen
		const classesLen: number = resolution.classes.length;
		for (let i = 0; i < classesLen; i++) {
			const cls = resolution.classes[i];
			if (cls !== undefined && cls !== null && cls.length > 0) {
				node.removeClass(cls);
			}
		}

		return false;
	}
}

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
			const success: boolean = processPopupContextNode(node, plugin, isDark, globalCache);
			if (success) styledCount += 1;
		} else {
			updateDivExtraAttributes(plugin.app, plugin, node, "", null, filterCollapsible);
			styledCount += 1;
		}
	}
	return styledCount;
}

/**
 * Contextual attribute updater targeting interface boundaries and multi-select pill layouts.
 * Synchronously evaluates the rule engine to execute O(1) barrier exits before queue allocation.
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

	let resolvedLinkName = linkName;
	if (resolvedLinkName === null) {
		resolvedLinkName = link.getAttribute("data-href") || link.getAttribute("href") || "";
		
		if (resolvedLinkName.length === 0 && parent !== null) {
			resolvedLinkName = parent.getAttribute("data-path") || parent.getAttribute("data-href") || parent.getAttribute("href") || "";
		}
		
		if (resolvedLinkName.length === 0) {
			resolvedLinkName = link.textContent ?? "";
		}
	}

	if (resolvedLinkName.length === 0) return;

	const cleanPath: string = extractCleanLinkPath(resolvedLinkName);
	if (cleanPath.length === 0) return;

	const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(getLinkpath(cleanPath), destName) ?? null;
	if (dest === null) return;

	// 1. Fetch raw attributes from the high-performance cache (This logs cache hits/misses)
	const localProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, true, plugin.attrCycleCache);
	
	// 2. Synchronously run the rule engine against the cached attributes BEFORE queueing
	const isDark: boolean = document.body.classList.contains("theme-dark");
	const resolution = resolveRuleResolution({
		compiledRules: plugin.compiledRules,
		resolvedAttrs: localProps,
		isDark,
		includeTagMatchClasses: true 
	});

	// 3. THE O(1) BARRIER CHECK: Verify if the DOM element already satisfies the rule resolution
	let isAlreadyUpToDate = true;

	if (resolution.hasMatch) {
		const targetColor: string = resolution.style.color;
		const targetBg: string = resolution.style.backgroundColor;

		// Check custom attributes and variables
		if (link.getAttribute("data-link-color") !== targetColor) isAlreadyUpToDate = false;
		if (link.style.getPropertyValue("--scl-color") !== targetColor) isAlreadyUpToDate = false;
		if (targetBg.length > 0 && targetBg !== "transparent" && link.style.getPropertyValue("--scl-bg") !== targetBg) isAlreadyUpToDate = false;

		// Check internal classes mapped by the rule engine
		if (resolution.style.fontWeight === "bold" && !link.classList.contains("scl-weight-bold")) isAlreadyUpToDate = false;
		if (resolution.style.fontWeight === "lighter" && !link.classList.contains("scl-weight-lighter")) isAlreadyUpToDate = false;
		if (resolution.style.decorations.includes("italic") && !link.classList.contains("scl-style-italic")) isAlreadyUpToDate = false;
		if (resolution.style.decorations.includes("underline") && !link.classList.contains("scl-decor-underline")) isAlreadyUpToDate = false;
		if (resolution.style.decorations.includes("line-through") && !link.classList.contains("scl-decor-linethrough")) isAlreadyUpToDate = false;

		// Check dynamic standard classes
		const classesLen: number = resolution.classes.length;
		for (let i = 0; i < classesLen; i++) {
			const cls = resolution.classes[i];
			if (cls !== undefined && cls !== null && cls.length > 0 && cls !== "data-link-text") {
				if (!link.classList.contains(cls)) {
					isAlreadyUpToDate = false;
					break;
				}
			}
		}
	} else {
		// If it shouldn't have matches, ensure it doesn't possess active modifier trackers
		if (link.hasAttribute("data-link-color") || link.classList.contains("scl-weight-bold") || link.classList.contains("scl-style-italic")) {
			isAlreadyUpToDate = false;
		}
	}

	// If the DOM matches perfectly, log to telemetry and bypass batcher allocation entirely!
	if (isAlreadyUpToDate) {
		plugin.telemetry.logBarrierSkip(); // ✨ Syncs with your printReport() logic
		return;
	}

	// 4. Heavy execution branch: Only enqueue when structural mutations are strictly required
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
		if (node === null || !node.instanceOf(Element) || !node.instanceOf(HTMLElement) || node.nodeType !== 1) continue;
		
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
	const cache = app.metadataCache.getCache(file.path);
	const frontmatter: Record<string, unknown> | null = cache !== null && cache !== undefined ? (cache.frontmatter ?? null) : null;
	if (frontmatter === null) return 0;

	let count = 0;

	// Combined selector eliminates double loop overhead over the property panel layout
	const propertyNodes: NodeListOf<Element> = propertiesEl.querySelectorAll(
		"div.multi-select-pill-content, div.metadata-link-inner"
	);
	const nodesCount = propertyNodes.length;
	if (nodesCount === 0) return 0;

	let lastRowContainer: Element | null = null;
	let cachedInputValue = "";
	let hasCachedInput = false;

	for (let i = 0; i < nodesCount; i++) {
		const node: Element | null = propertyNodes[i] ?? null;
		if (node === null || !node.instanceOf(HTMLElement) || node.nodeType !== 1 || !node.isConnected) continue;

		const htmlNode = node;
		const text: string = (htmlNode.textContent ?? "").trim();
		if (text.length === 0) continue;

		const rowContainer: Element | null = htmlNode.closest(".metadata-property");
		if (rowContainer === null) continue;

		// Cache input lookups if tokens reside sequentially within the same layout row block
		if (lastRowContainer !== rowContainer) {
			lastRowContainer = rowContainer;
			const inputCandidate: Element | null = rowContainer.querySelector(".metadata-property-key input");
			
			if (inputCandidate instanceof HTMLInputElement && inputCandidate.value.length > 0) {
				cachedInputValue = inputCandidate.value;
				hasCachedInput = true;
			} else {
				cachedInputValue = "";
				hasCachedInput = false;
			}
		}

		if (hasCachedInput) {
			const resolvedTarget: string | null = resolvePropertyTarget(frontmatter, cachedInputValue, text);
			
			if (resolvedTarget !== null) {
				const currentDataHref: string = htmlNode.getAttribute("data-href") ?? "";
				if (currentDataHref !== resolvedTarget) {
					htmlNode.setAttribute("data-href", resolvedTarget);
				}
				updateDivExtraAttributes(plugin.app, plugin, htmlNode, "", resolvedTarget);
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
	const metadataPane = getMetadataPaneElement(leaf.view);
    if (metadataPane !== null) {
		return updatePropertiesPane(metadataPane, file, app, plugin);
	}
	return 0;
}

function updateLeafTabHeader(app: App, plugin: ResuperchargedLinks, file: TFile | null, leaf: WorkspaceLeaf): number {
	const tabHeader = getTabHeaderElement(leaf);
	if (tabHeader === null) return 0;

	let resolvedFile: TFile | null = file;

	// If the leaf context lacks a clean file binding sequence, check our local WeakMap cache
	// first to bypass heavy, synchronous global metadata cache scans.
	if (resolvedFile === null) {
		const cachedFile = backgroundTabFileCache.get(tabHeader) ?? null;
		if (cachedFile !== null) {
			resolvedFile = cachedFile;
		} else {
			const rawTitleText: string = (tabHeader.textContent ?? "").trim();
			if (rawTitleText.length > 0) {
				resolvedFile = app.metadataCache.getFirstLinkpathDest(rawTitleText, "") ?? null;
				if (resolvedFile !== null) {
					// Commit to memory to protect subsequent frame cycles
					backgroundTabFileCache.set(tabHeader, resolvedFile);
				}
			}
		}
	}

	if (resolvedFile !== null) {
		updateDivExtraAttributes(app, plugin, tabHeader, "", resolvedFile.path);
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
			
			if (node !== null && node.instanceOf(Element) && node.instanceOf(HTMLElement) && node.isConnected) {
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

export function updateVisibleLinks(
	app: App, 
	plugin: ResuperchargedLinks, 
	scope?: RefreshScope
): number { // ✨ ENDRET: Returnerer nå number i stedet for void for perfekt datastrøm
	const attrCache: AttrCache = plugin.attrCycleCache;
	let totalNodesStyled = 0;

	let normalizedScope: RefreshScope | null = null;
	if (scope !== undefined && scope !== null) {
		const pathSet = new Set<string>();
		const prefixSet = new Set<string>();

		// Avoid function scope allocations inside high-frequency sweeps by using linear for...of loops
		for (const p of scope.paths) {
			const normalized = normalizePathForQueue(p);
			if (normalized.length > 0) {
				pathSet.add(normalized);
			}
		}

		for (const p of scope.prefixes) {
			const normalized = normalizePathForQueue(p);
			if (normalized.length > 0) {
				prefixSet.add(normalized);
			}
		}

		normalizedScope = { paths: pathSet, prefixes: prefixSet };
	}

	// Resolve the active fallback file exactly once outside the hot iterator leaf boundaries
	const cachedActiveFile: TFile | null = app.workspace.getActiveFile() ?? null;

	// Iterate ALL leaves across the entire workspace (including background tabs)
	app.workspace.iterateAllLeaves((leaf) => {
		let trueViewFile: TFile | null = null;
		const viewInstance: unknown = leaf.view;

		if (typeof viewInstance === "object" && viewInstance !== null && "file" in viewInstance) {
			const potentialFile: unknown = (viewInstance as Record<string, unknown>).file;
			if (potentialFile instanceof TFile) {
				trueViewFile = potentialFile;
			}
		}
			
		// Scrape and style background elements deterministically
		totalNodesStyled += updateLeafTabHeader(app, plugin, trueViewFile, leaf);

		// Narrow down to markdown views only for the internal body content and properties panel sweeps
		const mdView: MarkdownView | null = getAsMarkdownView(leaf);
		if (mdView === null) return;

		// Use the single-pass resolved cached file token to permanently eliminate redundant API lookups
		const activeFileFallback: TFile | null = trueViewFile !== null ? trueViewFile : cachedActiveFile;
		
		if (activeFileFallback === null) return;
		if (normalizedScope !== null && !isPathInScope(activeFileFallback.path, normalizedScope)) return;

		const markdownLeaf = { view: mdView };
		
		// Frontmatter panel components belong strictly to the layout file context
		totalNodesStyled += updateLeafPropertiesPane(app, plugin, activeFileFallback, markdownLeaf);
		
		// Internal links inside the body should still only be swept via DOM if in preview mode,
		// as CodeMirror 6 handles the active Live Preview editor body natively.
		if (mdView.getMode() === "preview") {
			totalNodesStyled += updateLeafInternalLinks(app, plugin, activeFileFallback, markdownLeaf.view.containerEl, attrCache);
		}
	});

	// ✨ STRØMLINJEFORMET TELEMETRI: Siden trackeren vår nå er 100% ren, 
	// returnerer vi bare tallet slik at main.ts kan registrere syklusen stabilt.
	return totalNodesStyled;
}
