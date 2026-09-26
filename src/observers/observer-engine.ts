// observers/observer-engine

import { App, WorkspaceLeaf } from "obsidian";
import { clearExtraAttributes } from "../views/dom-mutator";
import { buildObserverKey, isHtmlElement } from "../utils/shared-utils";
import { updateContainer } from "../processors/dom-reconciler";
import ResuperchargedLinks from "../core/main";

interface ObsidianAppInternalRegistry {
	plugins: {
		plugins: Record<string, unknown>;
	};
}

const scheduledContainerUpdates: WeakMap<HTMLElement, number> = new WeakMap<HTMLElement, number>();
const observerRegistry: WeakMap<HTMLElement, Map<string, MutationObserver>> = new WeakMap<HTMLElement, Map<string, MutationObserver>>();
const modalObserverRegistry: WeakMap<Document, MutationObserver> = new WeakMap<Document, MutationObserver>();

function scheduleContainerUpdate(container: HTMLElement, fn: () => void): void {
	const prev: number | null = scheduledContainerUpdates.get(container) ?? null;
	if (prev !== null) {
		cancelAnimationFrame(prev);
	}

	const id: number = window.requestAnimationFrame((): void => {
		scheduledContainerUpdates.delete(container);
		fn();
	});
	scheduledContainerUpdates.set(container, id);
}

/**
 * Activates lightweight idempotent DOM observation controllers across workspace chunks.
 */
export function initViewObservers(plugin: ResuperchargedLinks): void {
	const pluginInstance: ResuperchargedLinks | null = plugin ?? null;
	if (pluginInstance === null) return;

	registerViewType("backlink", pluginInstance, ".tree-item-inner", true);
	registerViewType("outgoing-link", pluginInstance, ".tree-item-inner", true);
	registerViewType("search", pluginInstance, ".tree-item-inner");
	registerViewType("starred", pluginInstance, ".nav-file-title-content");
	registerViewType("file-explorer", pluginInstance, ".nav-file-title-content");
	registerViewType("recent-files", pluginInstance, ".nav-file-title-content");
	registerViewType("bookmarks", pluginInstance, ".tree-item-inner", false, true);
	registerViewType("tab-header", pluginInstance, ".tab-header-inner-title");
	
	registerViewType("mybrain-view", pluginInstance, ".focusable-note-link", true);

	// 🚀 HIGH PERFORMANCE INJECTION: Bases and Database tables registered as active dynamic streams
	registerViewType("bases", pluginInstance, "span.internal-link, .internal-link[data-href], [data-href].internal-link", true);
	registerViewType("markdown", pluginInstance, ".base-view span.internal-link, .bases-view span.internal-link, .base-view .internal-link[data-href], .bases-view .internal-link[data-href]");
	
	const internalApp = pluginInstance.app as App & ObsidianAppInternalRegistry;
	const pluginRegistry: Record<string, unknown> | null = internalApp.plugins?.plugins ?? null;
	
	if (pluginRegistry !== null) {
		if (pluginRegistry["breadcrumbs"]) {
			registerViewType("bc-matrix-view", pluginInstance, "span.internal-link");
			registerViewType("BC-ducks", pluginInstance, ".internal-link");
			registerViewType("bc-tree-view", pluginInstance, "span.internal-link");
		}
		if (pluginRegistry["folder-notes"]) {
			registerViewType("file-explorer", pluginInstance, ".has-folder-note .tree-item-inner");
		}
		if (pluginRegistry["notebook-navigator"]) {
			registerViewType("notebook-navigator", pluginInstance, "span.nn-shortcut-label");
			registerViewType("notebook-navigator", pluginInstance, "div.nn-file-name");
		}
	}
}

export function registerViewType(
	viewTypeName: string,
	plugin: ResuperchargedLinks,
	selector: string,
	updateDynamic = false,
	filterCollapsible = false
): void {
	const leaves: WorkspaceLeaf[] = plugin.app.workspace.getLeavesOfType(viewTypeName) ?? [];
	const leavesCount = leaves.length;

	for (let i = 0; i < leavesCount; i++) {
		const leaf: WorkspaceLeaf | null = leaves[i] ?? null;
		const container: HTMLElement | null = leaf?.view?.containerEl ?? null;
		if (container === null) continue;

		const uniqueViewKey: string = buildObserverKey(viewTypeName, i);
		const observerKey = `${uniqueViewKey}|${selector}|${filterCollapsible ? "1" : "0"}|${updateDynamic ? "dynamic" : "static"}`;

		const reg: Map<string, MutationObserver> | null = observerRegistry.get(container) ?? null;
		if (reg !== null && reg.has(observerKey)) {
			continue;
		}

		if (updateDynamic) {
			watchContainerDynamic(uniqueViewKey, observerKey, container, plugin, selector);
		} else {
			watchContainer(uniqueViewKey, observerKey, container, plugin, selector, filterCollapsible);
		}
	}
}

