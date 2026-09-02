import ResuperchargedLinks from "./main";
import { updatePropertiesPane, clearExtraAttributes } from "./linkAttributes";

/**
 * RE-ARCHITECTED OBSERVATION CONTROLLER: Safely provisions isolated trackers across active panes.
 */
export function initViewObservers(plugin: ResuperchargedLinks): void {
    // Gracefully decouple any lingering operational views to avoid data bleeding
    if (plugin.observers) {
        plugin.observers.forEach(([observer]) => observer.disconnect());
    }
    plugin.observers = [];

    // Map strategic UI hooks strictly across verified Core Obsidian structures
    registerViewType('backlink', plugin, ".tree-item-inner", true);
    registerViewType('outgoing-link', plugin, ".tree-item-inner", true);
    registerViewType('search', plugin, ".tree-item-inner");
    registerViewType('starred', plugin, '.nav-file-title-content');
    registerViewType('file-explorer', plugin, '.nav-file-title-content');
    registerViewType('recent-files', plugin, '.nav-file-title-content');
    registerViewType('bookmarks', plugin, '.tree-item-inner', false, true);
    registerViewType('file-properties', plugin, 'div.internal-link > .multi-select-pill-content');

    // Provision modern third-party community plugin integrations dynamically
    const pluginRegistry = plugin.app?.plugins?.plugins;
    if (pluginRegistry?.breadcrumbs) {
        registerViewType('bc-matrix-view', plugin, 'span.internal-link');
        registerViewType('BC-ducks', plugin, '.internal-link');
        registerViewType('bc-tree-view', plugin, 'span.internal-link');
        registerViewType('markdown', plugin, '.BC-page-views span.internal-link, .BC-codeblock-tree span.internal-link, .nodes a.internal-link');
    }
    if (pluginRegistry?.['folder-notes']) {
        registerViewType('file-explorer', plugin, '.has-folder-note .tree-item-inner');
    }
    if (pluginRegistry?.['similar-notes']) {
        registerViewType('markdown', plugin, '.similar-notes-pane .tree-item-inner', true);
    }
    if (pluginRegistry?.['notebook-navigator']) {
        registerViewType('notebook-navigator', plugin, 'span.nn-shortcut-label');
        registerViewType('notebook-navigator', plugin, 'div.nn-file-name');
    }

    // Embed direct structural mutations within the Native file-properties canvas context
    const propertyLeaves = plugin.app.workspace.getLeavesOfType("file-properties");
    propertyLeaves.forEach((leaf, idx) => {
        const container = leaf?.view?.containerEl;
        if (!container) return;

        const observer = new window.MutationObserver(() => {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (activeFile) updatePropertiesPane(container, activeFile, plugin.app, plugin);
        });

        observer.observe(container, { subtree: true, childList: true, attributes: false });
        plugin.observers.push([observer, `file-properties-${idx}`, ""]);
    });
}

export function registerViewType(
    viewTypeName: string, 
    plugin: ResuperchargedLinks, 
    selector: string, 
    updateDynamic = false, 
    filterCollapsible = false
): void {
    const leaves = plugin.app.workspace.getLeavesOfType(viewTypeName);
    leaves.forEach((leaf, idx) => {
        const container = leaf?.view?.containerEl;
        if (!container) return;

        if (updateDynamic) {
            watchContainerDynamic(`${viewTypeName}-${idx}`, container, plugin, selector);
        } else {
            watchContainer(`${viewTypeName}-${idx}`, container, plugin, selector, filterCollapsible);
        }
    });
}

/**
 * SUGGESTION POPUP CONTROLLER: Injects metadata styles cleanly inside modals, omnisearch, and completers.
 */
export function initModalObservers(plugin: ResuperchargedLinks, doc: Document): void {
    const config = { subtree: false, childList: true, attributes: false };

    const observer = new window.MutationObserver(records => {
        records.forEach((mutation) => {
            if (mutation.type !== 'childList') return;
            
            mutation.addedNodes.forEach(node => {
                if (node instanceof HTMLElement && node.className && typeof node.className.includes === 'function') {
                    const isModal = node.className.includes('modal-container') && plugin.settings.enableQuickSwitcher;
                    const isSuggest = node.className.includes('suggestion-container') && plugin.settings.enableSuggestor;
                    
                    if (isModal || isSuggest) {
                        let selector = ".suggestion-title, .suggestion-note, .another-quick-switcher__item__title, .omnisearch-result__title > span";
                        if (node.className.includes('suggestion-container')) {
                            selector = ".suggestion-title, .suggestion-note";
                        }
                        plugin.updateContainer(node, plugin, selector);
                        watchContainer(null, node, plugin, selector);
                    }
                }
            });
        });
    });

    plugin.modalObservers.push(observer);
    observer.observe(doc.body, config);
}

function watchContainer(
    viewType: string | null, 
    container: HTMLElement, 
    plugin: ResuperchargedLinks, 
    selector: string, 
    filterCollapsible = false
): void {
    const observer = new window.MutationObserver(() => {
        plugin.updateContainer(container, plugin, selector, filterCollapsible);
    });
    
    observer.observe(container, { subtree: true, childList: true, attributes: false });
    if (viewType) plugin.observers.push([observer, viewType, selector]);
}

function watchContainerDynamic(
    viewType: string, 
    container: HTMLElement, 
    plugin: ResuperchargedLinks, 
    selector: string, 
    parentClass = 'tree-item'
): void {
    if (!plugin.settings.enableBacklinks) return;
    
    const observer = new window.MutationObserver((records) => {
        records.forEach((mutation) => {
            if (mutation.type !== 'childList') return;
            
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement && node.className && typeof node.className.includes === 'function') {
                    if (node.className.includes(parentClass)) {
                        const fileDivs = node.findAll(selector);
                        const { updateDivExtraAttributes } = require('./linkAttributes');
                        
                        fileDivs.forEach(div => {
                            if (div instanceof HTMLElement) {
                                updateDivExtraAttributes(plugin.app, plugin, div, "");
                            }
                        });
                    }
                }
            });
        });
    });
    
    observer.observe(container, { subtree: true, childList: true, attributes: false });
    plugin.observers.push([observer, viewType, selector]);
}

export function disconnectAllObservers(plugin: ResuperchargedLinks): void {
    if (plugin.observers) {
        plugin.observers.forEach(([observer]) => observer.disconnect());
    }
    if (plugin.modalObservers) {
        plugin.modalObservers.forEach(observer => observer.disconnect());
    }
}

export function removeStylingFromViews(plugin: ResuperchargedLinks): void {
    if (!plugin.observers) return;
    
    plugin.observers.forEach(([_, type, ownClass]) => {
        const leaves = plugin.app.workspace.getLeavesOfType(type);
        leaves.forEach(leaf => {
            if (leaf?.view?.containerEl && ownClass) {
                const nodes = leaf.view.containerEl.findAll(ownClass);
                nodes.forEach(node => {
                    if (node instanceof HTMLElement) clearExtraAttributes(node);
                });
            }
        });
    });
}
