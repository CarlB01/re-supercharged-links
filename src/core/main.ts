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
		reloadCustomCss(): Promise<void>; // The single operational contract line we actually require
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
	
	private ruleConfigVersion: number = 0;
	private readonly pendingChangedPaths: Set<string> = new Set();
	private readonly pendingChangedPrefixes: Set<string> = new Set();

	private readonly scheduleVisibleRefresh = debounce((): void => {
		this.flushPendingRefresh();
	}, 180, false);

	// Public API for external event framework access
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

		// 🚀 FIX 2: REVNUT: Cache-pruning (sortering/scanning) er fjernet herfra fullstendig.
		// Den kjører nå på en dedikert bakgrunns-timer i stedet for å kvele render-tråden.

		// ⚡ OPTIMALISERING: Konverter rå data effektivt uten doble arrays i minnet
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

		// Vår oppdaterte versjon som ignorerer Live Preview/CodeMirror (preview-only guard)
		updateVisibleLinks(this.app, this, { paths: pathSet, prefixes: prefixSet });

		if (trackingActive) {
			const elapsed: number = Date.now() - startMark;
			const nodesCount: number = this.telemetry.getLastNodeCount();
			this.telemetry.recordUpdateCycle(elapsed, nodesCount);
		}
	}

/**
	 * Evicts dynamic path entries from live cache maps instantly via the local cache manager.
	 */
	public invalidateAttrCacheByPath(path: string): void {
		if (this.cacheManager !== null) {
			this.cacheManager.invalidatePath(path);
		}
	}

	/**
	 * Evicts direct folder prefix cascades from hot cache mappings via the local cache manager.
	 */
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


/**
	 * Dynamically reconfigures structural runtime styling tokens across all active editor viewports.
	 * ⚡ ZERO-ANY GUARD: Interrogates internal CodeMirror instances typesafely via decoupled structural casing.
	 */
	public refreshEditorThemes(): void {
		const currentTheme = createRuntimeEditorTheme(this);
		
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			const view = leaf.view ?? null;
			if (view === null) return;

			// Safe structural boundary check: verify we are dealing with a view that actually contains an editor layout
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

		// 🚀 ENDRE KUN DENNE TIMER-REGISTRERINGEN INNE I ONLOAD:
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
		
		// ✅ Tømmer alle interne minne-referanser for å unngå lekkasjer post-unload
		this.pendingChangedPaths.clear();
		this.pendingChangedPrefixes.clear();
		this.activeAttributesSet.clear();
		this.compiledRules = [];
	}

	/**
	 * Aggregates unique structural attribute rule keys used to balance background fetching engines.
	 */
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

	/**
	 * Loads configuration sheets from disk infrastructure safely.
	 */
	public async loadSettings(): Promise<void> {
		const { settings, dataRepaired } = await loadAndSanitizeSettings(this);
		this.settings = settings;

		const selectorsArray: CSSLink[] = this.settings?.selectors ?? [];
		this.compiledRules = compileSelectors(selectorsArray);

		if (dataRepaired) {
			await this.saveSettings();
		}
	}

	/**
	 * Persists user layer properties into local workspace structures.
	 */
	public async saveSettings(): Promise<void> {
		await saveStrippedSettings(this, this.settings);
	}
	
	/**
	 * Purges deprecated physical style assets from historical vault structures safely.
	 */
	private async cleanupLegacySnippetFile(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const configDir = this.app.vault.configDir;
			const snippetPath = `${configDir}/snippets/re-supercharged-links-gen.css`;

			const fileExists: boolean = await adapter.exists(snippetPath);
			if (fileExists) {
				await adapter.remove(snippetPath);
				
				const internalApp = this.app as unknown as LegacyStyleSystemApp;
				// ✅ FIKSET: Fjernet utrygg undefined-sjekk, bruker ren null- og funksjonsverifisering
				if (internalApp.customCss !== null && internalApp.customCss !== undefined && typeof internalApp.customCss.reloadCustomCss === "function") {
					await internalApp.customCss.reloadCustomCss();
				}
			}
		} catch (error) {
			const errorMessage: string = error instanceof Error ? error.message : "Unknown file system violation";
			new Notice(`Re-Supercharged Links: Failed to purge legacy snippet file (${errorMessage})`);
		}
	}

	/**
	 * Validates runtime dependencies to prevent adjacent namespace crashes.
	 */
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
