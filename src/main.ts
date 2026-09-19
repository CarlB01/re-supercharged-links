import { Plugin, debounce, TFile, Notice, App, MarkdownView } from 'obsidian';
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SCLSettings } from './settings/settings';
import SCLSettingTab from './settings/setting-tab';
import { loadAndSanitizeSettings, saveStrippedSettings } from "./settings/settings-manager";

import { updateElLinks, updateVisibleLinks, updateContainer } from "./views/view-updaters";
import { buildCMViewPlugin, themeCompartment, createRuntimeEditorTheme } from './views/live-preview';
import { initViewObservers, initModalObservers, disconnectAllObservers, removeStylingFromViews } from './observers/observer-engine';
import { CSSLink } from './types/css-link';
import { invalidateByPath, invalidateByPrefix } from "./processors/attribute-fetcher";
import { PluginPerformanceTracker } from './telemetry';
import { AttributeCacheManager } from './processors/cache-manager';
import { normalizePathForQueue, compactPrefixes } from './utils/path-utils';

interface ObsidianAppWithCustomCss {
	customCss?: {
		getSnippets(): string[];
		reloadCustomCss(): Promise<void>;
	};
}

interface ObsidianPluginRegistry {
	plugins?: {
		enabledPlugins?: Set<string>;
	};
}

interface ObsidianMarkdownViewWithCM {
	view: {
		editor?: {
			cm?: EditorView;
		};
	};
}

export default class ResuperchargedLinks extends Plugin {
	declare public settings: SCLSettings;
	public settingTab!: SCLSettingTab;
	public observers!: [MutationObserver, string, string][];
	public modalObservers!: MutationObserver[];
	public attrCycleCache!: Map<string, Record<string, string>>;
	public activeAttributesSet: Set<string> = new Set();
	
	public performanceTracker!: PluginPerformanceTracker;
	public cacheManager!: AttributeCacheManager;
	
	private ruleConfigVersion: number = 0;
	private readonly pendingChangedPaths: Set<string> = new Set();
	private readonly pendingChangedPrefixes: Set<string> = new Set();

	private readonly scheduleVisibleRefresh = debounce((): void => {
		this.flushPendingRefresh();
	}, 180, true);

	public touchAttrCacheKey(key: string): void {
		this.cacheManager.touchAttrCacheKey(key);
	}

	private queuePath(path: string): void {
		const normalized: string = normalizePathForQueue(path);
		if (normalized.length === 0) return;
		this.pendingChangedPaths.add(normalized);
	}

	private queuePrefix(prefix: string): void {
		const normalized: string = normalizePathForQueue(prefix);
		if (normalized.length === 0) return;
		this.pendingChangedPrefixes.add(normalized.endsWith("/") ? normalized : `${normalized}/`);
	}

	private flushPendingRefresh(): void {
		const changedPaths: string[] = Array.from(this.pendingChangedPaths);
		const changedPrefixes: string[] = Array.from(this.pendingChangedPrefixes);

		if (changedPaths.length === 0 && changedPrefixes.length === 0) return;

		this.cacheManager.runLifecyclePrune();
		
		this.pendingChangedPaths.clear();
		this.pendingChangedPrefixes.clear();

		const pathSet = new Set(changedPaths);
		const compactedPrefixes: string[] = compactPrefixes(changedPrefixes);
		const prefixSet = new Set(compactedPrefixes);

		const trackingActive: boolean = this.performanceTracker.getTrackingState();
		const startMark: number = trackingActive ? performance.now() : 0;

		updateVisibleLinks(this.app, this, { paths: pathSet, prefixes: prefixSet });

		if (trackingActive) {
			const elapsed: number = performance.now() - startMark;
			this.performanceTracker.recordUpdateCycle(elapsed, 0);
		}
	}

	public invalidateAttrCacheByPath(path: string): void {
		invalidateByPath(this.attrCycleCache, path);
	}

	public invalidateAttrCacheByPrefix(prefix: string): void {
		invalidateByPrefix(this.attrCycleCache, prefix);
	}

