import { App, getAllTags, getLinkpath, LinkCache, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "./main";

interface DataviewAPI {
    page(path: string): Record<string, unknown> | undefined;
}

export function clearExtraAttributes(link: HTMLElement): void {
    if (!link || !link.attributes) return;
    Array.from(link.attributes).forEach(attr => {
        if (attr?.name?.includes("data-link")) {
            link.removeAttribute(attr.name);
        }
    });
}

export function processKey(key: string): string {
    return key.replace(/ /g, '-');
}

export function processValue(key: string, value: string): string {
    if (!value || typeof value !== 'string') return value;
    if (key.includes("publishedIn") && value.startsWith("[[") && value.endsWith("]]")) {
        return value.slice(2, -2);
    }
    return value; 
}

/**
 * 🟢 PURE LOGIC SCAVENGER: Collects properties without touching the DOM.
 */
export function fetchTargetAttributesSync(
    app: App, 
    plugin: ResuperchargedLinks, 
    dest: TFile, 
    addDataHref: boolean
): Record<string, string> {
    let newProps: Record<string, string> = { tags: "" };
    if (!dest || !plugin?.settings) return newProps;

    const settings = plugin.settings;
    const cache = app.metadataCache.getFileCache(dest);
    if (!cache) return newProps;

    const frontmatter = cache.frontmatter as Record<string, unknown> | undefined;
    
		// 🚀 READ DIRECTLY FROM IMMUTABLE CACHE (No more loops here!)
		const activeAttributes = plugin.activeAttributesSet;

    // Scavenge core frontmatter values matching our active selector filters
    if (frontmatter && activeAttributes.size > 0) {
        activeAttributes.forEach(attribute => {
            if (Object.prototype.hasOwnProperty.call(frontmatter, attribute)) {
                const value = frontmatter[attribute];
                if (value !== null && value !== undefined) {
                    if (attribute === 'tag' || attribute === 'tags') {
                        newProps['tags'] += String(value);
                    } else {
                        newProps[attribute] = String(value);
                    }
                }
            }
        });
    }

		// Append native Obsidian tags if global parsing option is active
    if (settings.targetTags) {
        const allTags = getAllTags(cache);
        if (allTags) newProps["tags"] += allTags.join(' ');
    }

    if (addDataHref) newProps['data-href'] = dest.basename;
    newProps['path'] = dest.path;

    // 🌟 SAFE DATAVIEW BRIDGE: Fast memory lookup, ultra-low overhead
    const appWithPlugins = app as Record<string, any>;
    if (settings.getFromInlineField && appWithPlugins.plugins?.enabledPlugins?.has("dataview")) {
        const api = appWithPlugins.plugins?.plugins?.dataview?.api as DataviewAPI | undefined;
        if (api?.page) {
            const page = api.page(dest.path);
            if (page) {
                // 🚀 OPTIMALISERT: Bruker nå den lynraske, ferdigkompilerte globale cachen!
                plugin.activeAttributesSet.forEach((field: string) => {
                    const value = page[field];
                    if (value !== null && value !== undefined) {
                        newProps[field] = String(value);
                    }
                });
            }
        }
    }

    const hyphenatedProps: Record<string, string> = {};
    for (const [key, value] of Object.entries(newProps)) {
        hyphenatedProps[processKey(key)] = value;
    }
    
    return hyphenatedProps;
}

/**
 * 🚀 BATCHED INJECTOR: Commits attributes and CSS classes in single operational cycles.
 */
function setLinkNewProps(link: HTMLElement, newProps: Record<string, string>): void {
    // 1. Clean out stale attributes first
    Array.from(link.attributes).forEach(attr => {
        if (attr.name.includes("data-link") && !Object.prototype.hasOwnProperty.call(newProps, attr.name.replace("data-link-", ""))) {
            link.removeAttribute(attr.name);
        }
    });

    const cssProperties: Record<string, string> = {};

    // 2. Stage all attributes and variables in memory memory buffers
    for (const [key, propValue] of Object.entries(newProps)) {
        const domKey = processKey(key);
        const attributeName = "data-link-" + domKey;
        const curValue = link.getAttribute(attributeName);
        const newValue = processValue(key, propValue);

        if (!newValue || curValue !== newValue) {
            link.setAttribute(attributeName, newValue);
            
            const variableKey = `--data-link-${domKey}`;
            if (newValue && (newValue.startsWith('http') || newValue.startsWith('data:'))) {
                cssProperties[variableKey] = `url(${newValue})`;
            } else if (newValue) {
                cssProperties[variableKey] = newValue;
            }
        }
    }

    // 3. Commit properties and classes globally to isolate repaints
    link.setCssProps(cssProperties);
    
    if (!link.classList.contains("data-link-icon")) link.addClass("data-link-icon");
    if (!link.classList.contains("data-link-icon-after")) link.addClass("data-link-icon-after");
    if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
}

export function updateDivExtraAttributes(
    app: App, 
    plugin: ResuperchargedLinks, 
    link: HTMLElement, 
    destName: string, 
    linkName?: string, 
    filterCollapsible = false
): void {
    const parent = link.parentElement;
    if (filterCollapsible && parent?.getAttribute("class")?.includes('mod-collapsible')) return;

    if (!linkName) linkName = link.textContent || "";

    const attributeSources = [
        () => parent?.getAttribute('data-path'),
        () => parent?.getAttribute("data-href"),
        () => parent?.getAttribute("href"),
        () => link.getAttribute("data-href"),
        () => link.getAttribute("href")
    ];

    for (const source of attributeSources) {
        const value = source();
        if (value) {
            linkName = value;
            break;
        }
    }

    const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(linkName), destName);
    if (dest) {
        const newProps = fetchTargetAttributesSync(app, plugin, dest, true);
        setLinkNewProps(link, newProps);
    }
}

