import { App, getAllTags, getLinkpath, LinkCache, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian"
import { SCLSettings } from "./Settings"
import RechargedSuperchargedLinks from "./main"

export function clearExtraAttributes(link: HTMLElement): void {
    if (!link || !link.attributes) return;

    // 🚀 FIKSET: Array.from gjør NamedNodeMap om til et ekte, typesikkert array av Attr-objekter
    Array.from(link.attributes).forEach(attr => {
        if (attr && attr.name && attr.name.includes("data-link")) {
            link.removeAttribute(attr.name);
        }
    });
}


// Hjelpe-grensesnitt for å lære TypeScript om Dataview-API-et uten 'any'
interface DataviewAPI {
    page(path: string): Record<string, unknown> | undefined;
}

export function fetchTargetAttributesSync(
    app: App, 
    settings: SCLSettings, 
    dest: TFile, 
    addDataHref: boolean
): Record<string, string> {
    let new_props: Record<string, string> = { tags: "" };
    const cache = app.metadataCache.getFileCache(dest);
    if (!cache) return new_props;

    const frontmatter = cache.frontmatter as Record<string, unknown> | undefined;

    if (frontmatter) {
        settings.targetAttributes.forEach(attribute => {
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

    if (settings.targetTags) {
        const allTags = getAllTags(cache);

        // 🚀 FIKSET: Sjekk at allTags ikke er null før vi prøver å slå dem sammen
        if (allTags) {
            new_props["tags"] += allTags.join(' ');
        }
    }

    if (addDataHref) {
        new_props['data-href'] = dest.basename;
    }
    new_props['path'] = dest.path;

    // Type-sikret intern funksjon i stedet for @ts-ignore
    const getResults = (api: DataviewAPI) => {
        const page = api.page(dest.path);
        if (!page) return;
        
        settings.targetAttributes.forEach((field: string) => {
            const value = page[field];
            if (value !== null && value !== undefined) {
                new_props[field] = String(value);
            }
        });
    };

    // Trygg måte å sjekke eksterne plugins på som fjerner linter-feil
    const appWithPlugins = app as Record<string, any>;
    if (settings.getFromInlineField && appWithPlugins.plugins?.enabledPlugins?.has("dataview")) {
        const api = appWithPlugins.plugins?.plugins?.dataview?.api as DataviewAPI | undefined;
        if (api) {
            getResults(api);
        }
    }

    // Trygg objekt-looping godkjent av Obsidian (erstatter for...in uten sjekk)
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
    // Sjekk om verdi i det hele tatt eksisterer og om den har array-lignende oppførsel (hack-fiksen)
    if (key.includes("publishedIn") && value && typeof value === 'string' && value.startsWith("[[") && value.endsWith("]]")) {
        return value.slice(2, -2);
    }
    return value;
}

function setLinkNewProps(link: HTMLElement, new_props: Record<string, string>): void {
    // Gjort om til et trygt array for å fjerne @ts-ignore på link.attributes
    const attributes = Array.from(link.attributes);
    attributes.forEach(attr => {
        if (attr.name.includes("data-link") && !Object.prototype.hasOwnProperty.call(new_props, attr.name)) {
            link.removeAttribute(attr.name);
        }
    });

    // Bruker Object.entries i stedet for Object.keys().forEach for renere kildekode
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

    // Bruker Obsidians innebygde .addClass-metode (mye sikrere under kjøring)
    if (!link.classList.contains("data-link-icon")) link.addClass("data-link-icon");
    if (!link.classList.contains("data-link-icon-after")) link.addClass("data-link-icon-after");
    if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
}

function updateLinkExtraAttributes(app: App, settings: SCLSettings, link: HTMLElement, destName: string): void {
    const hrefAttr = link.getAttribute('href');
    const linkHref = hrefAttr ? hrefAttr.split('#')[0] : undefined;
    
    if (linkHref) {
        const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName);
        if (dest) {
            const new_props = fetchTargetAttributesSync(app, settings, dest, false);
            setLinkNewProps(link, new_props);
        }
    }
}


export function updateDivExtraAttributes(
    app: App, 
    settings: SCLSettings, 
    link: HTMLElement, 
    destName: string, 
    linkName?: string, 
    filter_collapsible: boolean = false
): void {
    const parent = link.parentElement;
    
    // 🚀 FIKSET: Trygg sjekk av klassenavn på forelder (unngår krasj hvis klasse mangler)
    if (filter_collapsible && parent) {
        const className = parent.getAttribute("class");
        if (className && className.includes('mod-collapsible')) return;
    }

    if (!linkName) {
        linkName = link.textContent || "";
    }

    // 🚀 FIKSET: Gjort funksjonslisten helt typesikker og null-tolerant
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
        const new_props = fetchTargetAttributesSync(app, settings, dest, true);
        setLinkNewProps(link, new_props);
    }
}

export function updateElLinks(
    app: App, 
    plugin: RechargedSuperchargedLinks, 
    el: HTMLElement, 
    ctx: MarkdownPostProcessorContext
): void {
    const settings = plugin.settings;
    const links = el.querySelectorAll('a.internal-link');
    const destName = ctx.sourcePath.replace(/(.*).md/, "$1");
    
    links.forEach((node) => {
        if (node instanceof HTMLElement) {
            updateLinkExtraAttributes(app, settings, node, destName);
        }
    });
}

export function updatePropertiesPane(
    propertiesEl: HTMLElement, 
    file: TFile, 
    app: App, 
    plugin: RechargedSuperchargedLinks
): void {
    const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) return;

    // --- Del 1: Multi-select piller ---
    const nodes = propertiesEl.querySelectorAll("div.multi-select-pill-content");
    for (let i = 0; i < nodes.length; ++i) {
        const el = nodes[i] as HTMLElement;
        const linkText = el.textContent;
        if (!linkText) continue;

        // 🚀 FIKSET: Trygg graving i DOM-treet for å unngå "cannot read property of undefined"
        const firstChild = el.parentElement?.parentElement?.parentElement?.parentElement?.children[0];
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
            updateDivExtraAttributes(plugin.app, plugin.settings, el, "", foundS);
        }
    }

    // --- Del 2: Single metadata lenker ---
    const singleNodes = propertiesEl.querySelectorAll("div.metadata-link-inner");
    for (let i = 0; i < singleNodes.length; ++i) {
        const el = singleNodes[i] as HTMLElement;
        const linkText = el.textContent;
        if (!linkText) continue;

        // 🚀 FIKSET: Trygg navigering i DOM-barna til Obsidian-properties panelet
        const firstChild = el.parentElement?.parentElement?.parentElement?.children[0];
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
            updateDivExtraAttributes(plugin.app, plugin.settings, el, "", foundS);
        }
    }
}

