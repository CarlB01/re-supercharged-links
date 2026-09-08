
// Import core workflows and mutators from our re-architected system
import { updatePropertiesPane, updateContainer } from "../views/view-updaters";
import { clearExtraAttributes } from "../processors/link-mutator";
import { isHtmlElement } from "../utils/string-utils";
import ResuperchargedLinks from "../main";

// Thread-safe map to keep track of debounced animation frame animation handles per container
const scheduledContainerUpdates = new WeakMap<HTMLElement, number>();

/**
 * Schedules a high-performance DOM update bound to the browser's repaint cycle.
 * Prevents layout thrashing by collapsing multiple rapid mutations into a single frame.
 */
function scheduleContainerUpdate(container: HTMLElement, fn: () => void): void {
	const prev = scheduledContainerUpdates.get(container);
	if (prev !== undefined) cancelAnimationFrame(prev);

	const id = requestAnimationFrame(() => {
		scheduledContainerUpdates.delete(container);
		fn();
	});
	scheduledContainerUpdates.set(container, id);
}

/**
 * RE-ARCHITECTED OBSERVATION CONTROLLER: 
 * Safely provisions isolated trackers across all registered active pane layouts.
 */
export function initViewObservers(plugin: ResuperchargedLinks): void {
	// Disconnect existing lifecycles to prevent memory leaks during reload/layout changes
	if (plugin.observers) {
		plugin.observers.forEach(([observer]) => observer.disconnect());
	}
	plugin.observers = [];

	// Register core Obsidian native leaf views
	registerViewType("backlink", plugin, ".tree-item-inner", true);
	registerViewType("outgoing-link", plugin, ".tree-item-inner", true);
	registerViewType("search", plugin, ".tree-item-inner");
	registerViewType("starred", plugin, ".nav-file-title-content");
	registerViewType("file-explorer", plugin, ".nav-file-title-content");
	registerViewType("recent-files", plugin, ".nav-file-title-content");
	registerViewType("bookmarks", plugin, ".tree-item-inner", false, true);
	registerViewType("file-properties", plugin, "div.internal-link > .multi-select-pill-content");

	// Obsidian Bases Third-Party Compatibility
	if (plugin.settings.enableBases) {
		registerViewType("bases", plugin, "span.internal-link, .internal-link[data-href], [data-href].internal-link");
		registerViewType(
			"markdown",
			plugin,
			".base-view span.internal-link, .bases-view span.internal-link, .base-view .internal-link[data-href], .bases-view .internal-link[data-href]"
		);
	}

	// Ecosystem Integration: Intercept popular third-party plugins safely
	const pluginRegistry = (plugin.app as any)?.plugins?.plugins;
	if (pluginRegistry?.breadcrumbs) {
		registerViewType("bc-matrix-view", plugin, "span.internal-link");
		registerViewType("BC-ducks", plugin, ".internal-link");
		registerViewType("bc-tree-view", plugin, "span.internal-link");
		registerViewType("markdown", plugin, ".BC-page-views span.internal-link, .BC-codeblock-tree span.internal-link, .nodes a.internal-link");
	}
	if (pluginRegistry?.["folder-notes"]) {
		registerViewType("file-explorer", plugin, ".has-folder-note .tree-item-inner");
	}
	if (pluginRegistry?.["similar-notes"]) {
		registerViewType("markdown", plugin, ".similar-notes-pane .tree-item-inner", true);
	}
	if (pluginRegistry?.["notebook-navigator"]) {
		registerViewType("notebook-navigator", plugin, "span.nn-shortcut-label");
		registerViewType("notebook-navigator", plugin, "div.nn-file-name");
	}

	// Special Handler: Setup isolated listener for the Native File Metadata Properties Panel
	const propertyLeaves = plugin.app.workspace.getLeavesOfType("file-properties");
	propertyLeaves.forEach((leaf, idx) => {
		const container = leaf?.view?.containerEl;
		if (!container) return;

		const observer = new window.MutationObserver(() => {
			const activeFile = plugin.app.workspace.getActiveFile();
			if (activeFile) updatePropertiesPane(container, activeFile, plugin.app, plugin);
		});

		observer.observe(container, { subtree: true, childList: true, attributes: false });
		plugin.observers.push([observer, `file-properties-${idx}`, ""]);
	});
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
	const leaves = plugin.app.workspace.getLeavesOfType(viewTypeName);
	leaves.forEach((leaf, idx) => {
		const container = leaf?.view?.containerEl;
		if (!container) return;

		if (updateDynamic) {
			watchContainerDynamic(`${viewTypeName}-${idx}`, container, plugin, selector);
		} else {
			watchContainer(`${viewTypeName}-${idx}`, container, plugin, selector, filterCollapsible);
		}
	});
}

