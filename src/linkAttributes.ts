import { App, getAllTags, getLinkpath, LinkCache, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian"
import { SCLSettings } from "./Settings"
import ResuperchargedLinks from "./main"

/**
 * Renser et HTML-element for alle egendefinerte attributter som starter med 'data-link'.
 * Dette nullstiller elementet slik at gamle stiler ikke blir hengende igjen.
 * 
 * @param link - HTML-elementet (lenken) som skal renses
 */
export function clearExtraAttributes(link: HTMLElement): void {
    // SIKKERHETSSJEKK: Hvis elementet ikke eksisterer, eller mangler attributter, avbryt med en gang.
    if (!link || !link.attributes) return;

    // 🚀 UNNGÅR KRAJS: Konverterer elementets NamedNodeMap til et ekte, typesikkert array.
    // Hvis vi looper direkte over en levende NodeMap mens vi sletter attributter, vil indeksen
    // forskyve seg underveis, og koden vil hoppe over annethvert attributt. Array.from løser dette.
    Array.from(link.attributes).forEach(attr => {
        // Hvis attributtets navn inneholder teksten "data-link" (f.eks data-link-tags eller data-link-status)
        if (attr && attr.name && attr.name.includes("data-link")) {
            link.removeAttribute(attr.name); // Slett attributtet fra HTML-elementet
        }
    });
}



// Hjelpe-grensesnitt for å lære TypeScript om Dataview-API-et uten 'any'
interface DataviewAPI {
    page(path: string): Record<string, unknown> | undefined;
}

/**
 * Samler synkront inn alle mål-attributter, tagger og metadata for et spesifikt notat.
 * Kombinerer data fra Obsidians cache og eventuelt Dataview-pluginet.
 * 
 * @param app - Obsidians globale App-instans
 * @param settings - Pluginets innstillinger (for å vite hvilke attributter vi leter etter)
 * @param dest - TFile-objektet til notatet vi henter data fra
 * @param addDataHref - Boolean som bestemmer om vi skal legge til filnavnet som et attributt
 * @returns Et objekt (Record) der nøkkelen er attributtnavnet og verdien er dataen som streng
 */
export function fetchTargetAttributesSync(
    app: App, 
    settings: SCLSettings, 
    dest: TFile, 
    addDataHref: boolean
): Record<string, string> {
    // Initialiserer resultat-objektet med en tom 'tags'-streng som standard
    let new_props: Record<string, string> = { tags: "" };
    
    // Henter Obsidians lagrede cache for denne spesifikke filen
    const cache = app.metadataCache.getFileCache(dest);
    if (!cache) return new_props; // Hvis filen ikke har cache (f.eks. tom/ny), returner tomme data

    // KILDE 1: Standard YAML Frontmatter (Egenskaper øverst i notatet)
    const frontmatter = cache.frontmatter as Record<string, unknown> | undefined;

    if (frontmatter) {
        // Går gjennom listen over attributter brukeren har sagt at pluginet skal spionere på
        settings.targetAttributes.forEach(attribute => {
            // Sjekker trygt om akkurat dette attributtet finnes i notatets frontmatter
            if (Object.prototype.hasOwnProperty.call(frontmatter, attribute)) {
                const value = frontmatter[attribute];
                // Sørger for at vi ikke prosesserer tomme verdier (null/undefined)
                if (value !== null && value !== undefined) {
                    // Spesialhåndtering: Hvis attributtet heter 'tag' eller 'tags', legger vi det til i fellespotten
                    if (attribute === 'tag' || attribute === 'tags') {
                        new_props['tags'] += String(value);
                    } else {
                        // Ellers lagres attributtet under sitt eget navn (f.eks new_props['status'] = 'done')
                        new_props[attribute] = String(value);
                    }
                }
            }
        });
    }

    // KILDE 2: Obsidians innebygde tag-register (fanger opp #tagger skrevet nede i selve teksten)
    if (settings.targetTags) {
        const allTags = getAllTags(cache); // Henter absolutt alle tagger i filen

        // 🚀 SIKKERHETSSJEKK: Sjekker at det faktisk finnes tagger før vi slår dem sammen med et mellomrom
        if (allTags) {
            new_props["tags"] += allTags.join(' ');
        }
    }

    // KILDE 3: Metadata for selve filstrukturen (filnavn og filbane)
    if (addDataHref) {
        new_props['data-href'] = dest.basename; // Kun filnavnet uten .md (f.eks 'Møtenotat')
    }
    new_props['path'] = dest.path; // Hele filbanen (f.eks '01_Mangler/Møtenotat.md')

    // INTERN HJELPEFUNKSJON: Henter inline-felter via Dataview (f.eks: `status:: active`)
    const getResults = (api: DataviewAPI) => {
        const page = api.page(dest.path); // Henter Dataview sin rike versjon av siden
        if (!page) return;
        
        // Går gjennom målattributtene igjen og sjekker om Dataview har funnet inline-varianter
        settings.targetAttributes.forEach((field: string) => {
            const value = page[field];
            if (value !== null && value !== undefined) {
                new_props[field] = String(value); // Overskriver eller legger til i new_props
            }
        });
    };

    // KILDE 4: Dataview-plugin sjekk. Sjekker trygt om Dataview er installert og aktivert i Obsidian.
    const appWithPlugins = app as Record<string, any>;
    if (settings.getFromInlineField && appWithPlugins.plugins?.enabledPlugins?.has("dataview")) {
        const api = appWithPlugins.plugins?.plugins?.dataview?.api as DataviewAPI | undefined;
        if (api) {
            getResults(api); // Kjører inline-skanningen hvis API-et er klart
        }
    }

    // 🚀 CSS-KLARGJØRING: Konverterer alle mellomrom i egenskapsnavn til bindestreker.
    // CSS-attributtselektorer takler ikke mellomrom i selve attributtnavnet (f.eks. `data-link-my attribute`).
    const hyphenated_props: Record<string, string> = {};
    for (const [key, value] of Object.entries(new_props)) {
        const hyphenatedKey = key.replace(/ /g, '-'); // "my attribute" blir til "my-attribute"
        hyphenated_props[hyphenatedKey] = value;
    }
    new_props = hyphenated_props; // Erstatte det gamle objektet med det nye, vaskede objektet

    return new_props; // Returnerer den ferdige pakken med metadata
}


/**
 * Gjør om en tekststreng til et gyldig CSS/HTML-attributtnavn ved å erstatte mellomrom med bindestrek.
 * F.eks: "project status" -> "project-status"
 */
export function processKey(key: string): string {
    return key.replace(/ /g, '-');
}


/**
 * Vasker og formaterer verdien til et attributt før det skrives ut til HTML/CSS.
 * Stripper utelukkende bort interne Obsidian-lenkeklammer `[[ ]]` fra spesifikke felter.
 * 
 * @param key - Attributtets navn (brukes til å sjekke om feltet krever spesialbehandling)
 * @param value - Verdien som skal vaskes
 */
export function processValue(key: string, value: string): string {
    // Sjekk om verdi i det hele tatt eksisterer og om den har en tekststreng
    if (!value || typeof value !== 'string') return value;

    // SPESIALTILFELLE (Hack-fiks): Hvis attributtnavnet inneholder "publishedIn", 
    // og verdien starter med "[[" og slutter med "]]"
    if (key.includes("publishedIn") && value.startsWith("[[") && value.endsWith("]]")) {
        // Slicer bort de to første og to siste tegnene (fjerner klammeparentesene)
        // F.eks: "[[2026-Plan]]" blir til "2026-Plan"
        return value.slice(2, -2);
    }
    
    // Returnerer verdien helt uendret for alle andre tilfeller, slik at hermetegn bevares rått
    return value; 
}





/**
 * Oppdaterer et HTML-element (en lenke) med nye metadata-attributter og CSS-variabler,
 * samt sørger for at elementet har de nødvendige klassene for ikon- og tekststyling.
 * 
 * @param link - HTML-elementet som skal oppdateres
 * @param new_props - Objektet som inneholder de ferske metadataene (nøkkel og verdi)
 */
function setLinkNewProps(link: HTMLElement, new_props: Record<string, string>): void {
    // 1. RENSING: Gjør om elementets attributter til et array for å fjerne foreldede stiler trygt.
    const attributes = Array.from(link.attributes);
    attributes.forEach(attr => {
        // Hvis elementet har et data-link-attributt som IKKE finnes i de nye egenskapene, slett det.
        if (attr.name.includes("data-link") && !Object.prototype.hasOwnProperty.call(new_props, attr.name)) {
            link.removeAttribute(attr.name);
        }
    });

    // 2. SKRIVING: Går gjennom alle de nye egenskapene og dytter dem inn i HTML-strukturen.
    for (const [key, propValue] of Object.entries(new_props)) {
        const dom_key = processKey(key);            // Gjør om mellomrom til bindestrek (f.eks "my-prop")
        const name = "data-link-" + dom_key;         // Bygger HTML-navnet: "data-link-my-prop"
        const curValue = link.getAttribute(name);    // Sjekker om elementet allerede har en verdi
        const newValue = processValue(key, propValue); // Vasker verdien (fjerner eventuelle [[ ]])

        // Hvis verdien er ny, eller har endret seg, oppdaterer vi elementet
        if (!newValue || curValue !== newValue) {
            link.setAttribute(name, newValue); // Setter HTML-attributtet: data-link-status="active"
            
            // Sjekker om verdien er en ekstern URL eller et bilde (base64-data)
            if (newValue && (newValue.startsWith('http') || newValue.startsWith('data:'))) {
                // Hvis det er et bilde/ikon-url, pakkes det inn i url() for CSS-bruk
                link.style.setProperty(`--data-link-${dom_key}`, `url(${newValue})`);
            } else if (newValue) {
                // Ellers lagres råverdien direkte som en lokal CSS-variabel på elementet
                link.style.setProperty(`--data-link-${dom_key}`, newValue);
            }
        }
    }

    // 3. KLASSE-SJEKK: Sikrer at elementet har de tre obligatoriske CSS-klassene pluginet krever.
    // addClass er en trygg Obsidian-spesifikk metode for å legge til klasser uten å overskrive eksisterende.
    if (!link.classList.contains("data-link-icon")) link.addClass("data-link-icon");
    if (!link.classList.contains("data-link-icon-after")) link.addClass("data-link-icon-after");
    if (!link.classList.contains("data-link-text")) link.addClass("data-link-text");
}


/**
 * Slår opp målet til en HTML-lenke i Obsidians cache, henter dens egenskaper,
 * og oppdaterer lenken med de nye data-attributtene.
 * 
 * @param app - Obsidians globale App-instans
 * @param settings - Pluginets innstillinger
 * @param link - HTML-lenken (<a>) som skal oppdateres
 * @param destName - Banen til notatet der lenken befinner seg (brukes til å løse opp relative lenker)
 */
function updateLinkExtraAttributes(app: App, settings: SCLSettings, link: HTMLElement, destName: string): void {
    const hrefAttr = link.getAttribute('href');
    // Splitter på '#' for å fjerne eventuelle lenker til spesifikke overskrifter (f.eks "Notat#Overskrift" -> "Notat")
    const linkHref = hrefAttr ? hrefAttr.split('#')[0] : undefined;
    
    if (linkHref) {
        // Ber Obsidian finne den faktiske filen på disken som denne lenken peker på
        const dest = app.metadataCache.getFirstLinkpathDest(linkHref, destName);
        if (dest) {
            // Henter metadata synkront (false betyr at vi ikke legger til 'data-href'-attributt her)
            const new_props = fetchTargetAttributesSync(app, settings, dest, false);
            // Sender HTML-elementet og dataene til oppdatering
            setLinkNewProps(link, new_props);
        }
    }
}



/**
 * Omfattende funksjon for å oppdatere elementer som ikke er standard lenker (f.eks søkebokser, menyer).
 * Graver i DOM-treet for å finne ut hvilket notat elementet representerer.
 */
export function updateDivExtraAttributes(
    app: App, 
    settings: SCLSettings, 
    link: HTMLElement, 
    destName: string, 
    linkName?: string, 
    filter_collapsible: boolean = false
): void {
    const parent = link.parentElement;
    
    // SIKKERHETSSJEKK: Hvis aktivert, hopper vi over elementet dersom forelderen er en kollapsbar meny (mod-collapsible)
    if (filter_collapsible && parent) {
        const className = parent.getAttribute("class");
        if (className && className.includes('mod-collapsible')) return;
    }

    // Hvis ingen spesifikk tekst ble sendt inn, bruker vi elementets egen synlige tekst som utgangspunkt
    if (!linkName) {
        linkName = link.textContent || "";
    }

    // 🚀 TYPESIKKER GRAVING: En liste over prioriterte steder i HTML-strukturen der filnavnet eller 
    // filbanen til målnotatet kan ligge gjemt. Den stopper på den første den finner (break).
    const attributeSources = [
        () => parent?.getAttribute('data-path'), // Ofte brukt i filutforskere
        () => parent?.getAttribute("data-href"),
        () => parent?.getAttribute("href"),
        () => link.getAttribute("data-href"),
        () => link.getAttribute("href"),
        () => {
            // Spesialhåndtering for Obsidians søk/hurtigmeny (suggestions-boks)
            if (parent?.getAttribute("class") === "suggestion-content") {
                const nextEl = link.nextElementSibling;
                if (nextEl && nextEl.textContent) {
                    return nextEl.textContent + (linkName || "");
                }
            }
            return null;
        }
    ];

    // Går gjennom kildene én etter én til vi finner en verdi
    for (const source of attributeSources) {
        const value = source();
        if (value) {
            linkName = value; // Lagrer den funne filbanen/filnavnet
            break;            // Avbryter løkken siden vi har funnet målet vårt
        }
    }

    // Finn filen i cachen ved hjelp av Obsidians getLinkpath (som rensker vekk rusk fra filbanen)
    const dest = app.metadataCache.getFirstLinkpathDest(getLinkpath(linkName), destName);
    if (dest) {
        // Henter egenskapene (true betyr at vi vil tvinge inn 'data-href'-attributtet)
        const new_props = fetchTargetAttributesSync(app, settings, dest, true);
        setLinkNewProps(link, new_props); // Utfør oppdateringen av HTML-elementet
    }
}


/**
 * Skanner et ferdigtegnet Markdown-HTML-element etter interne lenker,
 * og oppdaterer hver enkelt lenke med egenskapsdata.
 * 
 * @param app - Obsidians globale App-instans
 * @param plugin - Selve hovedinstansen til pluginet ditt
 * @param el - HTML-containeren som Obsidian akkurat har tegnet opp på skjermen
 * @param ctx - Konteksten til Markdown-filen som prosesseres (for å vite hvor vi er)
 */
export function updateElLinks(
    app: App, 
    plugin: ResuperchargedLinks, 
    el: HTMLElement, 
    ctx: MarkdownPostProcessorContext
): void {
    const settings = plugin.settings;
    // Finner alle HTML-lenker (<a>) som har klassen 'internal-link' inne i det gjeldende elementet
    const links = el.querySelectorAll('a.internal-link');
    // Renser filbanen til kilden for å fjerne filendelsen .md (f.eks "Mapper/Fil.md" -> "Mapper/Fil")
    const destName = ctx.sourcePath.replace(/(.*).md/, "$1");
    
    // Går gjennom hver eneste lenke funnet på siden
    links.forEach((node) => {
        // Sjekker at noden faktisk er et trygt HTMLElement før vi behandler den
        if (node instanceof HTMLElement) {
            updateLinkExtraAttributes(app, settings, node, destName);
        }
    });
}


/**
 * Styler og oppdaterer lenkene og pillene som vises inne i Obsidians native Egenskapspanel (Properties).
 * 
 * @param propertiesEl - Selve HTML-containeren til egenskapsvisningen
 * @param file - Det aktive notatet som panelet viser data for
 */
export function updatePropertiesPane(
    propertiesEl: HTMLElement, 
    file: TFile, 
    app: App, 
    plugin: ResuperchargedLinks
): void {
    // Henter frontmatter for filen som vises i panelet. Avbryt hvis den er tom.
    const frontmatter = app.metadataCache.getCache(file.path)?.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) return;

    // --- DEL 1: MULTI-SELECT PILLER (For egenskaper av typen Liste / List) ---
    // Finner alle små tekstpiller inne i egenskapslisten
    const nodes = propertiesEl.querySelectorAll("div.multi-select-pill-content");
    for (let i = 0; i < nodes.length; ++i) {
        const el = nodes[i] as HTMLElement;
        const linkText = el.textContent; // Teksten inni pillen (f.eks "Boktittel")
        if (!linkText) continue;

        // 🚀 TRYGG GRAVING: Klatrer 4 nivåer opp i DOM-treet for å finne "nøkkelen" til denne listen.
        // Dette unngår krasj hvis Obsidian oppdaterer HTML-strukturen sin i fremtidige versjoner.
        const firstChild = el.parentElement?.parentElement?.parentElement?.parentElement?.children[0];
        const keyEl = firstChild?.children[1] as HTMLInputElement | HTMLSelectElement | undefined;
        
        if (!keyEl || !keyEl.value) continue;
        const key = keyEl.value; // Dette blir egenskapsnavnet (f.eks "tags" eller "related")
        
        const rawList = frontmatter[key];
        if (!Array.isArray(rawList)) continue; // Sjekker at dataen i frontmatter faktisk er en liste (array)
        const listOfLinks = rawList as string[];

        let foundS: string | null = null;
        // Går gjennom elementene i frontmatter-listen for å finne matchen til pille-teksten
        for (const s of listOfLinks) {
            // Hvis elementet er en intern lenke skrevet som "[[Målfil]]" eller "[[Målfil|Visningsnavn]]"
            if (typeof s === 'string' && s.length > 4 && s.startsWith("[[") && s.endsWith("]]")) {
                const slicedS = s.slice(2, -2); // Stripper klammene
                const split = slicedS.split("|"); // Splitter på alias-strek hvis den finnes
                // Sjekker om råfilnavnet eller aliaset matcher teksten som står inni pille-elementet på skjermen
                if ((split.length === 1 && split[0] === linkText) || (split.length === 2 && split[1] === linkText)) {
                    foundS = split[0] || null; // Lagrer det sanne filnavnet vi fant
                    break;
                }
            }
        }
        // Hvis vi fant en match, kjører vi updateDivExtraAttributes for å dytte stiler på den spesifikke pillen
        if (foundS) {
            updateDivExtraAttributes(plugin.app, plugin.settings, el, "", foundS);
        }
    }

    // --- DEL 2: SINGLE METADATA LENKER (For egenskaper av typen Tekst/Lenke som ikke er lister) ---
    // Finner alle enkle lenkebokser i panelet
    const singleNodes = propertiesEl.querySelectorAll("div.metadata-link-inner");
    for (let i = 0; i < singleNodes.length; ++i) {
        const el = singleNodes[i] as HTMLElement;
        const linkText = el.textContent;
        if (!linkText) continue;

        // Klatrer 3 nivåer opp for å finne nøkkelen/navnet på egenskapen
        const firstChild = el.parentElement?.parentElement?.parentElement?.children[0];
        const keyEl = firstChild?.children[1] as HTMLInputElement | HTMLSelectElement | undefined;
        
        if (!keyEl || !keyEl.value) continue;
        const key = keyEl.value;
        
        const link = frontmatter[key];
        if (!link || typeof link !== 'string') continue; // Sjekker at verdien er en ren tekststreng

        let foundS: string | null = null;
        // Sjekker om den enkle tekststrengen er en intern Obsidian-lenke med klammer
        if (link.length > 4 && link.startsWith("[[") && link.endsWith("]]")) {
            const slicedS = link.slice(2, -2);
            const split = slicedS.split("|");
            if ((split.length === 1 && split[0] === linkText) || (split.length === 2 && split[1] === linkText)) {
                foundS = split[0] || null;
            }
        }
        // Hvis vi fant en gyldig intern lenke, dytter vi stil-attributter på elementet
        if (foundS) {
            updateDivExtraAttributes(plugin.app, plugin.settings, el, "", foundS);
        }
    }
}


