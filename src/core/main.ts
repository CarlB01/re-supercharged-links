import { WorkspaceLeaf, View, Plugin, debounce, Notice, App, MarkdownView } from 'obsidian';
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { loadAndSanitizeSettings, saveStrippedSettings } from "../settings/settings-manager";

import { buildCMViewPlugin, themeCompartment, createRuntimeEditorTheme } from '../views/live-preview';
import { disconnectAllObservers, initModalObservers, removeStylingFromViews } from '../observers/observer-engine';
import { PluginPerformanceTracker } from '../telemetry';
import { CompiledRule, compileSelectors } from '../processors/rule-engine';
import { updateVisibleLinks } from '../processors/dom-reconciler';
import SCLSettingTab from '../settings/setting-tab';
import { SCLSettings } from '../settings/settings';
import { CSSLink } from '../types/css-link';
import { AttributeCacheManager } from '../processors/cache-manager';
import { compactPrefixes, normalizePathForQueue } from '../utils/shared-utils';
import { registerPluginEvents } from './event-registry';

/**
 * Structural bridge representing Obsidian's internal Markdown editor view state layout.
 */
interface ObsidianInternalMarkdownView extends View {
	editor?: {
		cm?: EditorView | null;
	};
}

interface ObsidianPluginRegistry {
	plugins?: {
		enabledPlugins?: Set<string>;
	};
}

/**
 * Explicit bridge contract mapping Obsidian's hidden stylesheet reload capabilities.
 * Named uniquely to prevent semantic namespace collisions with core application types.
 */
interface LegacyStyleSystemApp {
	customCss?: {
		reloadCustomCss(): Promise<void>;
	};
}

export default class ResuperchargedLinks extends Plugin {
	declare public settings: SCLSettings;
	public settingTab!: SCLSettingTab;
	public observers!: [MutationObserver, string, string][];
	public modalObservers!: MutationObserver[];
	public attrCycleCache!: Map<string, Record<string, string>>;
	public activeAttributesSet: Set<string> = new Set();
	
	public telemetry!: PluginPerformanceTracker;
	public cacheManager!: AttributeCacheManager;
	public compiledRules: CompiledRule[] = [];
	
	private ruleConfigVersion = 0;
	private readonly pendingChangedPaths: Set<string> = new Set();
	private readonly pendingChangedPrefixes: Set<string> = new Set();

	private readonly scheduleVisibleRefresh = debounce((): void => {
		this.flushPendingRefresh();
	}, 180, false);

	public enqueuePath(path: string): void {
		const normalized: string = normalizePathForQueue(path);
		if (normalized.length === 0) return;
		this.pendingChangedPaths.add(normalized);
	}

	public enqueuePrefix(prefix: string): void {
		const normalized: string = normalizePathForQueue(prefix);
		if (normalized.length === 0) return;
		this.pendingChangedPrefixes.add(normalized.endsWith("/") ? normalized : `${normalized}/`);
	}

	public triggerScheduleRefresh(): void {
		this.scheduleVisibleRefresh();
	}

	public touchAttrCacheKey(key: string): void {
		this.cacheManager.touchAttrCacheKey(key);
	}

	private flushPendingRefresh(): void {
		if (this.pendingChangedPaths.size === 0 && this.pendingChangedPrefixes.size === 0) return;

		const pathSet = new Set<string>();
		this.pendingChangedPaths.forEach((p) => pathSet.add(p));
		
		const changedPrefixes: string[] = [];
		this.pendingChangedPrefixes.forEach((p) => changedPrefixes.push(p));

		this.pendingChangedPaths.clear();
		this.pendingChangedPrefixes.clear();

		const compactedPrefixes: string[] = compactPrefixes(changedPrefixes);
		const prefixSet = new Set<string>();
		for (let i = 0; i < compactedPrefixes.length; i++) {
			const pref = compactedPrefixes[i];
			if (pref) prefixSet.add(pref);
		}

		const trackingActive: boolean = this.telemetry.getTrackingState();
		const startMark: number = trackingActive ? Date.now() : 0;

		updateVisibleLinks(this.app, this, { paths: pathSet, prefixes: prefixSet });

		if (trackingActive) {
			const elapsed: number = Date.now() - startMark;
			const nodesCount: number = this.telemetry.getLastNodeCount();
			this.telemetry.recordUpdateCycle(elapsed, nodesCount);
		}
	}

	public invalidateAttrCacheByPath(path: string): void {
		if (this.cacheManager !== null) {
			this.cacheManager.invalidatePath(path);
		}
	}