/**
 * SUGGESTION POPUP & MODAL CONTROLLER
 * Listens to document injections to style the Quick Switcher, Omnisearch, and Link Suggestor popups.
 */
export function initModalObservers(plugin: ResuperchargedLinks, doc: Document): void {
	const config = { subtree: false, childList: true, attributes: false };

	const observer = new window.MutationObserver(records => {
		for (let i = 0; i < records.length; i++) {
			const mutation = records[i];
			if (!mutation || mutation.type !== "childList") continue;

			// Handle elements injected into the DOM core layout
			mutation.addedNodes.forEach(node => {
				if (isHtmlElement(node)) {
					const list = node.classList;
					
					// Safe structural mapping via classList to prevent substring mismatch bugs
					const isModal = list.contains("modal-container") && plugin.settings.enableQuickSwitcher;
					const isSuggest = list.contains("suggestion-container") && plugin.settings.enableSuggestor;

					if (isModal || isSuggest) {
						let selector = ".suggestion-title, .suggestion-note, .another-quick-switcher__item__title, .omnisearch-result__title > span";
						if (list.contains("suggestion-container")) {
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
	const observer = new window.MutationObserver((records) => {
		// Performance Gold: Short-circuit frame invocation if mutations don't change child arrays
		const hasRelevantMutation = records.some(
			(m) => m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)
		);
		if (!hasRelevantMutation) return;

		scheduleContainerUpdate(container, () => {
			updateContainer(container, plugin, selector, filterCollapsible);
		});
	});

	observer.observe(container, { subtree: true, childList: true, attributes: false });
	if (viewType) plugin.observers.push([observer, viewType, selector]);
}

/**
 * High-frequency dynamic observer built for rapidly updating arrays like backlink layouts.
 */
function watchContainerDynamic(
	viewType: string,
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string,
	parentClass = "tree-item"
): void {
	if (!plugin.settings.enableBacklinks) return;

	const observer = new window.MutationObserver((records) => {
		let shouldRun = false;

		for (let i = 0; i < records.length; i++) {
			const mutation = records[i];
			if (!mutation || mutation.type !== "childList" || mutation.addedNodes.length === 0) continue;

			// Check if the added nodes match the required target structural class
			mutation.addedNodes.forEach((node) => {
				if ((isHtmlElement(node)) && node.classList.contains(parentClass)) {
					shouldRun = true;
				}
			});

			if (shouldRun) break; // Escape loop early if condition is met
		}

		if (!shouldRun) return;

		scheduleContainerUpdate(container, () => {
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
	if (plugin.observers) {
		plugin.observers.forEach(([observer]) => observer.disconnect());
	}
	if (plugin.modalObservers) {
		plugin.modalObservers.forEach(observer => observer.disconnect());
	}
}

/**
 * Resets the DOM state completely when the plugin is deactivated by the user.
 */
export function removeStylingFromViews(plugin: ResuperchargedLinks): void {
	if (!plugin.observers) return;

	plugin.observers.forEach(([_, type, ownClass]) => {
		const leaves = plugin.app.workspace.getLeavesOfType(type);
		leaves.forEach(leaf => {
			if (leaf?.view?.containerEl && ownClass) {
				const nodes = leaf.view.containerEl.findAll(ownClass);
				nodes.forEach(node => {
					if (isHtmlElement(node)) clearExtraAttributes(node);
				});
			}
		});
	});
}