	public bumpRuleConfigVersion(): void {
		this.ruleConfigVersion += 1;
		this.clearAttrCycleCache();
	}

	public getRuleConfigVersion(): number {
		return this.ruleConfigVersion;
	}

	public clearAttrCycleCache(): void {
		if (this.cacheManager) {
			this.cacheManager.clearAllCache();
		}
	}

	public refreshEditorThemes(): void {
		const currentTheme = createRuntimeEditorTheme(this);
		this.app.workspace.iterateAllLeaves((leaf) => {
			const internalLeaf: ObsidianMarkdownViewWithCM = leaf as unknown as ObsidianMarkdownViewWithCM;
			const cm: EditorView | null = internalLeaf.view?.editor?.cm ?? null;
			
			if (cm !== null && typeof cm.dispatch === "function") {
				cm.dispatch({
					effects: themeCompartment.reconfigure(currentTheme)
				});
			}
		});
	}

	public async onload(): Promise<void> {
		this.observers = [];
		this.modalObservers = [];
		this.attrCycleCache = new Map();
		
		this.performanceTracker = new PluginPerformanceTracker(true);
		this.cacheManager = new AttributeCacheManager(this.attrCycleCache, this.performanceTracker);

		await this.cleanupLegacySnippetFile();
		this.detectPluginCollisions();
		
		await this.loadSettings();
		this.compileActiveAttributes();
		
		this.settingTab = new SCLSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.addCommand({
			id: "print-scl-perf-report",
			name: "Print performance instrumentation report",
			callback: () => { this.performanceTracker.printReport(); }
		});

		this.addCommand({
			id: "reset-scl-perf-metrics",
			name: "Reset performance metrics counters",
			callback: () => { this.performanceTracker.resetMetrics(); }
		});

		this.registerMarkdownPostProcessor((el: HTMLElement, ctx) => {
			updateElLinks(this.app, this, el, ctx);
		});

		const updateLinksDebounced = debounce((_file: TFile | null) => {
			this.clearAttrCycleCache();
			
			const trackingActive: boolean = this.performanceTracker.getTrackingState();
			const startMark: number = trackingActive ? performance.now() : 0;

			updateVisibleLinks(this.app, this);

			if (trackingActive) {
				const elapsed: number = performance.now() - startMark;
				this.performanceTracker.recordUpdateCycle(elapsed, 0);
			}

			this.refreshEditorThemes();

			const activeObservers: [MutationObserver, string, string][] = this.observers ?? [];
			activeObservers.forEach(([_, type, ownClass]) => {
				const leaves = this.app.workspace.getLeavesOfType(type);
				leaves.forEach(leaf => {
					if (leaf?.view?.containerEl) {
						updateContainer(leaf.view.containerEl, this, ownClass);
					}
				});
			});
		}, 300, true);

		const viewPluginInstance = buildCMViewPlugin(this.app, this);
		const initialTheme = createRuntimeEditorTheme(this);
		
		this.registerEditorExtension([
			Prec.lowest(viewPluginInstance),
			themeCompartment.of(initialTheme)
		]);

		this.app.workspace.onLayoutReady((): void => {
			this.clearAttrCycleCache();
			initViewObservers(this);
			initModalObservers(this, document);

			updateVisibleLinks(this.app, this);
			this.refreshEditorThemes();

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const activeFile = activeView?.file ?? null;
			
			if (activeFile !== null) {
				window.setTimeout((): void => {
					updateVisibleLinks(this.app, this, { paths: new Set([activeFile.path]) });
				}, 60);

				window.setTimeout((): void => {
					updateVisibleLinks(this.app, this, { paths: new Set([activeFile.path]) });
				}, 220);
			}

			window.setTimeout((): void => {
				updateVisibleLinks(this.app, this);
			}, 250);
		});

		this.registerEvent(this.app.workspace.on("window-open", (window) => {
			if (window?.getContainer()?.doc) {
				initModalObservers(this, window.getContainer().doc);
			}
		}));

		this.registerEvent(this.app.workspace.on("layout-change", (): void => {
			initViewObservers(this);
			updateLinksDebounced(null);
		}));

		this.registerEvent(this.app.vault.on("modify", (file): void => {
			if (!(file instanceof TFile)) return;

			this.invalidateAttrCacheByPath(file.path);
			this.cacheManager.markPathTouched(file.path);

			this.queuePath(file.path);
			this.scheduleVisibleRefresh();
		}));

		this.registerEvent(this.app.vault.on("delete", (file): void => {
			const path = (file as { path?: string }).path ?? "";
			if (path.length === 0) return;

			this.invalidateAttrCacheByPath(path);
			this.cacheManager.markPathTouched(path);

			this.queuePath(path);
			this.scheduleVisibleRefresh();
		}));

		this.registerEvent(this.app.vault.on("rename", (file, oldPath): void => {
			const newPath = (file as { path?: string }).path ?? "";

			if (oldPath && oldPath.length > 0) {
				this.invalidateAttrCacheByPath(oldPath);
				this.cacheManager.markPathTouched(oldPath);
				this.queuePath(oldPath);
			}

			if (newPath.length > 0) {
				this.invalidateAttrCacheByPath(newPath);
				this.cacheManager.markPathTouched(newPath);
				this.queuePath(newPath);
			}

			if (oldPath.endsWith("/")) {
				this.invalidateAttrCacheByPrefix(oldPath);
				this.queuePrefix(oldPath);
			}

			if (newPath.endsWith("/")) {
				this.invalidateAttrCacheByPrefix(newPath);
				this.queuePrefix(newPath);
			}

			this.scheduleVisibleRefresh();
		}));

		this.registerEvent(this.app.metadataCache.on("changed", (file: TFile): void => {
			if (this.cacheManager.wasPathTouchedRecently(file.path)) return;

			this.queuePath(file.path);
			this.scheduleVisibleRefresh();
		}));
	}
	
