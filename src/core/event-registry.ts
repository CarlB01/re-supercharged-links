// src/core/event-registry.ts

import { App, debounce, TFile, TAbstractFile, MarkdownPostProcessorContext } from "obsidian";
import { initModalObservers, initViewObservers } from "../observers/observer-engine";
import { updateElLinks, updateVisibleLinks } from "../rendering/workspace-renderer";
import ResuperchargedLinks from "./main";

interface ObsidianWindowInternal { getContainer(): { doc: Document; } | null; }

/**
 * Registers all upstream Obsidian core event hooks under a strict single-channel architecture.
 */
export function registerPluginEvents(app: App, plugin: ResuperchargedLinks): void {
	
	const updateLinksDebounced = debounce((_file: TFile | null) => {
		if (!app.workspace.layoutReady) return;

		plugin.cacheManager.clearAttrCycleCache();
		
		const trackingActive: boolean = plugin.telemetry.getTrackingState();
		const startMark: number = trackingActive ? Date.now() : 0;

		// Execute core static leaf rebuilds via our single source of truth reconciler
		updateVisibleLinks(app, plugin);

		if (trackingActive) {
			const elapsed: number = Date.now() - startMark;
			const nodesCount: number = plugin.telemetry.getTotalNodesEvaluated();
			plugin.telemetry.recordUpdateCycle(elapsed, nodesCount);
		}

	}, 200, false);

	plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		updateElLinks(app, plugin, el, ctx);
	});

	plugin.registerEvent(app.workspace.on("window-open", (win) => {
		const internalWin = win as unknown as ObsidianWindowInternal;
		if (internalWin !== null) {
			const container = internalWin.getContainer();
			if (container !== null && container.doc !== null) {
				initModalObservers(plugin, container.doc);
			}
		}
	}));

	plugin.registerEvent(app.workspace.on("layout-change", (): void => {
		initViewObservers(plugin);
		updateLinksDebounced(null);
	}));

	plugin.registerEvent(app.vault.on("rename", (file: TAbstractFile, oldPath: string): void => {
		plugin.cacheManager.processPathMutation(oldPath);
		plugin.cacheManager.processPathMutation(file.path);
		plugin.cacheManager.triggerScheduleRefresh();
	}));

	// Vault Operations - All filesystem alterations route into the single queue channel safely
	plugin.registerEvent(app.vault.on("modify", (file: TAbstractFile): void => {
		if (!(file instanceof TFile)) return;
		plugin.cacheManager.handlePathMutation(file.path);
	}));

	plugin.registerEvent(app.vault.on("delete", (file: TAbstractFile): void => {
		const path: string = file.path;
		if (path.length === 0) return;
		plugin.cacheManager.handlePathMutation(file.path);
	}));

	// Core Metadata Changed Hook
	plugin.registerEvent(app.metadataCache.on("changed", (file: TFile): void => {
		if (plugin.cacheManager.wasPathTouchedRecently(file.path)) return;
		plugin.cacheManager.enqueuePath(file.path);
		plugin.cacheManager.triggerScheduleRefresh();
	}));
}
