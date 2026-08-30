import { App, getAllTags, getLinkpath, LinkCache, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "./main";

/**
 * Renser et HTML-element for alle egendefinerte attributter som starter med 'data-link'.
 */
export function clearExtraAttributes(link: HTMLElement): void {
    if (!link || !link.attributes) return;
    Array.from(link.attributes).forEach(attr => {
        if (attr && attr.name && attr.name.includes("data-link")) {
            link.removeAttribute(attr.name);
        }
    });
}

interface DataviewAPI {
    page(path: string): Record<string, unknown> | undefined;
}

/**
 * DYNAMISK INNSAMLING: Samler synkront inn attributter basert på de AKTIVE stilreglene dine!
 */
export function fetchTargetAttributesSync(
    app: App, 
    plugin: ResuperchargedLinks, 
    dest: TFile, 
    addDataHref: boolean
): Record<string, string> {
    let new_props: Record<string, string> = { tags: "" };
    if (!dest || !plugin || !plugin.settings) return new_props;

    const settings = plugin.settings;
    
    // Hvis Obsidian ikke har rukket å bygge cache for filen ennå, returner tomme props trygt
    const cache = app.metadataCache.getFileCache(dest);
    if (!cache) return new_props;

    const frontmatter = cache.frontmatter as Record<string, unknown> | undefined;

    // Henter unike egenskapsnavn direkte fra dine aktive selectors i stedet for en global liste
    const activeAttributes = new Set<string>();
    if (settings.selectors && Array.isArray(settings.selectors)) {
        settings.selectors.forEach(selector => {
            if (selector && selector.type === 'attribute' && selector.name) {
                activeAttributes.add(selector.name);
            }
        });
    }

    if (frontmatter) {
        activeAttributes.forEach(attribute => {
            if (Object.prototype.hasOwnProperty.call(frontmatter, attribute)) {
                const value = frontmatter[attribute];
                if (value !== null && value !== undefined) {
                    if (attribute === 'tag' || attribute === 'tags') {
                        new_props['tags'] += String(value);
                    } else {
                        new_props[attribute] = String(value);
                    }
                }
            }
        });
    }

    // Obsidians innebygde tag-register
    if (settings.targetTags) {
        const allTags = getAllTags(cache);
        if (allTags) {
            new_props["tags"] += allTags.join(' ');
        }
    }

    if (addDataHref) {
        new_props['data-href'] = dest.basename;
    }
    new_props['path'] = dest.path;

    // Henter inline-felter via Dataview (f.eks: `status:: active`)
    const getResults = (api: DataviewAPI) => {
        const page = api.page(dest.path);
        if (!page) return;
        
        activeAttributes.forEach((field: string) => {
            const value = page[field];
            if (value !== null && value !== undefined) {
                new_props[field] = String(value);
            }
        });
    };

    const appWithPlugins = app as Record<string, any>;
    if (settings.getFromInlineField && appWithPlugins.plugins?.enabledPlugins?.has("dataview")) {
        const api = appWithPlugins.plugins?.plugins?.dataview?.api as DataviewAPI | undefined;
        if (api) {
            getResults(api);
        }
    }

    // CSS-KLARGJØRING (Erstatt mellomrom med bindestrek)
    const hyphenated_props: Record<string, string> = {};
    for (const [key, value] of Object.entries(new_props)) {
        const hyphenatedKey = key.replace(/ /g, '-');
        hyphenated_props[hyphenatedKey] = value;
    }
    new_props = hyphenated_props;

    return new_props;
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
 * Oppdaterer et HTML-element (en lenke) med nye metadata-attributter og CSS-variabler.
 */
function setLinkNewProps(link: HTMLElement, new_props: Record<string, string>): void {
    const attributes = Array.from(link.attributes);
    attributes.forEach(attr => {
        if (attr.name.includes("data-link") && !Object.prototype.hasOwnProperty.call(new_props, attr.name)) {
            link.removeAttribute(attr.name);
        }
    });

    for (const [key, propValue] of Object.entries(new_props)) {
        const dom_key = processKey(key);
        const name = "data-link-" + dom_key;
        const curValue = link.getAttribute(name);
        const newValue = processValue(key, propValue);

        if (!newValue || curValue !== newValue) {
            link.setAttribute(name, newValue);
            
            if (newValue && (newValue.startsWith('http') || newValue.startsWith('data:'))) {
                link.style.setProperty(`--data-link-${dom_key}`, `url(${newValue})`);
            } else if (newValue) {
                link.style.setProperty(`--data-link-${dom_key}`, newValue);
            }
        }
    }

    if (!link.classList.contains("data-link-icon")) link.addClass("data-link-icon");
    if (!link.classList.contains("data-link-icon-after")) link.addClass("data-link-icon-after");
    if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
}

/**
 * Slår opp målet til en HTML-lenke i Obsidians cache og oppdaterer den.
 */
function updateLinkExtraAttributes(app: App, plugin: ResuperchargedLinks, link: HTMLElement, destName: string): void {
    const hrefAttr = link.getAttribute('href');
    const linkHref = hrefAttr ? hrefAttr.split('#')[0] : undefined;
    
    if (linkHref) {
        const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName);
        if (dest) {
            const new_props = fetchTargetAttributesSync(app, plugin, dest, false);
            setLinkNewProps(link, new_props);
        }
    }
}

/**
 * Omfattende funksjon for å oppdatere elementer som ikke er standard lenker.
 */
export function updateDivExtraAttributes(
    app: App, 
    plugin: ResuperchargedLinks, 
    link: HTMLElement, 
    destName: string, 
    linkName?: string, 
    filter_collapsible: boolean = false
): void {
    const parent = link.parentElement;
    
    if (filter_collapsible && parent) {
        const className = parent.getAttribute("class");
        if (className && className.includes('mod-collapsible')) return;
    }

    if (!linkName) {
        linkName = link.textContent || "";
    }

    const attributeSources = [
        () => parent?.getAttribute('data-path'),
        () => parent?.getAttribute("data-href"),
        () => parent?.getAttribute("href"),
        () => link.getAttribute("data-href"),
        () => link.getAttribute("href"),
        () => {
            if (parent?.getAttribute("class") === "suggestion-content") {
                const nextEl = link.nextElementSibling;
                if (nextEl && nextEl.textContent) {
                    return nextEl.textContent + (linkName || "");
                }
            }
            return null;
        }
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
        const new_props = fetchTargetAttributesSync(app, plugin, dest, true);
        setLinkNewProps(link, new_props);
    }
}

/**
 * Skanner et ferdigtegnet Markdown-HTML-element etter interne lenker.
 */
export function updateElLinks(
    app: App, 
    plugin: ResuperchargedLinks, 
    el: HTMLElement, 
    ctx: MarkdownPostProcessorContext
): void {
    const links = el.querySelectorAll('a.internal-link');
    const destName = ctx.sourcePath.replace(/(.*).md/, "$1");
    
    links.forEach((node) => {
        if (node instanceof HTMLElement) {
            updateLinkExtraAttributes(app, plugin, node, destName);
        }
    });
}

/**
 * Styler og oppdaterer lenkene og pillene som vises inne i Obsidians native Egenskapspanel.
 */
export function updatePropertiesPane(
    propertiesEl: HTMLElement, 
    file: TFile, 
    app: App, 
    plugin: ResuperchargedLinks
): void {
    const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) return;

    // --- DEL 1: MULTI-SELECT PILLER ---
    const nodes = propertiesEl.querySelectorAll("div.multi-select-pill-content");
    for (let i = 0; i < nodes.length; ++i) {
        const el = nodes[i] as HTMLElement;
        const linkText = el.textContent;
        if (!linkText) continue;

        const parentEl = el.parentElement?.parentElement?.parentElement?.parentElement;
        const firstChild = parentEl?.children[0];
        const keyEl = firstChild?.children[1] as HTMLInputElement | HTMLSelectElement | undefined;
        
        if (!keyEl || !keyEl.value) continue;
        const key = keyEl.value;
        
        const rawList = frontmatter[key];
        if (!Array.isArray(rawList)) continue;
        const listOfLinks = rawList as string[];

        let foundS: string | null = null;
        for (const s of listOfLinks) {
            if (typeof s === 'string' && s.length > 4 && s.startsWith("[[") && s.endsWith("]]")) {
                const slicedS = s.slice(2, -2);
                const split = slicedS.split("|");
                if ((split.length === 1 && split[0] === linkText) || (split.length === 2 && split[1] === linkText)) {
                    foundS = split[0] || null;
                    break;
                }
            }
        }
        if (foundS) {
            updateDivExtraAttributes(plugin.app, plugin, el, "", foundS);
        }
    }

    // --- DEL 2: SINGLE METADATA LENKER ---
    const singleNodes = propertiesEl.querySelectorAll("div.metadata-link-inner");
    for (let i = 0; i < singleNodes.length; ++i) {
        const el = singleNodes[i] as HTMLElement;
        const linkText = el.textContent;
        if (!linkText) continue;

        const parentEl = el.parentElement?.parentElement?.parentElement;
        const firstChild = parentEl?.children[0];
        const keyEl = firstChild?.children[1] as HTMLInputElement | HTMLSelectElement | undefined;
        
        if (!keyEl || !keyEl.value) continue;
        const key = keyEl.value;
        
        const link = frontmatter[key];
        if (!link || typeof link !== 'string') continue;

        let foundS: string | null = null;
        if (link.length > 4 && link.startsWith("[[") && link.endsWith("]]")) {
            const slicedS = link.slice(2, -2);
            const split = slicedS.split("|");
            if ((split.length === 1 && split[0] === linkText) || (split.length === 2 && split[1] === linkText)) {
                foundS = split[0] || null;
            }
        }
        if (foundS) {
            updateDivExtraAttributes(plugin.app, plugin, el, "", foundS);
        }
    }
}

/**
 * Går systematisk gjennom alle åpne og synlige notatfaner i Obsidian.
 */
export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks): void {
    const settings = plugin.settings;
    
    app.workspace.iterateRootLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView && leaf.view.file) {
            const file: TFile = leaf.view.file;
            const cachedFile = app.metadataCache.getFileCache(file);

            const viewWithMetadata = leaf.view as Record<string, any>;
            const metadata = viewWithMetadata.metadataEditor?.contentEl as HTMLElement | undefined;
            
            if (metadata) {
                updatePropertiesPane(metadata, file, app, plugin);
            }

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
                        const new_props = fetchTargetAttributesSync(app, plugin, dest, false);
                        const escapedHref = CSS.escape(link.link);
                        const internalLinks = leaf.view.containerEl.querySelectorAll(`a.internal-link[href=${escapedHref}]`);
                        
                        internalLinks.forEach((node) => {
                            if (node instanceof HTMLElement) {
                                setLinkNewProps(node, new_props);
                            }
                        });
                    }
                });
            }
        }
    });
}


