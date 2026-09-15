// lifecycle/observation

import { App, TFile, WorkspaceLeaf } from "obsidian";
import { updatePropertiesPane, updateContainer } from "../views/view-updaters";
import { clearExtraAttributes } from "../processors/link-mutator";
import { isHtmlElement, buildObserverKey } from "../utils/string-utils";
import ResuperchargedLinks from "../main";

interface ObsidianAppInternalRegistry {
	plugins?: {
		plugins?: Record<string, unknown>;
	};
}

const scheduledContainerUpdates: WeakMap<HTMLElement, number> = new WeakMap<HTMLElement, number>();

/**
 * Schedules a high-performance DOM update bound to the browser's repaint cycle.
 * Prevents layout thrashing by collapsing multiple rapid mutations into a single frame.
 */
function scheduleContainerUpdate(container: HTMLElement, fn: () => void): void {
	const prev: number | undefined = scheduledContainerUpdates.get(container);
	if (prev !== undefined) {
		cancelAnimationFrame(prev);
	}

	const id: number = window.requestAnimationFrame((): void => {
		scheduledContainerUpdates.delete(container);
		fn();
	});
	scheduledContainerUpdates.set(container, id);
}

/**
 * RE-ARCHITECTED OBSERVATION CONTROLLER
 * Synchronously activates styling engines globally across all known Obsidian boundaries.
 * ⚡ AUTO-DETECTION PROTOCOL: Automatically maps and hooks active third-party extensions on boot.
 */
export function initViewObservers(plugin: ResuperchargedLinks): void {
	const pluginInstance: ResuperchargedLinks | null = plugin ?? null;
	if (pluginInstance === null) return;

	const activeObservers: [MutationObserver, string, string][] = pluginInstance.observers ?? [];
	for (let i: number = 0; i < activeObservers.length; i++) {
		const entry: [MutationObserver, string, string] | null = activeObservers[i] ?? null;
		if (entry !== null) {
			entry[0].disconnect();
		}
	}
	pluginInstance.observers = [];

	// =========================================================================
	// 🎯 LAYER 1: UNIVERSAL OBSERVATION CHANNELS (Always Active - 100% Automatic)
	// =========================================================================
	registerViewType("backlink", pluginInstance, ".tree-item-inner", true);
	registerViewType("outgoing-link", pluginInstance, ".tree-item-inner", true);
	registerViewType("search", pluginInstance, ".tree-item-inner");
	registerViewType("starred", pluginInstance, ".nav-file-title-content");
	registerViewType("file-explorer", pluginInstance, ".nav-file-title-content");
	registerViewType("recent-files", pluginInstance, ".nav-file-title-content");
	registerViewType("bookmarks", pluginInstance, ".tree-item-inner", false, true);
	registerViewType("file-properties", pluginInstance, "div.internal-link.multi-select-pill-content");
	registerViewType("tab-header", pluginInstance, ".tab-header-inner-title");

	// 🧠 Layer 2: Deep myBrain Integration Handshake
	registerViewType("mybrain-view", pluginInstance, ".focusable-note-link", true);

	// 🔌 Layer 3: Universal Third-Party Ecosystem Mapping (Bases, Breadcrumbs, etc.)
	// By registering these unconditionally, we guarantee stability across all workspace layouts
	registerViewType("bases", pluginInstance, "span.internal-link, .internal-link[data-href], [data-href].internal-link");
	registerViewType("markdown", pluginInstance, ".base-view span.internal-link, .bases-view span.internal-link, .base-view .internal-link[data-href], .bases-view .internal-link[data-href]");
	
	const internalApp = pluginInstance.app as App & ObsidianAppInternalRegistry;
	const pluginRegistry: Record<string, unknown> | null = internalApp.plugins?.plugins ?? null;
	
	if (pluginRegistry !== null) {
		if (pluginRegistry["breadcrumbs"]) {
			registerViewType("bc-matrix-view", pluginInstance, "span.internal-link");
			registerViewType("BC-ducks", pluginInstance, ".internal-link");
			registerViewType("bc-tree-view", pluginInstance, "span.internal-link");
			registerViewType("markdown", pluginInstance, ".BC-page-views span.internal-link, .BC-codeblock-tree span.internal-link, .nodes a.internal-link");
		}
		if (pluginRegistry["folder-notes"]) {
			registerViewType("file-explorer", pluginInstance, ".has-folder-note .tree-item-inner");
		}
		if (pluginRegistry["similar-notes"]) {
			registerViewType("markdown", pluginInstance, ".similar-notes-pane .tree-item-inner", true);
		}
		if (pluginRegistry["notebook-navigator"]) {
			registerViewType("notebook-navigator", pluginInstance, "span.nn-shortcut-label");
			registerViewType("notebook-navigator", pluginInstance, "div.nn-file-name");
		}
	}

	// =========================================================================
	// 🔑 LAYER 4: FAST-TRACK SYNCHRONOUS PROPERTIES PANE RE-PAINT
	// =========================================================================
	const propertyLeaves: WorkspaceLeaf[] = pluginInstance.app.workspace.getLeavesOfType("file-properties") ?? [];
	for (let i: number = 0; i < propertyLeaves.length; i++) {
		const leaf: WorkspaceLeaf | null = propertyLeaves[i] ?? null;
		const container: HTMLElement | null = leaf?.view?.containerEl ?? null;
		if (container === null) continue;

		const activeFile: TFile | null = pluginInstance.app.workspace.getActiveFile();
		if (activeFile !== null) {
			updatePropertiesPane(container, activeFile, pluginInstance.app, pluginInstance);
		}
	}
}