export function updateElLinks(app: App, plugin: ResuperchargedLinks, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const links = el.querySelectorAll('a.internal-link');
    const destName = ctx.sourcePath.replace(/(.*).md/, "$1");
    
    links.forEach((node) => {
        if (node instanceof HTMLElement) {
            const hrefAttr = node.getAttribute('href');
            const linkHref = hrefAttr ? hrefAttr.split('#')[0] : undefined;
            if (linkHref) {
                const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName);
                if (dest) {
                    const newProps = fetchTargetAttributesSync(app, plugin, dest, false);
                    setLinkNewProps(node, newProps);
                }
            }
        }
    });
}

function resolvePropertyTarget(frontmatter: Record<string, unknown>, key: string, linkText: string): string | null {
    const rawVal = frontmatter[key];
    if (!rawVal) return null;

    if (Array.isArray(rawVal)) {
        for (const entry of rawVal) {
            if (typeof entry === 'string' && entry.length > 4 && entry.startsWith("[[") && entry.endsWith("]]")) {
                const inner = entry.slice(2, -2);
                const segments = inner.split("|");
                if ((segments.length === 1 && segments[0] === linkText) || (segments.length === 2 && segments[1] === linkText)) {
                    return segments[0] || null;
                }
            }
        }
    }

    if (typeof rawVal === 'string' && rawVal.length > 4 && rawVal.startsWith("[[") && rawVal.endsWith("]]")) {
        const inner = rawVal.slice(2, -2);
        const segments = inner.split("|");
        if ((segments.length === 1 && segments[0] === linkText) || (segments.length === 2 && segments[1] === linkText)) {
            return segments[0] || null;
        }
    }

    return null;
}

export function updatePropertiesPane(propertiesEl: HTMLElement, file: TFile, app: App, plugin: ResuperchargedLinks): void {
    const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) return;

    const pills = propertiesEl.querySelectorAll("div.multi-select-pill-content");
    pills.forEach((node) => {
        const el = node as HTMLElement;
        const text = el.textContent;
        if (!text) return;
        const inputEl = el.parentElement?.parentElement?.parentElement?.parentElement?.children[0]?.children[1] as HTMLInputElement | undefined;
        if (inputEl?.value) {
            const resolvedTarget = resolvePropertyTarget(frontmatter, inputEl.value, text);
            if (resolvedTarget) updateDivExtraAttributes(plugin.app, plugin, el, "", resolvedTarget);
        }
    });

    const singleLinks = propertiesEl.querySelectorAll("div.metadata-link-inner");
    singleLinks.forEach((node) => {
        const el = node as HTMLElement;
        const text = el.textContent;
        if (!text) return;
        const inputEl = el.parentElement?.parentElement?.parentElement?.children[0]?.children[1] as HTMLInputElement | undefined;
        if (inputEl?.value) {
            const resolvedTarget = resolvePropertyTarget(frontmatter, inputEl.value, text);
            if (resolvedTarget) updateDivExtraAttributes(plugin.app, plugin, el, "", resolvedTarget);
        }
    });
}

export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks): void {
    const settings = plugin.settings;
    
    app.workspace.iterateRootLeaves((leaf) => {
        if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;

        const file: TFile = leaf.view.file;
        const cachedFile = app.metadataCache.getFileCache(file);
        const viewWithMeta = leaf.view as Record<string, any>;
        const metadataPane = viewWithMeta.metadataEditor?.contentEl as HTMLElement | undefined;
        
        if (metadataPane) updatePropertiesPane(metadataPane, file, app, plugin);

        const leafWithHeaders = leaf as Record<string, any>;
        const tabHeader = leafWithHeaders.tabHeaderInnerTitleEl as HTMLElement | undefined;
        
        if (tabHeader) {
            if (settings.enableTabHeader) {
                updateDivExtraAttributes(app, plugin, tabHeader, "", file.path);
            } else {
                clearExtraAttributes(tabHeader);
            }
        }

        if (cachedFile?.links) {
            cachedFile.links.forEach((link: LinkCache) => {
                const fileName = file.path.replace(/(.*).md/, "$1");
                const dest = app.metadataCache.getFirstLinkpathDest(link.link, fileName);
                
                if (dest) {
                    const newProps = fetchTargetAttributesSync(app, plugin, dest, false);
                    const escapedHref = CSS.escape(link.link);
                    const internalLinks = leaf.view.containerEl.querySelectorAll(`a.internal-link[href=${escapedHref}]`);
                    
                    internalLinks.forEach((node) => {
                        if (node instanceof HTMLElement) setLinkNewProps(node, newProps);
                    });
                }
            });
        }
    });
}
