// src/core/event-registry.ts

import { App, debounce, TFile, TAbstractFile, MarkdownPostProcessorContext, WorkspaceWindow } from "obsidian";
import { initModalObservers, initViewObservers } from "../observers/observer-engine";
import { forceLivePreviewRefresh, updateElLinks, updateVisibleLinks } from "../rendering/workspace-renderer";
import ResuperchargedLinks from "./main";

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

	plugin.registerEvent(app.workspace.on("window-open", (win: WorkspaceWindow, windowObj: Window) => {
		const targetDoc: Document | null = win.doc ?? windowObj.document ?? null;
		if (targetDoc === null) return;

		if (targetDoc.body !== null) {
			initModalObservers(plugin, targetDoc);
		} else {
			targetDoc.addEventListener("DOMContentLoaded", () => {
				initModalObservers(plugin, targetDoc);
			}, { once: true });
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

	// handle light/dark mode changes
	plugin.registerEvent(app.workspace.on("css-change", (): void => {
		window.requestAnimationFrame((): void => {
			plugin.flyweightEngine.compileActiveAttributes();
			updateLinksDebounced(null);
			forceLivePreviewRefresh(app);
			if (plugin.settingTab?.containerEl?.isShown()) {
				plugin.settingTab.compilePaneStyles();
			}
		});
	}));
}
