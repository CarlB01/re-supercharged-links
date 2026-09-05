import { Plugin, debounce, TFile } from 'obsidian';
import { Prec } from "@codemirror/state";
import { DEFAULT_SETTINGS, SCLSettings } from './Settings';
import SCLSettingTab from './SettingTab';
import { updateElLinks, updateVisibleLinks, updateDivExtraAttributes } from "./linkAttributes";
import { buildCMViewPlugin } from './livePreview';
import { initViewObservers, initModalObservers, disconnectAllObservers, removeStylingFromViews } from './observerEngine';
import { sanitizeRule } from './selectorSanitizer';

export default class ResuperchargedLinks extends Plugin {
	declare settings: SCLSettings;
	declare settingTab: SCLSettingTab;
	declare observers: [MutationObserver, string, string][];
	declare modalObservers: MutationObserver[];

	// 🚀 ROI OPTIMIZATION: Cache compiled unique rule attributes globally
	activeAttributesSet: Set<string> = new Set();

	/**
	 * Pre-compiles selectors into a static hash set to eliminate hot-path processing loops.
	 */
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

	async onload(): Promise<void> {
			
			// Safety lock: Instantiate array registers immediately to block undefined runtime evaluation
			this.observers = [];
			this.modalObservers = [];

			await this.loadSettings();

				// 🔑 COMPILE ONCE: Bygg listen én gang ved oppstart
			this.compileActiveAttributes(); 
			
			this.addSettingTab(new SCLSettingTab(this.app, this));

			// Mount safe document parser hooks
			this.registerMarkdownPostProcessor((el, ctx) => {
					updateElLinks(this.app, this, el, ctx);
			});

			// Setup real-time workspace compilation pipeline
			const updateLinksDebounced = debounce((_file: TFile) => {
					updateVisibleLinks(this.app, this);
					this.observers.forEach(([_, type, ownClass]) => {
							const leaves = this.app.workspace.getLeavesOfType(type);
							leaves.forEach(leaf => {
									if (leaf?.view?.containerEl) {
											this.updateContainer(leaf.view.containerEl, this, ownClass);
									}
							});
					});
			}, 500, true);

			// Mount Live Preview CodeMirror extensions safely
			const livePreviewExtension = Prec.lowest(buildCMViewPlugin(this.app, this));
			this.registerEditorExtension(livePreviewExtension);

			// Defer internal view hooks until Obsidian's workspace framing has stabilized
			this.app.workspace.onLayoutReady(() => {
					initViewObservers(this);
					initModalObservers(this, document);
					updateVisibleLinks(this.app, this);
			});

			// Watch for desktop window layering triggers
			this.registerEvent(this.app.workspace.on("window-open", (window) => {
					if (window?.getContainer()?.doc) {
							initModalObservers(this, window.getContainer().doc);
					}
			}));

			// Efficient cache event subscription bindings
			this.registerEvent(this.app.metadataCache.on('changed', updateLinksDebounced));
			
			// @ts-ignore
			this.registerEvent(this.app.workspace.on("layout-change", debounce(() => updateLinksDebounced(null), 10, true)));
			this.registerEvent(this.app.workspace.on("layout-change", () => initViewObservers(this)));
	}

	/**
	 * Unified interface targeting batch operations across elements
	 */
	updateContainer(container: HTMLElement, plugin: ResuperchargedLinks, selector: string, filterCollapsible = false): void {
			if (!container || typeof container.findAll !== "function") return;
			if (!plugin.settings.enableBacklinks && container.getAttribute("data-type") !== "file-explorer") return;
			if (!plugin.settings.enableFileList && container.getAttribute("data-type") === "file-explorer") return;

			const nodes = container.findAll(selector);
			
			nodes.forEach(node => {
					if (node.instanceOf(HTMLElement)) {
						updateDivExtraAttributes(plugin.app, plugin, node, "", null, filterCollapsible);					}
			});
	}

	onunload(): void {
		disconnectAllObservers(this);
		removeStylingFromViews(this);
	}

	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		const original = this.settings.selectors ?? [];
		let changed = false;

		const sanitized = original.map((r) => {
			const s = sanitizeRule(r);
			// cheap shallow compare on fields that sanitizer may change
			if (
				s.match !== r.match ||
				s.value !== r.value ||
				s.type !== r.type ||
				s.name !== r.name
			) {
				changed = true;
			}
			return s;
		});

		if (changed) {
			this.settings.selectors = sanitized;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