/**
 * Automates query lookups and binds native view leaf trees to mutation watchers.
 */
export function registerViewType(
	viewTypeName: string,
	plugin: ResuperchargedLinks,
	selector: string,
	updateDynamic = false,
	filterCollapsible = false
): void {
	const leaves: WorkspaceLeaf[] = plugin.app.workspace.getLeavesOfType(viewTypeName) ?? [];
	for (let i: number = 0; i < leaves.length; i++) {
		const leaf: WorkspaceLeaf | null = leaves[i] ?? null;
		const container: HTMLElement | null = leaf?.view?.containerEl ?? null;
		if (container === null) continue;

		const uniqueViewKey: string = buildObserverKey(viewTypeName, i);

		if (updateDynamic) {
			watchContainerDynamic(uniqueViewKey, container, plugin, selector);
		} else {
			watchContainer(uniqueViewKey, container, plugin, selector, filterCollapsible);
		}
	}
}

/**
 * SUGGESTION POPUP & MODAL CONTROLLER
 * Listens to document injections to style the Quick Switcher, Omnisearch, and Link Suggestor popups.
 * ⚡ STRIPPED TOGGLES: Removed obsolete enableQuickSwitcher and enableSuggestor toggles.
 * The styling now dynamically penetrates all active suggestion modales natively.
 */
export function initModalObservers(plugin: ResuperchargedLinks, doc: Document): void {
	const config: MutationObserverInit = { subtree: false, childList: true, attributes: false };

	const observer: MutationObserver = new window.MutationObserver((records: MutationRecord[]): void => {
		for (let i: number = 0; i < records.length; i++) {
			const mutation: MutationRecord | null = records[i] ?? null;
			if (mutation === null || mutation.type !== "childList") continue;

			mutation.addedNodes.forEach((node: Node): void => {
				if (isHtmlElement(node)) {
					const list: DOMTokenList = node.classList;
					
					// 🔑 UNIVERSAL ADMISSION: If the injected DOM node is a modal or a suggestion drop, process it instantly
					const isModal: boolean = list.contains("modal-container");
					const isSuggest: boolean = list.contains("suggestion-container");

					if (isModal || isSuggest) {
						let selector = ".suggestion-title, .suggestion-note, .another-quick-switcher__item__title, .omnisearch-result__title > span";
						if (isSuggest) {
							selector = ".suggestion-title, .suggestion-note";
						}
						
						updateContainer(node, plugin, selector);
						watchContainer(null, node, plugin, selector);
					}
				}
			});
		}
	});

	plugin.modalObservers.push(observer);
	observer.observe(doc.body, config);
}


