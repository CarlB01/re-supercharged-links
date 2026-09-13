import { Plugin, debounce, TFile, Notice } from 'obsidian';
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { DEFAULT_SETTINGS, SCLSettings } from './settings/settings';
import SCLSettingTab from './settings/setting-tab';
import { loadAndSanitizeSettings, saveStrippedSettings } from "./settings/settings-manager";

import { updateElLinks, updateVisibleLinks, updateContainer } from "./views/view-updaters";
import { buildCMViewPlugin, themeCompartment, createRuntimeEditorTheme } from './views/live-preview';
import { initViewObservers, initModalObservers, disconnectAllObservers, removeStylingFromViews } from './observers/observer-engine';
import { sanitizeRuleset } from './processors/rule-sanitizer';
import { CSSLink } from './types/css-link';

/**
 * Structural contract defining Obsidian's internal CSS registry endpoints.
 * This bypasses type constraints safely without introducing global namespace pollution.
 */
interface ObsidianAppWithCustomCss {
	customCss?: {
		getSnippets(): string[];
		reloadCustomCss(): Promise<void>;
	};
}

/**
 * Structural contract mapping Obsidian's internal community plugin registry.
 * Allows safe verification of coexisting extensions without leaking global any types.
 */
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

	public clearAttrCycleCache(): void {
		const cache: Map<string, Record<string, string>> | null = this.attrCycleCache ?? null;
		if (cache !== null) {
			cache.clear();
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

		// Clean up legacy artifact files from disk channels
		await this.cleanupLegacySnippetFile();

		// Check for environmental runtime collisions with the legacy plugin
		this.detectPluginCollisions();
		
		// 🔑 STRICT PROTOCOL FIX: Enforce sequential data resolution BEFORE initializing UI tabs
		await this.loadSettings();
		this.compileActiveAttributes();
		
		// Wire the configuration tab safely now that states are hydrated
		this.settingTab = new SCLSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.registerMarkdownPostProcessor((el: HTMLElement, ctx) => {
			updateElLinks(this.app, this, el, ctx);
		});

		const updateLinksDebounced = debounce((_file: TFile | null) => {
			this.clearAttrCycleCache();
			updateVisibleLinks(this.app, this);
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

		this.app.workspace.onLayoutReady(() => {
			this.clearAttrCycleCache();
			initViewObservers(this);
			initModalObservers(this, document);
			updateVisibleLinks(this.app, this);
			this.refreshEditorThemes();
		});

		this.registerEvent(this.app.workspace.on("window-open", (window) => {
			if (window?.getContainer()?.doc) {
				initModalObservers(this, window.getContainer().doc);
			}
		}));

		this.registerEvent(this.app.metadataCache.on('changed', (_file: TFile) => {
			updateLinksDebounced(_file);
		}));

		this.registerEvent(this.app.workspace.on("layout-change", debounce(() => {
			initViewObservers(this);
			updateLinksDebounced(null);
		}, 150, true)));
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
				if (selector?.type === 'attribute' && selector.name) {
					this.activeAttributesSet.add(selector.name);
				}
			});
		}
	}

	public async loadSettings(): Promise<void> {
		// 🚀 ARCHITECTURAL DECOUPLING: Delegate ingestion, vasking and translation paths to the manager
		const { settings, dataRepaired } = await loadAndSanitizeSettings(this);
		this.settings = settings;

		// Force write back clean structure instantly if corrupted nodes were healed during ingestion
		if (dataRepaired) {
			await this.saveSettings();
		}
	}

	public async saveSettings(): Promise<void> {
		// 🚀 ARCHITECTURAL DECOUPLING: Delegate output stripping and serialization to the manager
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
			const internalApp: ObsidianPluginRegistry = this.app as unknown as ObsidianPluginRegistry;
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