	public invalidateAttrCacheByPrefix(prefix: string): void {
		if (this.cacheManager !== null) {
			this.cacheManager.invalidatePrefix(prefix);
		}
	}

	public bumpRuleConfigVersion(): void {
		this.ruleConfigVersion += 1;
		const selectorsArray = this.settings?.selectors ?? [];
		this.compiledRules = compileSelectors(selectorsArray);
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
		
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			const view = leaf.view ?? null;
			if (view === null) return;

			if (view.getViewType() === "markdown") {
				const markdownView = view as ObsidianInternalMarkdownView;
				const cm = markdownView.editor?.cm ?? null;
				
				if (cm !== null && typeof cm.dispatch === "function") {
					cm.dispatch({
						effects: themeCompartment.reconfigure(currentTheme)
					});
				}
			}
		});
	}

	public override async onload(): Promise<void> {
		this.observers = [];
		this.modalObservers = [];
		this.attrCycleCache = new Map();
		
		this.telemetry = new PluginPerformanceTracker(true);
		this.cacheManager = new AttributeCacheManager(this.attrCycleCache, this.telemetry);

		await this.cleanupLegacySnippetFile();
		this.detectPluginCollisions();
		
		await this.loadSettings();
		this.compileActiveAttributes();
		
		this.settingTab = new SCLSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.addCommand({
			id: "scl-botteknott-report",
			name: "Print styling telemetry botteknott report",
			callback: (): void => {
				if (this.telemetry !== null) {
					this.telemetry.printReport(Notice);
				} else {
					new Notice("Re-Supercharged Links: Telemetry buffer offline.");
				}
			}
		});

		this.addCommand({
			id: "scl-reset-botteknott-metrics",
			name: "Reset styling telemetry botteknott metrics",
			callback: (): void => {
				if (this.telemetry !== null) {
					this.telemetry.resetMetrics();
					new Notice("Re-Supercharged Links: Telemetry buffers flushed clean.");
				}
			}
		});

		const intervalId: number = window.setInterval(() => {
			if (this.cacheManager !== null) {
				this.cacheManager.runLifecyclePrune();
			}
		}, 30000);
		this.registerInterval(intervalId);

		registerPluginEvents(this.app, this);

		const viewPluginInstance = buildCMViewPlugin(this.app, this);
		const initialTheme = createRuntimeEditorTheme(this);
		
		this.registerEditorExtension([
			Prec.lowest(viewPluginInstance),
			themeCompartment.of(initialTheme)
		]);

		this.app.workspace.onLayoutReady((): void => {
			window.requestAnimationFrame((): void => {
				const activeLeaf: WorkspaceLeaf | null = this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null;
				
				if (activeLeaf !== null) {
					if (typeof activeLeaf.rebuildView === "function") {
						activeLeaf.rebuildView();
					}
				}

				const currentDoc: Document | null = document ?? null;
				if (currentDoc !== null) {
					initModalObservers(this, currentDoc);
					updateVisibleLinks(this.app, this);
				}
				this.refreshEditorThemes();
			});
		});
	}
	
	public override onunload(): void {
		disconnectAllObservers(this);
		removeStylingFromViews(this);
		
		this.pendingChangedPaths.clear();
		this.pendingChangedPrefixes.clear();
		this.activeAttributesSet.clear();
		this.compiledRules = [];
	}

	public compileActiveAttributes(): void {
		this.activeAttributesSet.clear();
		
		if (this.settings === null || this.settings.selectors === null) return;

		const selectorsProxy: CSSLink[] = this.settings.selectors;
		if (Array.isArray(selectorsProxy)) {
			const len = selectorsProxy.length;
			for (let i = 0; i < len; i++) {
				const selector: CSSLink | null = selectorsProxy[i] ?? null;
				
				if (selector !== null && selector.type === "attribute") {
					const attrName: unknown = selector.name;

					if (typeof attrName === "string" && attrName.length > 0) {
						this.activeAttributesSet.add(attrName);
					}
				}
			}
		}
	}

	public async loadSettings(): Promise<void> {
		const { settings, dataRepaired } = await loadAndSanitizeSettings(this);
		this.settings = settings;

		const selectorsArray = this.settings?.selectors ?? [];
		this.compiledRules = compileSelectors(selectorsArray);

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
				
				const internalApp = this.app as unknown as LegacyStyleSystemApp;
				if (internalApp.customCss !== null && internalApp.customCss !== undefined && typeof internalApp.customCss.reloadCustomCss === "function") {
					// ✅ FIXED: Added 'await' to cleanly resolve the promise and clear the linter warning
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
