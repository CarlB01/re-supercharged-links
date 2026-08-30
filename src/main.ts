import {Plugin, debounce, TFile} from 'obsidian';

import { Prec } from "@codemirror/state";
import { DEFAULT_SETTINGS, SCLSettings } from './Settings';
import SCLSettingTab from './SettingTab';
import { clearExtraAttributes, updateDivExtraAttributes, updateElLinks, updatePropertiesPane, updateVisibleLinks } from './linkAttributes';
import { buildCMViewPlugin } from './livePreview';

export default class ResuperchargedLinks extends Plugin {
	declare settings: SCLSettings;
	declare settingTab: SCLSettingTab
	declare observers: [MutationObserver, string, string][];
	private modalObservers: MutationObserver[] = [];

async onload(): Promise<void> {
    console.log('Supercharged links loaded');
    
    // 1. Initialiser variablene FØRST så de aldri er udefinerte
    this.observers = [];
    this.modalObservers = [];

    await this.loadSettings();

    this.addSettingTab(new SCLSettingTab(this.app, this));
    this.registerMarkdownPostProcessor((el, ctx) => {
        updateElLinks(this.app, this, el, ctx)
    });

    const plugin = this;
    const updateLinks = function(_file: TFile) {
        updateVisibleLinks(plugin.app, plugin);
        plugin.observers.forEach(([observer, type, own_class]) => {
            const leaves = plugin.app.workspace.getLeavesOfType(type);
            leaves.forEach(leaf => {
                plugin.updateContainer(leaf.view.containerEl, plugin, own_class);
            })
        });
    }

    // Live preview - Nå er det trygt å kjøre denne fordi observers eksisterer!
    const ext = Prec.lowest(buildCMViewPlugin(this.app, this));
    this.registerEditorExtension(ext);

    this.app.workspace.onLayoutReady(() => {
        this.initViewObservers(this);
        this.initModalObservers(this, document);
        updateVisibleLinks(this.app, this);
    });

    // Initialization
    this.registerEvent(this.app.workspace.on("window-open", (window, win) => this.initModalObservers(this, window.getContainer().doc)));

    // Update when 
    // Debounced to prevent lag when writing
    this.registerEvent(this.app.metadataCache.on('changed', debounce(updateLinks, 500, true)));

    // Update when layout changes
    // @ts-ignore
    this.registerEvent(this.app.workspace.on("layout-change", debounce(updateLinks, 10, true)));
    // Update plugin views when layout changes
    this.registerEvent(this.app.workspace.on("layout-change", () => this.initViewObservers(this)));
}


