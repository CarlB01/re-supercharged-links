import { WorkspaceLeaf, View, Plugin, Notice, App } from 'obsidian';
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { loadAndSanitizeSettings, saveStrippedSettings } from "../settings/settings-manager";
import { buildCMViewPlugin, themeCompartment, createRuntimeEditorTheme } from '../views/live-preview';
import { disconnectAllObservers, initModalObservers, initViewObservers, registerViewType, removeStylingFromViews } from '../observers/observer-engine';
import { PluginPerformanceTracker } from './telemetry';
import { compileSelectors } from '../processors/rule-engine';
import { purgeAndResetAllTabHeaders, updateVisibleLinks } from '../processors/dom-reconciler';
import SCLSettingTab from '../settings/setting-tab';
import { AttributeCacheManager } from '../processors/cache-manager';
import { registerPluginEvents } from './event-registry';
import { safeReloadCustomCss } from '../utils/obsidian-adapters';
import { SCLSettings } from '../settings/settings-constants';
import { FlyweightEngine } from "./flyweight-engine";

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

export default class ResuperchargedLinks extends Plugin {
	declare public settings: SCLSettings;
	public settingTab!: SCLSettingTab;
	public flyweightEngine!: FlyweightEngine;

	public observers!: [MutationObserver, string, string][];
	public modalObservers!: MutationObserver[];
	public attrCycleCache!: Map<string, Record<string, string>>;
	
	public telemetry!: PluginPerformanceTracker;
	public cacheManager!: AttributeCacheManager;
	
	private lastAppliedThemeHash = ""; // 🚀 Tracks the applied theme signature to bypass redundant reconfigure frames

	private doTelemetry = true;

	public override async onload(): Promise<void> {
		this.observers = [];
		this.modalObservers = [];
		this.attrCycleCache = new Map();
		
		this.telemetry = new PluginPerformanceTracker(this.doTelemetry);
		this.cacheManager = new AttributeCacheManager(this.app, this, this.attrCycleCache);
		await this.cleanupLegacySnippetFile();
		this.detectPluginCollisions();
		
		await this.loadSettings();
		
		this.settingTab = new SCLSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.flyweightEngine = new FlyweightEngine(this.app, this);
		
		this.addCommand({
			id: "scl-telemetry-report",
			name: "Print styling performance telemetry report",
			callback: (): void => {
				if (this.telemetry !== null) {
					this.telemetry.printReport(Notice);
				} else {
					new Notice("Re-Supercharged Links: Telemetry buffer offline.");
				}
			}
		});

		this.addCommand({
			id: "scl-reset-metrics",
			name: "Reset styling performance telemetry metrics",
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
			this.cacheManager.clearAttrCycleCache();
			initViewObservers(this);

			const currentDoc: Document | null = document ?? null;
			if (currentDoc !== null) {
				initModalObservers(this, currentDoc);
			}

			this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
				const container: HTMLElement | null = leaf.view?.containerEl ?? null;
				if (container !== null && container.isConnected) {
					updateVisibleLinks(this.app, this);
					
					const viewType = leaf.view?.getViewType() ?? "";
					if (viewType.length > 0) {
						registerViewType(viewType, this, ".tree-item-inner, .nav-file-title-content, .tab-header-inner-title", true);
					}
				}
			});
			this.refreshEditorThemes();
		});
	}
	
	public override onunload(): void {	
		this.flyweightEngine.destroy();	
		this.cacheManager.destroy();
		this.lastAppliedThemeHash = "";
		
		if (this.attrCycleCache) {
			this.attrCycleCache.clear();
		}

		removeStylingFromViews(this);

		if (typeof purgeAndResetAllTabHeaders === "function") {
			purgeAndResetAllTabHeaders(this.app);
		}
		disconnectAllObservers(this);
	}

	public async loadSettings(): Promise<void> {
		const { settings, dataRepaired } = await loadAndSanitizeSettings(this);
		this.settings = settings;

		const selectorsArray = this.settings?.selectors ?? [];
		this.cacheManager.compiledRules = compileSelectors(selectorsArray);

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
				await safeReloadCustomCss(this.app);
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

		/**
	 * Reconfigures CodeMirror 6 editor extensions safely across active workspace leaves.
	 * Implements a strict O(1) state hash barrier to completely bypass layout sweeps 
	 * when compiled styling rules and active core dark/light status remain static.
	 */
	public refreshEditorThemes(): void {
		const isDark: boolean = document.body.classList.contains("theme-dark");
		const version: number = this.cacheManager.getRuleConfigVersion();
		
		// Compile a precise structural state string tracking environment changes
		const currentThemeHash = `${version}-${isDark ? "dark" : "light"}`;

		// 🚀 THE O(1) BARRIER INTERCEPT: Haltet instantly if the configuration maps perfectly to memory
		if (this.lastAppliedThemeHash === currentThemeHash) {
			return;
		}

		// Store the fresh signature instantly to protect subsequent redundant calls
		this.lastAppliedThemeHash = currentThemeHash;

		const currentTheme = createRuntimeEditorTheme(this);
		
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			const view = leaf.view ?? null;
			if (view === null) return;

			if (view.getViewType() === "markdown") {
				const markdownView = view as ObsidianInternalMarkdownView;
				const cm = markdownView.editor?.cm ?? null;
				
				// Verify instance health and ensuring the state compartment mapping exists natively
				if (cm !== null && typeof cm.dispatch === "function" && themeCompartment.get(cm.state) !== null) {
					try {
						cm.dispatch({
							effects: themeCompartment.reconfigure(currentTheme)
						});
					} catch {
						return;
					}
				}
			}
		});
	}

}
