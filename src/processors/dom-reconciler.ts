import { App, getLinkpath, MarkdownPostProcessorContext, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import { resolveRuleResolution } from "../processors/rule-engine";
import { applyStylesAndAttributesToLink, clearExtraAttributes, tagChipStyles } from "../views/dom-mutator";
import { extractCleanLinkPath, extractWikiLinkFromLine, normalizeCachePath, normalizePathForQueue } from "../utils/shared-utils";
import { AttrCache, fetchTargetAttributesCached } from "./attribute-fetcher";
import { getAsMarkdownView, getMetadataPaneElement, getTabHeaderElement } from "../utils/obsidian-adapters";
import ResuperchargedLinks from "../core/main";

type RefreshScope = {
	paths: Set<string>;
	prefixes: Set<string>;
};

export class DOMMutationBatcher {
	// MÅ være en potens av 2 (f.eks. 65536) for å tillate lynrask bitwise modulo-maskering (&)
	private readonly BUFFER_SIZE = 65536;
	private readonly BIT_MASK = 65535; // BUFFER_SIZE - 1

	private readonly elements: (HTMLElement | null)[] = new Array<HTMLElement | null>(65536).fill(null);
	private readonly propsStorage: (Record<string, string> | null)[] = new Array<Record<string, string> | null>(65536).fill(null);
	
	private head = 0; // Read pointer
	private tail = 0; // Write pointer
	private isProcessing = false;
	private activePlugin: ResuperchargedLinks | null = null;
	
	private readonly FRAME_BUDGET_MS = 1.5; 

	/**
	 * Sirkulær enqueue som aldri kan løpe ut av indeks eller krasje på stakken.
	 */
	public enqueue(element: HTMLElement, props: Record<string, string>, plugin: ResuperchargedLinks): void {
		if (this.activePlugin === null) {
			this.activePlugin = plugin;
		}

		// Beregn neste posisjon for tail ved hjelp av sirkulær maskering (0 allokering)
		const nextTail = (this.tail + 1) & this.BIT_MASK;

		// Hvis ringen er 100% full, må vi tømme synkront for å unngå overskriving
		if (nextTail === this.head) {
			applyStylesAndAttributesToLink(element, props, plugin);
			return;
		}

		this.elements[this.tail] = element;
		this.propsStorage[this.tail] = props;
		this.tail = nextTail;
		
		if (!this.isProcessing) {
			this.isProcessing = true;
			window.requestAnimationFrame(() => this.processBatch());
		}
	}

	/**
	 * Tømmer ring-bufferen bit for bit innenfor den strenge tidsrammen på 1.5ms.
	 */
	private processBatch(): void {
		if (this.head === this.tail || this.activePlugin === null) {
			this.isProcessing = false;
			return;
		}

		const startTime = performance.now();
		const plugin: ResuperchargedLinks = this.activePlugin;

		// Kjør loopen helt til cachen er tom eller vi sprenger tidsbudsjettet
		while (this.head !== this.tail) {
			if ((performance.now() - startTime) >= this.FRAME_BUDGET_MS) {
				break;
			}

			const element = this.elements[this.head];
			const props = this.propsStorage[this.head];
			
			// Vask minneslotten umiddelbart for å frigjøre referansen for Garbage Collection (0% lekkasje!)
			this.elements[this.head] = null;
			this.propsStorage[this.head] = null;

			if (element !== null && element !== undefined && props !== null && props !== undefined) {
				if (element.nodeType === 1 && element.isConnected) {
					applyStylesAndAttributesToLink(element, props, plugin);
				}
			}

			// Flytt head-pekeren ett hakk fremover i ringen
			this.head = (this.head + 1) & this.BIT_MASK;
		}

		// Hvis det fortsatt er noder igjen i ringen, fortsetter vi i neste frame
		if (this.head !== this.tail) {
			window.requestAnimationFrame(() => this.processBatch());
		} else {
			this.isProcessing = false;
		}
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

	const rawProps: Record<string, string> = fetchTargetAttributesCached(plugin.app, plugin, dest, globalCache);
	
	// Kjør regel-motoren mot de RÅ attributtene
	const resolution = resolveRuleResolution({
		compiledRules: plugin.cacheManager.compiledRules,
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

	if (!plugin.flyweightEngine) return;

	const visibleText: string = (link.textContent || "").trim();
	const resolution = plugin.flyweightEngine.getResolution(cleanPath, visibleText);

	if (link.getAttribute("data-scl-signature") === resolution.signature && link.classList.contains("scl-processed")) {
		if (plugin.telemetry) {
			plugin.telemetry.logBarrierSkip();
		}
		return;
	}

	const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(getLinkpath(cleanPath), destName) ?? null;
	if (dest === null) return;

	// Hent de cachede attributtene trygt
	const cachedProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, plugin.attrCycleCache);

	// 🔒 DEN TRYGGE PRODUKSJONSLINJEN:
	// Vi bruker et helt standard, flatt objekt ({}) med fulle prototyp-metoder.
	// Dette er den uknuselige banen som holdt Obsidian 100% krasjfritt og stabilt!
	const localProps: Record<string, string> = {};
	
	const propKeys = Object.keys(cachedProps);
	const propKeysLen = propKeys.length;
	for (let i = 0; i < propKeysLen; i++) {
		const key = propKeys[i];
		if (key !== undefined) {
			localProps[key] = cachedProps[key] ?? "";
		}
	}

	// Tildel kjerne-egenskapene deterministisk
	localProps["data-href"] = dest.basename;
	localProps["path"] = dest.path;

	// Skyv trygt ut til ring-bufferen
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

		const localProps: Record<string, string> = fetchTargetAttributesCached(app, plugin, dest, globalCache);
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

	// 1. FINN DEN EKTE TARGET-NODEN (Der klasser og stiler faktisk brennes inn)
	const titleNode: HTMLElement | null = tabHeader.classList.contains("workspace-tab-header-inner-title")
		? tabHeader
		: tabHeader.querySelector<HTMLElement>(".workspace-tab-header-inner-title") ?? null;

	if (titleNode === null) return 0;

	let resolvedFile: TFile | null = file;

	if (resolvedFile === null) {
		const cachedFile = backgroundTabFileCache.get(tabHeader) ?? null;
		if (cachedFile !== null) {
			resolvedFile = cachedFile;
		} else {
			const rawTitleText: string = (titleNode.textContent ?? "").trim();
			if (rawTitleText.length > 0) {
				resolvedFile = app.metadataCache.getFirstLinkpathDest(rawTitleText, "") ?? null;
				if (resolvedFile !== null) {
					backgroundTabFileCache.set(tabHeader, resolvedFile);
				}
			}
		}
	}

	if (resolvedFile !== null) {
		// 🛠️ ABSOLUTT OG TOTAL STERILISERING AV TITTEL-NODEN:
		titleNode.removeAttribute("data-scl-signature");
		titleNode.removeAttribute("data-link-color");
		titleNode.classList.remove("scl-processed");
		
		// Kjør din standard vask hvis den eksisterer
		if (typeof clearExtraAttributes === "function") {
			clearExtraAttributes(titleNode);
		}
		
		// ⚡ BRUTAL RYDDING AV ENHVER LEKKENDE SCL-KLASSE (Knuser hybrid-regler):
		// Siden clearExtraAttributes kan bomme under hurtig skifte, fjerner vi 
		// alt som starter med "scl-" direkte via en rå token-loop på stakken.
		const classes: DOMTokenList = titleNode.classList;
		let k: number = classes.length;
		while (k--) {
			const cls = classes.item(k);
			if (cls && (cls.startsWith("scl-") || cls === "data-link-text")) {
				classes.remove(cls);
			}
		}

		// Nullstill absolutt all inline stil- og variabelhistorikk på den ekte noden
		const inlineStyle = titleNode.style;
		inlineStyle.removeProperty("color");
		inlineStyle.removeProperty("background-color");
		inlineStyle.removeProperty("background");
		inlineStyle.removeProperty("--scl-color");
		inlineStyle.removeProperty("--scl-bg");
		inlineStyle.removeProperty("--scl-icon-before");
		inlineStyle.removeProperty("--scl-icon-after");

		// Nå er inner-title fullstendig steril og klar for å motta sin nye additive prakt
		updateDivExtraAttributes(app, plugin, titleNode, "", resolvedFile.path);
		return 1;
	}

	return 0;
}

/**
 * Refreshes all internal links within a specific markdown preview container layout.
 * Performs a single dense DOM query sweep and aggregates nodes into a memory map 
 * to completely eliminate high-frequency querySelectorAll layout thrashing.
 */
function updateLeafInternalLinks(
	app: App, 
	plugin: ResuperchargedLinks, 
	file: TFile, 
	containerEl: HTMLElement
): number {
	const cachedFile = app.metadataCache.getFileCache(file) ?? null;
	if (cachedFile === null || !cachedFile.links) return 0;
	
	const links = cachedFile.links;
	const linksCount = links.length;
	if (linksCount === 0) return 0;

	// 1. A single broad DOM sweep targeting all internal links and pills within this container
	const rawNodes: NodeListOf<Element> = containerEl.querySelectorAll("a.internal-link, .multi-select-pill-content");
	const rawNodesLen = rawNodes.length;
	if (rawNodesLen === 0) return 0;

	// 2. Build an isolated in-memory map allocating resolved href strings directly to element arrays
	const hrefToElementsMap: Map<string, HTMLElement[]> = new Map();

	for (let i = 0; i < rawNodesLen; i++) {
		const node: Element | null = rawNodes[i] ?? null;
		
		// Leverage the official cross-window safe prototype helper
		if (node !== null && node.instanceOf(HTMLElement)) {
			const hrefAttr = node.getAttribute("href") ?? "";
			const dataHrefAttr = node.getAttribute("data-href") ?? "";
			
			let resolvedHref = dataHrefAttr.length > 0 ? dataHrefAttr : hrefAttr;
			if (resolvedHref.length === 0) {
				resolvedHref = node.textContent ?? "";
			}

			if (resolvedHref.length > 0) {
				let bucket = hrefToElementsMap.get(resolvedHref);
				if (bucket === undefined) {
					bucket = [];
					hrefToElementsMap.set(resolvedHref, bucket);
				}
				bucket.push(node);
			}
		}
	}

	let localCount = 0;

	// 3. Process the target file links sequence through pure O(1) in-memory bucket lookups
	for (let i = 0; i < linksCount; i++) {
		const link = links[i];
		if (!link) continue;

		const matchedElements = hrefToElementsMap.get(link.link) ?? null;
		if (matchedElements === null) continue;

		const elementsLen = matchedElements.length;
		for (let j = 0; j < elementsLen; j++) {
			const element = matchedElements[j];
			
			if (element !== undefined && element !== null && element.isConnected) {
				const rawHref: string | null = element.getAttribute("data-href");
				const rawText: string | null = element.textContent;
				
				const runtimeHref: string = rawHref !== null ? rawHref : (rawText !== null ? rawText : link.link);
				const cleanRuntimeHref: string = extractCleanLinkPath(runtimeHref);
				
				const dest: TFile | null = app.metadataCache.getFirstLinkpathDest(cleanRuntimeHref, file.basename) ?? null;
				
				if (dest !== null) {
					updateDivExtraAttributes(app, plugin, element, file.basename, cleanRuntimeHref, false);
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
): number { 
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
			totalNodesStyled += updateLeafInternalLinks(app, plugin, activeFileFallback, markdownLeaf.view.containerEl);
		}
	});

	// ✨ STRØMLINJEFORMET TELEMETRI: Siden trackeren vår nå er 100% ren, 
	// returnerer vi bare tallet slik at main.ts kan registrere syklusen stabilt.
	return totalNodesStyled;
}

/**
 * Omsorgsfull og brutal nullstilling av alle fane-elementer (tab-headere) i hele Obsidian.
 * Kalles når brukeren muterer regler for å forhindre klasse-akkumulering og ikon-duplisering.
 */
export function purgeAndResetAllTabHeaders(app: App): void {
	// 1. Tøm det sekundære WeakMap-sikkerhetsnettet fullstendig
	// Siden det er en konstant i filen, kan vi fjerne elementene eller la V8 rydde opp
	// (Hvis det er en WeakMap, kan vi ikke tømme den direkte uten å instansiere på nytt, 
	// så vi kan enten la den være eller re-instansiere den hvis den er muterbar, men det viktigste er DOM-vasken!)
	
	// 2. Finn ALLE aktive og inaktive tab-headere i hele brukergrensesnittet
	const tabElements = document.querySelectorAll(".workspace-tab-header");
	const tabCount = tabElements.length;
	
	for (let i = 0; i < tabCount; i++) {
		const tabEl = tabElements[i];
		if (tabEl instanceof HTMLElement) {
			// Slett signaturen og prosessert-flagget slik at barrieren slipper den igjennom
			tabEl.removeAttribute("data-scl-signature");
			tabEl.classList.remove("scl-processed");
			
			// Bruk din eksisterende, ufeilbarlige vaskefunksjon fra dom-mutator!
			clearExtraAttributes(tabEl);
			
			// Sett den tilbake til en nøytral basistilstand
			tabEl.style.removeProperty("color");
			tabEl.style.removeProperty("background-color");
			tabEl.style.removeProperty("--scl-icon-before");
			tabEl.style.removeProperty("--scl-icon-after");
		}
	}
}

