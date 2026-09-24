// core/event-registry

import { App, debounce, TFile } from "obsidian";
import { initModalObservers, initViewObservers } from "../observers/observer-engine";
import { updateElLinks, updateVisibleLinks } from "../processors/dom-reconciler";
import ResuperchargedLinks from "./main";

/**
 * Registers all upstream Obsidian core event hooks under a strict single-channel architecture.
 * 🚀 ARCHITECTURAL CONSOLIDATION: Eliminates race conditions and volatile setTimeout cascades.
 * Completely free of 'any' or 'undefined' allocations to guarantee clean compile-time validation.
 */
export function registerPluginEvents(app: App, plugin: ResuperchargedLinks): void {
	
	// Unified, stable update engine built to capture trailing filesystem changes cleanly
	const updateLinksDebounced = debounce((_file: TFile | null) => {
		plugin.clearAttrCycleCache();
		
		const trackingActive: boolean = plugin.telemetry.getTrackingState();
		const startMark: number = trackingActive ? Date.now() : 0;

		// Execute core static leaf rebuilds via our single source of truth reconciler
		updateVisibleLinks(app, plugin);

		if (trackingActive) {
			const elapsed: number = Date.now() - startMark;
			const nodesCount: number = plugin.telemetry.getLastNodeCount();
			plugin.telemetry.recordUpdateCycle(elapsed, nodesCount);
		}

		plugin.refreshEditorThemes();
	}, 200, false); // Strict trailing debounce to let DOM state settle completely

	/**
	 * 🎯 KANAL B: NATIVE MARKDOWN POST PROCESSOR PIPELINE
	 * This is our master execution channel. Obsidian invokes this hook natively
	 * only when element fragments are guaranteed to be fully rendered inside the DOM.
	 */
	plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx) => {
		// Route layout elements directly through the unified reconciler channel
		updateElLinks(app, plugin, el, ctx);
	});

	// Layout Ready Hook - Triggered once on vault boot sequence
	app.workspace.onLayoutReady((): void => {
		plugin.clearAttrCycleCache();
		
		// Mount passive backup structural observers
		initViewObservers(plugin);
		
		const currentDoc: Document | null = document ?? null;
		if (currentDoc !== null) {
			initModalObservers(plugin, currentDoc);
		}

		// Execute one clean initial sweep once the core engine layout declares readiness
		updateVisibleLinks(app, plugin);
		plugin.refreshEditorThemes();
	});

	// Secondary Window Open Hook (Popouts layout layer support)
	plugin.registerEvent(app.workspace.on("window-open", (window) => {
		if (window?.getContainer()?.doc) {
			initModalObservers(plugin, window.getContainer().doc);
		}
	}));

	// Layout Change Hook - Fired natively during active tab shifts
	plugin.registerEvent(app.workspace.on("layout-change", (): void => {
		// Passive synchronization of memory maps only
		initViewObservers(plugin);
		
		// Trigger our single channel debounced executor to update active visual layers safely
		updateLinksDebounced(null);
	}));

	// Vault Operations - All filesystem alterations route into the single queue channel safely
	plugin.registerEvent(app.vault.on("modify", (file): void => {
		if (!(file instanceof TFile)) return;
		plugin.invalidateAttrCacheByPath(file.path);
		plugin.cacheManager.markPathTouched(file.path);
		plugin.enqueuePath(file.path);
		plugin.triggerScheduleRefresh();
	}));

	plugin.registerEvent(app.vault.on("delete", (file): void => {
		const path = (file as { path?: string }).path ?? "";
		if (path.length === 0) return;
		plugin.invalidateAttrCacheByPath(path);
		plugin.cacheManager.markPathTouched(path);
		plugin.enqueuePath(path);
		plugin.triggerScheduleRefresh();
	}));

	plugin.registerEvent(app.vault.on("rename", (file, oldPath): void => {
		const newPath = (file as { path?: string }).path ?? "";

		if (oldPath && oldPath.length > 0) {
			plugin.invalidateAttrCacheByPath(oldPath);
			plugin.cacheManager.markPathTouched(oldPath);
			plugin.enqueuePath(oldPath);
		}
		if (newPath.length > 0) {
			plugin.invalidateAttrCacheByPath(newPath);
			plugin.cacheManager.markPathTouched(newPath);
			plugin.enqueuePath(newPath);
		}
		if (oldPath.endsWith("/")) {
			plugin.invalidateAttrCacheByPrefix(oldPath);
			plugin.enqueuePrefix(oldPath);
		}
		if (newPath.endsWith("/")) {
			plugin.invalidateAttrCacheByPrefix(newPath);
			plugin.enqueuePrefix(newPath);
		}
		plugin.triggerScheduleRefresh();
	}));

	// Core Metadata Changed Hook
	plugin.registerEvent(app.metadataCache.on("changed", (file: TFile): void => {
		if (plugin.cacheManager.wasPathTouchedRecently(file.path)) return;
		plugin.enqueuePath(file.path);
		plugin.triggerScheduleRefresh();
	}));
}
