import { Plugin, debounce, TFile } from 'obsidian';
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view"; // 🔑 Ny import
import { DEFAULT_SETTINGS, SCLSettings } from './settings/settings';
import SCLSettingTab from './settings/setting-tab';

import { updateElLinks, updateVisibleLinks, updateContainer } from "./views/view-updaters";
import { buildCMViewPlugin, themeCompartment, createRuntimeEditorTheme } from './views/live-preview'; // 🔑 Oppdaterte importer
import { initViewObservers, initModalObservers, disconnectAllObservers, removeStylingFromViews } from './observers/observer-engine';
import { sanitizeRuleset } from './processors/rule-sanitizer';

export default class ResuperchargedLinks extends Plugin {
	declare settings: SCLSettings;
	declare settingTab: SCLSettingTab;
	declare observers: [MutationObserver, string, string][];
	declare modalObservers: MutationObserver[];
	declare attrCycleCache: Map<string, Record<string, string>>;
	activeAttributesSet: Set<string> = new Set();

	clearAttrCycleCache(): void {
		this.attrCycleCache.clear();
	}

	/**
	 * 🔑 NY METODE: Tvinger alle åpne CodeMirror-editorer til å re-kompilere
	 * fargene og stilene i minnet øyeblikkelig uten lagg!
	 */
	refreshEditorThemes(): void {
		const currentTheme = createRuntimeEditorTheme(this);
		this.app.workspace.iterateAllLeaves((leaf) => {
			// @ts-ignore
			const cm = leaf.view?.editor?.cm as EditorView | undefined;
			if (cm && typeof cm.dispatch === "function") {
				cm.dispatch({
					effects: themeCompartment.reconfigure(currentTheme)
				});
			}
		});
	}

	async onload(): Promise<void> {
		this.observers = [];
		this.modalObservers = [];
		this.attrCycleCache = new Map();

		await this.loadSettings();
		this.compileActiveAttributes();
		this.addSettingTab(new SCLSettingTab(this.app, this));

		this.registerMarkdownPostProcessor((el, ctx) => {
			updateElLinks(this.app, this, el, ctx);
		});

		const updateLinksDebounced = debounce((_file: TFile | null) => {
			this.clearAttrCycleCache();
			updateVisibleLinks(this.app, this);
			
			// 🔑 Tving frem sanntidsfarger i editoren under oppdateringer
			this.refreshEditorThemes();

			this.observers.forEach(([_, type, ownClass]) => {
				const leaves = this.app.workspace.getLeavesOfType(type);
				leaves.forEach(leaf => {
					if (leaf?.view?.containerEl) {
						updateContainer(leaf.view.containerEl, this, ownClass);
					}
				});
			});
		}, 300, true);

		// 🔑 REGISTRERING VIA PORTEN: Vi pakker inn det opprinnelige temaet i Compartment-porten vår
		const viewPluginInstance = buildCMViewPlugin(this.app, this);
		const initialTheme = createRuntimeEditorTheme(this);
		
		this.registerEditorExtension([
			Prec.lowest(viewPluginInstance),
			themeCompartment.of(initialTheme) // Åpner porten for sanntids farge-injeksjon!
		]);

		this.app.workspace.onLayoutReady(() => {
			this.clearAttrCycleCache();
			initViewObservers(this);
			initModalObservers(this, document);
			updateVisibleLinks(this.app, this);
			this.refreshEditorThemes(); // 🔑 Sikrer farger under oppstart
		});

		this.registerEvent(this.app.workspace.on("window-open", (window) => {
			if (window?.getContainer()?.doc) {
				initModalObservers(this, window.getContainer().doc);
			}
		}));

		this.registerEvent(this.app.metadataCache.on('changed', (_file) => {
			updateLinksDebounced(_file);
		}));

		this.registerEvent(this.app.workspace.on("layout-change", debounce(() => {
			initViewObservers(this);
			updateLinksDebounced(null);
		}, 150, true)));
	}

	onunload(): void {
		disconnectAllObservers(this);
		removeStylingFromViews(this);
	}

	compileActiveAttributes(): void {
		this.activeAttributesSet.clear();
		if (this.settings?.selectors && Array.isArray(this.settings.selectors)) {
			this.settings.selectors.forEach(selector => {
				if (selector?.type === 'attribute' && selector.name) {
					this.activeAttributesSet.add(selector.name);
				}
			});
		}
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		const { sanitized, hasChanges } = sanitizeRuleset(this.settings.selectors);
		if (hasChanges) {
			this.settings.selectors = sanitized;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