/**
 * Handles popup switchers, suggestion layers, and native property panel layout injections.
 */
export function initModalObservers(plugin: ResuperchargedLinks, doc: Document): void {
	const existing: MutationObserver | null = modalObserverRegistry.get(doc) ?? null;
	if (existing !== null) {
		existing.disconnect();
		modalObserverRegistry.delete(doc);

		const idx: number = plugin.modalObservers.indexOf(existing);
		if (idx >= 0) {
			plugin.modalObservers.splice(idx, 1);
		}
	}

	const config: MutationObserverInit = { subtree: true, childList: true, attributes: false };

	const observer: MutationObserver = new window.MutationObserver((records: MutationRecord[]): void => {
		const recordsCount = records.length;
		for (let i = 0; i < recordsCount; i++) {
			const mutation: MutationRecord | null = records[i] ?? null;
			if (mutation === null || mutation.type !== "childList") continue;

			mutation.addedNodes.forEach((node: Node): void => {
				if (isHtmlElement(node)) {
					const list: DOMTokenList = node.classList;

					const isModal: boolean = list.contains("modal-container");
					const isSuggest: boolean = list.contains("suggestion-container");
					const isHoverPopup: boolean = list.contains("popover");

					if (isModal || isSuggest || isHoverPopup) {
						let selector = ".suggestion-title, .suggestion-note, .another-quick-switcher__item__title, .omnisearch-result__title > span, div.multi-select-pill-content, div.metadata-link-inner";
						if (isSuggest) {
							selector = ".suggestion-title, .suggestion-note";
						}

						updateContainer(node, plugin, selector);
						
						const modalKey = `modal-observer-${selector}`;
						watchContainer(null, modalKey, node, plugin, selector);
					}

					const isPropertySection: boolean = list.contains("metadata-container") || list.contains("metadata-content") || node.querySelector(".metadata-properties") !== null;
					if (isPropertySection) {
						const propertySelector = "div.multi-select-pill-content, div.metadata-link-inner";
						updateContainer(node, plugin, propertySelector);
						
						const propertyKey = `property-panel-observer-${propertySelector}`;
						watchContainer(null, propertyKey, node, plugin, propertySelector);
					}
				}
			});
		}
	});

	observer.observe(doc.body, config);
	modalObserverRegistry.set(doc, observer);
	plugin.modalObservers.push(observer);
}

function watchContainer(
	viewType: string | null,
	observerKey: string,
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string,
	filterCollapsible = false
): void {
	disconnectExistingObserver(container, observerKey);

	const observer: MutationObserver = new window.MutationObserver((records: MutationRecord[]): void => {
		const recordsCount = records.length;
		let relevantChangeDetected = false;

		for (let i = 0; i < recordsCount; i++) {
			const m: MutationRecord | null = records[i] ?? null;
			if (m !== null && m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
				relevantChangeDetected = true;
				break;
			}
		}
		if (!relevantChangeDetected) return;

		scheduleContainerUpdate(container, (): void => {
			updateContainer(container, plugin, selector, filterCollapsible);
		});
	});

	observer.observe(container, { subtree: true, childList: true, attributes: false });
	registerObserver(container, observerKey, observer);

	if (viewType !== null) {
		plugin.observers.push([observer, viewType, selector]);
	}
}

/**
 * High-performance progressive element observer for intense layout surfaces like Databaser/Bases.
 * Extracts specific mutated DOM nodes directly and schedules updates smoothly via requestAnimationFrame.
 */