	public onunload(): void {
		disconnectAllObservers(this);
		removeStylingFromViews(this);
	}

	public compileActiveAttributes(): void {
		this.activeAttributesSet.clear();
		const selectorsProxy: CSSLink[] = this.settings?.selectors ?? [];
		if (Array.isArray(selectorsProxy)) {
			selectorsProxy.forEach((selector) => {
				if (selector?.type === "attribute" && selector.name) {
					this.activeAttributesSet.add(selector.name);
				}
			});
		}
	}

	public async loadSettings(): Promise<void> {
		const { settings, dataRepaired } = await loadAndSanitizeSettings(this);
		this.settings = settings;

		if (dataRepaired) {
			await this.saveSettings();
		}
	}

	public async saveSettings(): Promise<void> {
		await saveStrippedSettings(this, this.settings);
	}
	
		private async cleanupLegacySnippetFile(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const configDir = this.app.vault.configDir;
			const snippetPath = `${configDir}/snippets/re-supercharged-links-gen.css`;

			const fileExists: boolean = await adapter.exists(snippetPath);
			if (fileExists) {
				await adapter.remove(snippetPath);
				
				const internalApp: ObsidianAppWithCustomCss = this.app as unknown as ObsidianAppWithCustomCss;
				if (internalApp.customCss && typeof internalApp.customCss.reloadCustomCss === "function") {
					await internalApp.customCss.reloadCustomCss();
				}
			}
		} catch (error) {
			const errorMessage: string = error instanceof Error ? error.message : "Unknown file system violation";
			new Notice(`Re-Supercharged Links: Failed to purge legacy snippet file (${errorMessage})`);
		}
	}

	private detectPluginCollisions(): void {
		try {
			const internalApp = this.app as App & ObsidianPluginRegistry;
			const enabledPlugins: Set<string> | null = internalApp.plugins?.enabledPlugins ?? null;

			if (enabledPlugins !== null && enabledPlugins.has("supercharged-links")) {
				new Notice(
					"⚠️ Re-Supercharged Links Warning:\n" +
					"The original 'Supercharged Links' plugin is currently enabled. " +
					"Please disable it to prevent styling conflicts and layout lag.",
					10000
				);
			}
		} catch (error) {
			const violation: string = error instanceof Error ? error.name : "RegistryAccessViolation";
			void violation;
		}
	}
}

