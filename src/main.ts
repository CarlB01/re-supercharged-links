import { Plugin, debounce, TFile } from 'obsidian';
import { Prec } from "@codemirror/state";
import { DEFAULT_SETTINGS, SCLSettings } from './Settings';
import SCLSettingTab from './settings/setting-tab';

// Core Workflow Imports: Pointing directly to our clean, stratified folder structure
import { updateElLinks, updateVisibleLinks, updateContainer } from "./views/view-updaters";
import { buildCMViewPlugin } from './views/livePreview';
import { initViewObservers, initModalObservers, disconnectAllObservers, removeStylingFromViews } from './observers/observer-engine';

// 1. FIXED & OPTIMALIZED: Import the orchestrator to handle arrays and diff-checking seamlessly
import { sanitizeRuleset } from './processors/rule-sanitizer';

export default class ResuperchargedLinks extends Plugin {
	/**
	 * Natively hydrated typed configurations containing user styling definitions.
	 */
	declare settings: SCLSettings;

	/**
	 * Managed reference to the custom UI settings dashboard dashboard view.
	 */
	declare settingTab: SCLSettingTab;

	/**
	 * A registry of active MutationObservers mapping specific workspace layouts (e.g., Backlinks, 
	 * File Explorer) alongside their targeted CSS selector bindings to orchestrate reactive changes.
	 */
	declare observers: [MutationObserver, string, string][];

	/**
	 * An isolated bucket array of global document observers capturing modal, quick switcher, 
	 * and autocompleter suggestion injections dynamically within the native DOM tree.
	 */
	declare modalObservers: MutationObserver[];

	/**
	 * HOT-PATH TRANSACTION CACHE: A localized map dictionary holding fully evaluated 
	 * link metadata attributes resolved within a single event loop cycle. Prevents extreme 
	 * layout thrashing and duplicate internal cache lookups during high-frequency repaint frames.
	 */
	declare attrCycleCache: Map<string, Record<string, string>>;

	/**
	 * Pre-compiled runtime registry containing an unique, deduplicated index of metadata attributes 
	 * actively targeted by the user's styling rules to bypass linear array lookups.
	 */
	activeAttributesSet: Set<string> = new Set();

	/**
	 * Instantly flushes the local memory lifecycle buffer during modification frame triggers.
	 */
	clearAttrCycleCache(): void {
		this.attrCycleCache.clear();
	}

	async onload(): Promise<void> {
		// Safety initialization bounds: Instantiated immediately to block undefined evaluation at runtime
		this.observers = [];
		this.modalObservers = [];
		this.attrCycleCache = new Map();

		await this.loadSettings();

		// COMPILE ONCE: Assemble active global attributes index maps once upon boot routines
		this.compileActiveAttributes();

		this.addSettingTab(new SCLSettingTab(this.app, this));

		// Mount robust DOM post-processors for standard Reading Mode layouts
		this.registerMarkdownPostProcessor((el, ctx) => {
			updateElLinks(this.app, this, el, ctx);
		});

		// Pipeline Core: Consolidated update runner wrapped inside high-performance event boundaries
		const updateLinksDebounced = debounce((_file: TFile | null) => {
			// Clear cache synchronously right as execution begins so child lookups share a fresh map context
			this.clearAttrCycleCache();
			
			updateVisibleLinks(this.app, this);
			
			this.observers.forEach(([_, type, ownClass]) => {
				const leaves = this.app.workspace.getLeavesOfType(type);
				leaves.forEach(leaf => {
					if (leaf?.view?.containerEl) {
						updateContainer(leaf.view.containerEl, this, ownClass);
					}
				});
			});
		}, 300, true);

		// Mount ultra-fast real-time Live Preview components into CodeMirror configurations
		const livePreviewExtension = Prec.lowest(buildCMViewPlugin(this.app, this));
		this.registerEditorExtension(livePreviewExtension);

		// Defer resource-heavy rendering sequences until after Obsidian finishes core frame compilation
		this.app.workspace.onLayoutReady(() => {
			this.clearAttrCycleCache();
			initViewObservers(this);
			initModalObservers(this, document);
			updateVisibleLinks(this.app, this);
		});

		// Polyfill safety hooks: Attach fresh watchers to secondary window frames seamlessly
		this.registerEvent(this.app.workspace.on("window-open", (window) => {
			if (window?.getContainer()?.doc) {
				initModalObservers(this, window.getContainer().doc);
			}
		}));

		// Repaint workspace targets whenever cache parameters are updated by native operations
		this.registerEvent(this.app.metadataCache.on('changed', (_file) => {
			updateLinksDebounced(_file);
		}));

		// Layout Change Debouncer: Protects against CPU spiking during rapid tab switching phases
		this.registerEvent(this.app.workspace.on("layout-change", debounce(() => {
			initViewObservers(this);
			updateLinksDebounced(null);
		}, 150, true)));
	}

	onunload(): void {
		disconnectAllObservers(this);
		removeStylingFromViews(this);
	}

	/**
	 * Flattens array query rulesets down to a static Set array to bypass loop overheads on hot-paths.
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

	/**
	 * Pulls local user parameters securely and passes layout fields through the centralized sanitizer.
	 */
	async loadSettings(): Promise<void> {
		const loaded = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		// 2. OPTIMALIZED & UNIFIED: Delegate validation and comparison entirely to the sanitizer file
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