function watchContainerDynamic(
	viewType: string,
	observerKey: string,
	container: HTMLElement,
	plugin: ResuperchargedLinks,
	selector: string
): void {
	disconnectExistingObserver(container, observerKey);

	const observer: MutationObserver = new window.MutationObserver((records: MutationRecord[]): void => {
		const recordsCount = records.length;
		const deltaElements: HTMLElement[] = [];

		for (let i = 0; i < recordsCount; i++) {
			const m: MutationRecord | null = records[i] ?? null;
			if (m !== null && m.type === "childList") {
				const addedLen: number = m.addedNodes.length;
				for (let j = 0; j < addedLen; j++) {
					const node: Node | null = m.addedNodes.item(j);
					if (node !== null && node.nodeType === 1) {
						const el = node as HTMLElement;
						if (el.matches(selector)) {
							deltaElements.push(el);
						} else {
							const matches: HTMLElement[] = typeof el.findAll === "function" 
								? (el.findAll(selector) ?? []) 
								: Array.from(el.querySelectorAll(selector));
								
							const matchesCount: number = matches.length;
							for (let k = 0; k < matchesCount; k++) {
								const matchedChild: HTMLElement | null = matches[k] ?? null;
								if (matchedChild !== null && matchedChild.nodeType === 1) {
									deltaElements.push(matchedChild);
								}
							}
						}
					}
				}
			}
		}
		
		if (deltaElements.length === 0) return;

		// 🚀 FIKSET: Samler opp mutasjonene synkront med skjermoppdateringen (0.00ms-magien)
		// I stedet for å kaste nodene blindt inn i tråden med en gang, lar vi scheduleContainerUpdate styre tempoet!
		scheduleContainerUpdate(container, (): void => {
			updateContainer(container, plugin, selector, false, deltaElements);
		});
	});

	observer.observe(container, { subtree: true, childList: true, attributes: false });
	registerObserver(container, observerKey, observer);
	plugin.observers.push([observer, viewType, selector]);
}


export function disconnectAllObservers(plugin: ResuperchargedLinks): void {
	const activeObservers: [MutationObserver, string, string][] = plugin.observers || [];
	const activeObserversCount = activeObservers.length;

	for (let i = 0; i < activeObserversCount; i++) {
		const entry: [MutationObserver, string, string] | null = activeObservers[i] ?? null;
		if (entry !== null) {
			const observer: MutationObserver | null = entry[0] ?? null;
			if (observer !== null) {
				observer.disconnect();
			}
		}
	}

	const modalObservers: MutationObserver[] = plugin.modalObservers || [];
	const modalObserversCount = modalObservers.length;

	for (let i = 0; i < modalObserversCount; i++) {
		const observer: MutationObserver | null = modalObservers[i] ?? null;
		if (observer !== null) {
			observer.disconnect();
		}
	}

	const rootDoc: Document = document;
	modalObserverRegistry.delete(rootDoc);

	plugin.observers = [];
	plugin.modalObservers = [];
}

export function removeStylingFromViews(plugin: ResuperchargedLinks): void {
	const activeObservers: [MutationObserver, string, string][] = plugin.observers || [];
	const activeObserversCount = activeObservers.length;

	for (let i = 0; i < activeObserversCount; i++) {
		const entry: [MutationObserver, string, string] | null = activeObservers[i] ?? null;
		if (entry === null) continue;

		const type: string = entry[1] ?? "";
		const ownClass: string = entry[2] ?? "";

		if (type.length === 0 || ownClass.length === 0) continue;

		const leaves: WorkspaceLeaf[] = plugin.app.workspace.getLeavesOfType(type) ?? [];
		const leavesCount = leaves.length;

		for (let j = 0; j < leavesCount; j++) {
			const leaf: WorkspaceLeaf | null = leaves[j] ?? null;
			if (leaf !== null && leaf.view?.containerEl) {
				const nodes: HTMLElement[] = leaf.view.containerEl.findAll(ownClass) ?? [];
				const nodesCount = nodes.length;

				for (let k = 0; k < nodesCount; k++) {
					const node: HTMLElement | null = nodes[k] ?? null;
					if (node !== null && node.nodeType === 1) {
						clearExtraAttributes(node);
					}
				}
			}
		}
	}
}

function getContainerRegistry(container: HTMLElement): Map<string, MutationObserver> {
	const existing: Map<string, MutationObserver> | null = observerRegistry.get(container) ?? null;
	if (existing !== null) return existing;

	const created: Map<string, MutationObserver> = new Map<string, MutationObserver>();
	observerRegistry.set(container, created);
	return created;
}

function disconnectExistingObserver(container: HTMLElement, observerKey: string): void {
	const reg: Map<string, MutationObserver> = getContainerRegistry(container);
	const existing: MutationObserver | null = reg.get(observerKey) ?? null;
	if (existing !== null) {
		existing.disconnect();
		reg.delete(observerKey);
	}
}

function registerObserver(container: HTMLElement, observerKey: string, observer: MutationObserver): void {
	const reg: Map<string, MutationObserver> = getContainerRegistry(container);
	reg.set(observerKey, observer);
}