/**
 * Standard tree observer that monitors static elements for layout additions or tree drops.
 */
function watchContainer(
	viewType: string | null,
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string,
	filterCollapsible = false
): void {
	const observer: MutationObserver = new window.MutationObserver((records: MutationRecord[]): void => {
		const hasRelevantMutation: boolean = records.some(
			(m: MutationRecord): boolean => m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)
		);
		if (!hasRelevantMutation) return;

		scheduleContainerUpdate(container, (): void => {
			updateContainer(container, plugin, selector, filterCollapsible);
		});
	});

	observer.observe(container, { subtree: true, childList: true, attributes: false });
	if (viewType !== null) {
		plugin.observers.push([observer, viewType, selector]);
	}
}

/**
 * High-frequency dynamic observer built for rapidly updating arrays like backlink layouts.
 * 🔑 ATOMIC PURGE: Completely removed obsolete 'enableBacklinks' configuration check.
 * Dynamic layout adjustments now execute globally and natively across all backlink trees.
 */
function watchContainerDynamic(
	viewType: string,
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string
): void {
	const observer: MutationObserver = new window.MutationObserver((records: MutationRecord[]): void => {
		const hasRelevantMutation: boolean = records.some(
			(m: MutationRecord): boolean => m.type === "childList" && m.addedNodes.length > 0
		);
		if (!hasRelevantMutation) return;

		scheduleContainerUpdate(container, (): void => {
			updateContainer(container, plugin, selector);
		});
	});

	observer.observe(container, { subtree: true, childList: true, attributes: false });
	plugin.observers.push([observer, viewType, selector]);
}

/**
 * Tears down all global tracking loops to ensure zero background leaks during plugin unload cycles.
 */
export function disconnectAllObservers(plugin: ResuperchargedLinks): void {
	const activeObservers: [MutationObserver, string, string][] = plugin.observers ?? [];
	for (let i: number = 0; i < activeObservers.length; i++) {
		const entry: [MutationObserver, string, string] | null = activeObservers[i] ?? null;
		if (entry !== null) {
			const observer: MutationObserver | null = entry[0] ?? null;
			if (observer !== null) {
				observer.disconnect();
			}
		}
	}

	const modalObservers: MutationObserver[] = plugin.modalObservers ?? [];
	for (let i: number = 0; i < modalObservers.length; i++) {
		const observer: MutationObserver | null = modalObservers[i] ?? null;
		if (observer !== null) {
			observer.disconnect();
		}
	}
}

/**
 * Resets the DOM state completely when the plugin is deactivated by the user.
 */
export function removeStylingFromViews(plugin: ResuperchargedLinks): void {
	const activeObservers: [MutationObserver, string, string][] = plugin.observers ?? [];
	for (let i: number = 0; i < activeObservers.length; i++) {
		const entry: [MutationObserver, string, string] | null = activeObservers[i] ?? null;
		if (entry === null) continue;

		const type: string = entry[1] ?? "";
		const ownClass: string = entry[2] ?? "";

		if (type.length === 0 || ownClass.length === 0) continue;

		const leaves: WorkspaceLeaf[] = plugin.app.workspace.getLeavesOfType(type) ?? [];
		for (let j: number = 0; j < leaves.length; j++) {
			const leaf: WorkspaceLeaf | null = leaves[j] ?? null;
			if (leaf !== null && leaf.view?.containerEl) {
				const nodes: HTMLElement[] = leaf.view.containerEl.findAll(ownClass) ?? [];
				for (let k: number = 0; k < nodes.length; k++) {
					const node: HTMLElement | null = nodes[k] ?? null;
					if (node !== null && isHtmlElement(node)) {
						clearExtraAttributes(node);
					}
				}
			}
		}
	}
}