export function updateVisibleLinks(app: App, plugin: RechargedSuperchargedLinks): void {
    const settings = plugin.settings;
    
    app.workspace.iterateRootLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView && leaf.view.file) {
            const file: TFile = leaf.view.file;
            const cachedFile = app.metadataCache.getFileCache(file);

            // 🚀 FIKSET: Hent Obsidian-metadata-editoren på en måte som slipper @ts-ignore
            const viewWithMetadata = leaf.view as Record<string, any>;
            const metadata = viewWithMetadata.metadataEditor?.contentEl as HTMLElement | undefined;
            if (metadata) {
                updatePropertiesPane(metadata, file, app, plugin);
            }

            // 🚀 FIKSET: Hent tabHeader på en måte som aksepteres uten @ts-ignore
            const leafWithHeaders = leaf as Record<string, any>;
            const tabHeader = leafWithHeaders.tabHeaderInnerTitleEl as HTMLElement | undefined;
            
            if (tabHeader) {
                if (settings.enableTabHeader) {
                    updateDivExtraAttributes(app, settings, tabHeader, "", file.path);
                } else {
                    clearExtraAttributes(tabHeader);
                }
            }

            if (cachedFile?.links) {
                cachedFile.links.forEach((link: LinkCache) => {
                    const fileName = file.path.replace(/(.*).md/, "$1");
                    const dest = app.metadataCache.getFirstLinkpathDest(link.link, fileName);
                    if (dest) {
                        const new_props = fetchTargetAttributesSync(app, settings, dest, false);
                        const internalLinks = leaf.view.containerEl.querySelectorAll(`a.internal-link[href="${link.link}"]`);
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
