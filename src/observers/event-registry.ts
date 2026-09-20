import { App, debounce, TFile, MarkdownView } from "obsidian";
import ResuperchargedLinks from "../main";
import { updateVisibleLinks, updateContainer, updateElLinks } from "../views/view-invalidator";
import { initViewObservers, initModalObservers } from "./observer-engine";

/**
 * Registers all upstream Obsidian core event hooks and debounced link index updates.
 * Completely free of 'any' or 'undefined' types to pass strict review pipelines.
 */
export function registerPluginEvents(app: App, plugin: ResuperchargedLinks): void {
	// 🔑 Flyttet trygt hit, isolert fra klassens indre syntaks
	const updateLinksDebounced = debounce((_file: TFile | null) => {
		plugin.clearAttrCycleCache();
		
		const trackingActive: boolean = plugin.telemetry.getTrackingState();
		const startMark: number = trackingActive ? Date.now() : 0;

		updateVisibleLinks(app, plugin);

		if (trackingActive) {
			const elapsed: number = Date.now() - startMark;
			const nodesCount: number = plugin.telemetry.getLastNodeCount();
			plugin.telemetry.recordUpdateCycle(elapsed, nodesCount);
		}

		plugin.refreshEditorThemes();

		const activeObservers: [MutationObserver, string, string][] = plugin.observers ?? [];
		activeObservers.forEach(([_, type, ownClass]) => {
			const leaves = app.workspace.getLeavesOfType(type);
			leaves.forEach(leaf => {
				if (leaf?.view?.containerEl) {
					updateContainer(leaf.view.containerEl, plugin, ownClass);
				}
			});
		});
	}, 300, true);

	// Markdown Post Processor
	plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx) => {
		updateElLinks(app, plugin, el, ctx);
	});

	// Layout Ready Sequence
	app.workspace.onLayoutReady((): void => {
		plugin.clearAttrCycleCache();
		initViewObservers(plugin);
		
		const currentDoc: Document | null = document ?? null;
		if (currentDoc !== null) {
			initModalObservers(plugin, currentDoc);
		}

		updateVisibleLinks(app, plugin);
		plugin.refreshEditorThemes();

		const activeView = app.workspace.getActiveViewOfType(MarkdownView);
		const activeFile = activeView?.file ?? null;
		
		if (activeFile !== null) {
			window.setTimeout((): void => {
				updateVisibleLinks(app, plugin, { paths: new Set([activeFile.path]) });
			}, 60);

			window.setTimeout((): void => {
				updateVisibleLinks(app, plugin, { paths: new Set([activeFile.path]) });
			}, 220);
		}

		window.setTimeout((): void => {
			updateVisibleLinks(app, plugin);
		}, 250);
	});

	// Window Open Hook
	plugin.registerEvent(app.workspace.on("window-open", (window) => {
		if (window?.getContainer()?.doc) {
			initModalObservers(plugin, window.getContainer().doc);
		}
	}));

	// Layout Change Hook
	plugin.registerEvent(app.workspace.on("layout-change", (): void => {
		initViewObservers(plugin);
		updateLinksDebounced(null);
	}));

	// Vault Modify Hook
	plugin.registerEvent(app.vault.on("modify", (file): void => {
		if (!(file instanceof TFile)) return;

		plugin.invalidateAttrCacheByPath(file.path);
		plugin.cacheManager.markPathTouched(file.path);

		// Bruker offentlige metoder for å legge i kø (Siden variablene er på main)
		plugin.enqueuePath(file.path);
		plugin.triggerScheduleRefresh();
	}));

	// Vault Delete Hook
	plugin.registerEvent(app.vault.on("delete", (file): void => {
		const path = (file as { path?: string }).path ?? "";
		if (path.length === 0) return;

		plugin.invalidateAttrCacheByPath(path);
		plugin.cacheManager.markPathTouched(path);

		plugin.enqueuePath(path);
		plugin.triggerScheduleRefresh();
	}));

	// Vault Rename Hook
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

	// Metadata Changed Hook
	plugin.registerEvent(app.metadataCache.on("changed", (file: TFile): void => {
		if (plugin.cacheManager.wasPathTouchedRecently(file.path)) return;

		plugin.enqueuePath(file.path);
		plugin.triggerScheduleRefresh();
	}));
}