	initViewObservers(plugin: ResuperchargedLinks) {
		// Reset observers
    plugin.observers.forEach(([observer, type, _ownClass]) => {
			observer.disconnect();
		});
		plugin.observers = [];

		// Register new observers for particular file panes
		plugin.registerViewType('backlink', plugin, ".tree-item-inner", true);
		plugin.registerViewType('outgoing-link', plugin, ".tree-item-inner", true);
		plugin.registerViewType('search', plugin, ".tree-item-inner");
		if (plugin.app?.plugins?.plugins?.breadcrumbs) {
			// console.log('Supercharged links: Enabling breadcrumbs support');
			plugin.registerViewType('bc-matrix-view', plugin, 'span.internal-link');
			plugin.registerViewType('BC-ducks', plugin, '.internal-link');
			plugin.registerViewType('bc-tree-view', plugin, 'span.internal-link');
			// Breadcrumbs codeblock support as suggested by https://github.com/mdelobelle/obsidian_supercharged_links/issues/248#issuecomment-3231706063
			plugin.registerViewType('markdown', plugin, '.BC-page-views span.internal-link, .BC-codeblock-tree span.internal-link, .nodes a.internal-link');
		}
		plugin.registerViewType('graph-analysis', plugin, '.internal-link');
		plugin.registerViewType('starred', plugin, '.nav-file-title-content');
		plugin.registerViewType('file-explorer', plugin, '.nav-file-title-content');

		if (plugin.app?.plugins?.plugins?.['folder-notes']) {
			// console.log('Supercharged links: Enabling folder notes support');
			plugin.registerViewType('file-explorer', plugin, '.has-folder-note .tree-item-inner');
		}

		plugin.registerViewType('recent-files', plugin, '.nav-file-title-content');
		plugin.registerViewType('bookmarks', plugin, '.tree-item-inner', false, true);
		// @ts-ignore
		if (plugin.app?.internalPlugins?.plugins?.bases?.enabled && plugin.settings.enableBases) {
			// console.log('Supercharged links: Enabling bases support');
			plugin.registerViewType('bases', plugin, 'span.internal-link');
			plugin.registerViewType('bases', plugin, '.multi-select-pill-content');

			// For embedded bases
			plugin.registerViewType('markdown', plugin, 'div.bases-table-cell span.internal-link');
			plugin.registerViewType('markdown', plugin, 'div.bases-table-cell div.multi-select-pill-content');
			plugin.registerViewType('markdown', plugin, 'div.bases-cards-line');
		}
		if (plugin.app?.plugins?.plugins?.['similar-notes']) {
			plugin.registerViewType('markdown', plugin, '.similar-notes-pane .tree-item-inner', true)
		}
		// If backlinks in editor is on
		// @ts-ignore
		if (plugin.app?.internalPlugins?.plugins?.backlink?.enabled && plugin.app?.internalPlugins?.plugins?.backlink?.instance?.options?.backlinkInDocument) {
			// console.log("Supercharged links: Enabling backlinks in document support");
			plugin.registerViewType('markdown', plugin, '.embedded-backlinks .tree-item-inner', true);
		}

		const propertyLeaves = this.app.workspace.getLeavesOfType("file-properties");
		for (let i = 0; i < propertyLeaves.length; i++) {
				const leaf = propertyLeaves[i];
				if (!leaf) continue; // Sikrer at leafet faktisk eksisterer

				const container = leaf.view.containerEl;
				if (!container) continue; // Sikrer at containerEl ikke er undefined

				let observer = new MutationObserver((records, _) => {
						const file = this.app.workspace.getActiveFile();
						if (file) {
								// Bruker den lokale, sjekkede 'file'-variabelen og 'container'
								updatePropertiesPane(container, file, this.app, plugin);
						}
				});

				observer.observe(container, { subtree: true, childList: true, attributes: false });
				plugin.observers.push([observer, "file-properties" + i, ""]);
				// TODO: No proper unloading!
		}

		plugin.registerViewType('file-properties', plugin, 'div.internal-link > .multi-select-pill-content');
		if (plugin.app?.plugins?.plugins?.['notebook-navigator']) {
			plugin.registerViewType('notebook-navigator', plugin, 'span.nn-shortcut-label');
			plugin.registerViewType('notebook-navigator', plugin, 'div.nn-file-name');
		}
	}

initModalObservers(plugin: ResuperchargedLinks, doc: Document) {
    const config = {
        subtree: false,
        childList: true,
        attributes: false
    };

    // 1. Opprett observeren i en egen konstant først
    const observer = new MutationObserver(records => {
        records.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(n => {
                    if ('className' in n &&
                        // @ts-ignore
                        (n.className.includes('modal-container') && plugin.settings.enableQuickSwitcher
                            // @ts-ignore
                            || n.className.includes('suggestion-container') && plugin.settings.enableSuggestor)) {
                        let selector = ".suggestion-title, .suggestion-note, .another-quick-switcher__item__title, .omnisearch-result__title > span";
                        // @ts-ignore
                        if (n.className.includes('suggestion-container')) {
                            selector = ".suggestion-title, .suggestion-note";
                        }
                        plugin.updateContainer(n as HTMLElement, plugin, selector);
                        plugin._watchContainer(null, n as HTMLElement, plugin, selector);
                    }
                });
            }
        });
    });

    // 2. Legg den til i arrayen
    this.modalObservers.push(observer);

    // 3. Bruk konstanten direkte – den er garantert ALDRI undefined!
    observer.observe(doc.body, config);
}