/**
 * Går systematisk gjennom alle åpne og synlige notatfaner i Obsidian 
 * og oppdaterer egenskapspaneler, fanetitler og interne lenker i sanntid.
 * 
 * @param app - Obsidians globale App-instans
 * @param plugin - Hovedinstansen til pluginet ditt
 */
export function updateVisibleLinks(app: App, plugin: ResuperchargedLinks): void {
    const settings = plugin.settings; // Henter brukerens innstillinger
    
    // 1. ITERERING: Går igjennom hvert eneste "blad" (fane/vindu) i Obsidians hovedgrensesnitt
    app.workspace.iterateRootLeaves((leaf) => {
        
        // Sjekker at fanen faktisk viser et Markdown-dokument (et notat) og har en tilknyttet fil
        if (leaf.view instanceof MarkdownView && leaf.view.file) {
            const file: TFile = leaf.view.file; // Den fysiske filen som vises i denne fanen
            const cachedFile = app.metadataCache.getFileCache(file); // Filens lagrede cache (lenker, tagger osv.)

            // --- DEL A: OPPDATER EGENSKAPSPANEL (Properties) ---
            // 🚀 UTEN @TS-IGNORE: Caster visningen til et dynamisk Record-objekt for å hente Obsidians
            // interne metadataEditor på en typesikker måte uten at linteren klager.
            const viewWithMetadata = leaf.view as Record<string, any>;
            const metadata = viewWithMetadata.metadataEditor?.contentEl as HTMLElement | undefined;
            
            // Hvis notatet har et synlig egenskapspanel i toppen, oppdaterer vi dette
            if (metadata) {
                updatePropertiesPane(metadata, file, app, plugin);
            }

            // --- DEL B: OPPDATER FANETITTEL (Tab Header) ---
            // 🚀 UTEN @TS-IGNORE: Henter HTML-elementet for selve faneteksten øverst på skjermen
            const leafWithHeaders = leaf as Record<string, any>;
            const tabHeader = leafWithHeaders.tabHeaderInnerTitleEl as HTMLElement | undefined;
            
            if (tabHeader) {
                // Sjekker om brukeren har aktivert styling av faner i innstillingene
                if (settings.enableTabHeader) {
                    // Hvis ja, henter vi data for gjeldende fil og dytter stil-attributter på fanetittelen
                    updateDivExtraAttributes(app, settings, tabHeader, "", file.path);
                } else {
                    // Hvis nei, vasker vi bort eventuelle gamle stiler fra fanen
                    clearExtraAttributes(tabHeader);
                }
            }

            // --- DEL C: OPPDATER LENKER INNI SELVE NOTATTEKSTEN ---
            // Sjekker om den gjeldende filen har noen registrerte utgående lenker i cachen sin
            if (cachedFile?.links) {
                cachedFile.links.forEach((link: LinkCache) => {
                    // Renser navnet til gjeldende fil (fjerner .md fra filbanen)
                    const fileName = file.path.replace(/(.*).md/, "$1");
                    
                    // Slår opp målnotatet (destinasjonen) som lenken peker til
                    const dest = app.metadataCache.getFirstLinkpathDest(link.link, fileName);
                    
                    if (dest) {
                        // Henter de ferske egenskapene til det notatet det lenkes til
                        const new_props = fetchTargetAttributesSync(app, settings, dest, false);
                        
                        // 🚀 ULTRA-TRYGG LØSNING: Bruk CSS.escape() på hele lenkestien.
                        // Merk at vi fjerner "" rundt ${...} i querySelectorAll, 
                        // fordi CSS.escape() legger til nødvendig rømning automatisk.
                        const escapedHref = CSS.escape(link.link);
                        
                        // Finner alle fysiske lenker (<a>) inne i fanens HTML-container som har akkurat denne href-en
                        // Her settes [href=${escapedHref}] inn uten egne hermetegn rundt verdien:
                        const internalLinks = leaf.view.containerEl.querySelectorAll(`a.internal-link[href=${escapedHref}]`);
                        
                        // Går gjennom alle treffene i teksten og dytter på de nye data- og fargeattributtene
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