registerViewType(viewTypeName: string, plugin: ResuperchargedLinks, selector: string, updateDynamic = false, filter_collapsible: boolean = false) {
		const leaves = this.app.workspace.getLeavesOfType(viewTypeName);
		
		for (let i = 0; i < leaves.length; i++) {
			const leaf = leaves[i];
			// 🚀 1. Sikre at leaf faktisk eksisterer (fjerner undefined-feil på leaves[i])
			if (!leaf) continue; 

			const container = leaf.view?.containerEl;
			// 🚀 2. Sikre at containerEl faktisk eksisterer før den sendes til funksjonene
			if (!container) continue; 

			if (updateDynamic) {
				plugin._watchContainerDynamic(viewTypeName + i, container, plugin, selector);
			} else {
				plugin._watchContainer(viewTypeName + i, container, plugin, selector, filter_collapsible);
			}
		}
	}


	updateContainer(container: HTMLElement, plugin: ResuperchargedLinks, selector: string, filter_collapsible: boolean = false) {
		if (!container || typeof container.findAll !== "function") return;

		if (!plugin.settings.enableBacklinks && container.getAttribute("data-type") !== "file-explorer") return;
		if (!plugin.settings.enableFileList && container.getAttribute("data-type") === "file-explorer") return;
		const nodes = container.findAll(selector);
		for (let i = 0; i < nodes.length; ++i) {
			const el = nodes[i] as HTMLElement;
			// 🚀 FIKSET: Bytt ut plugin.settings med plugin som andre parameter
			updateDivExtraAttributes(plugin.app, plugin, el, "", undefined, filter_collapsible);
		}
	}

	removeFromContainer(container: HTMLElement, selector: string) {
		const nodes = container.findAll(selector);
		for (let i = 0; i < nodes.length; ++i) {
			const el = nodes[i] as HTMLElement;
			clearExtraAttributes(el);
		}
	}

    // Fikset: Tillater nå at viewType kan være null
    private _watchContainer(
        viewType: string | null, 
        container: HTMLElement, 
        plugin: ResuperchargedLinks, 
        selector: string, 
        filter_collapsible: boolean = false
    ): void {
        let observer = new MutationObserver((records, _) => {
            plugin.updateContainer(container, plugin, selector, filter_collapsible);
        });
        observer.observe(container, { subtree: true, childList: true, attributes: false });
        
        // Sjekken fungerer fortsatt perfekt om viewType er null
        if (viewType) {
            plugin.observers.push([observer, viewType, selector]);
        }
    }

    // Fikset: Gjort privat og lagt til typering på returverdi (: void)
    private _watchContainerDynamic(
        viewType: string, 
        container: HTMLElement, 
        plugin: ResuperchargedLinks, 
        selector: string, 
        parent_class = 'tree-item'
    ): void {
        // Brukt for effektiv oppdatering av backlinks-panelet
        if (!plugin.settings.enableBacklinks) return;
        
        let observer = new MutationObserver((records, _) => {
            records.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((n) => {
                        // Sjekk om det er et HTMLElement før vi leser className (mye tryggere enn @ts-ignore)
                        if (n instanceof HTMLElement) {
                            if (n.className && typeof n.className.includes === 'function' && n.className.includes(parent_class)) {
                                const fileDivs = n.findAll(selector);
                                for (let i = 0; i < fileDivs.length; ++i) {
                                    const link = fileDivs[i] as HTMLElement;
                                    updateDivExtraAttributes(plugin.app, plugin, link, "");
                                }
                            }
                        }
                    });
                }
            });
        });
        
        observer.observe(container, { subtree: true, childList: true, attributes: false });
        plugin.observers.push([observer, viewType, selector]);
    }



	onunload() {
		this.observers.forEach(([observer, type, own_class]) => {
			observer.disconnect();
			const leaves = this.app.workspace.getLeavesOfType(type);
			leaves.forEach(leaf => {
				this.removeFromContainer(leaf.view.containerEl, own_class);
			})
		});
		for (const observer of this.modalObservers) {
			observer.disconnect();
		}
		console.log('Supercharged links unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

