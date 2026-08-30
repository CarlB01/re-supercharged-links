// 1. Kjernekomponenter fra Obsidian
import { App, MarkdownView, TFile } from "obsidian";

// 2. CodeMirror-komponentene (Disse bruker du nå via de offisielle Obsidian-typene)
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { ViewPlugin, EditorView, ViewUpdate, DecorationSet, WidgetType, Decoration } from "@codemirror/view";

// 3. Dine egne interne plugin-filer
import { SCLSettings } from "./Settings";
import { fetchTargetAttributesSync, processValue } from "./linkAttributes"
import ResuperchargedLinks from "./main";
export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks) 

{
    // Implements the live preview supercharging
    // Code structure based on https://github.com/nothingislost/obsidian-cm6-attributes/blob/743d71b0aa616407149a0b6ea5ffea28e2154158/src/main.ts
    // Code help credits to @NothingIsLost! They have been a great help getting this to work properly.

class HeaderWidget extends WidgetType {
    // 🚀 1. FIKSET: Bruk declare for å unngå manglende initialisering i constructor
    declare attributes: Record<string, string>;
    declare after: boolean;

    constructor(attributes: Record<string, string>, after: boolean) {
        super();
        this.attributes = attributes;
        this.after = after;
    }

    toDOM() {
        const headerEl = document.createElement("span");
        
        // 🚀 2. FIKSET: Bruk standard classList.add i stedet for .addClass for å slippe typefeil
        if (this.after) {
            headerEl.classList.add('data-link-icon-after');
        } else {
            headerEl.classList.add('data-link-icon');
        }

        // 🚀 3. FIKSET: Bruk trygg Object.entries i stedet for usikker for...in løkke
        for (const [key, value] of Object.entries(this.attributes)) {
            if (value === null || value === undefined) continue;

            // Sett attributten trygt på HTML-elementet
            headerEl.setAttribute(key, value);
            
            // CSS doesn't allow interpolation of variables for URLs, so do it beforehand to be nice.
            if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) {
                headerEl.style.setProperty(`--${key}`, `url(${value})`);
            } else {
                headerEl.style.setProperty(`--${key}`, processValue(key, value));
            }
        }
        
        return headerEl;
    }

    ignoreEvent() {
        return true;
    }
}


    const settings = plugin.settings;
    const viewPlugin = ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged) {
                    this.decorations = this.decorations.map(update.changes);

                    update.changes.iterChanges((fromA, toA, fromB, toB, t) => {
                        // Update all 'line blocks' between the range changed. Prevents weird graphical bugs
                        const minFrom = update.view.lineBlockAt(fromB).from;
                        const maxTo = update.view.lineBlockAt(toB).to;
                        // remove things within bounds
                        this.decorations = this.decorations.update({
                            filter: (from, to) => to < minFrom || from > maxTo});

                        // Update decorations within bounds
                        this.decorations = RangeSet.join([this.decorations,
                            this.buildDecorations(update.view, minFrom, maxTo)]);
                    });
                }
                else if (update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            destroy() {
            }

            buildDecorations(view: EditorView, updateFrom: number = -1, updateTo: number = -1): DecorationSet {
                let builder = new RangeSetBuilder<Decoration>();
                if (!settings.enableEditor) {
                    return builder.finish();
                }

                // 🚀 FIKSET: Lag en solid sjekk helt øverst i funksjonen din
                // 🚀 1. FIKSET: Erstattet utdatert 'editorViewField' med Obsidians moderne API
                const mdView = app.workspace.getActiveViewOfType(MarkdownView);

                if (!mdView || !mdView.file) return builder.finish();

                // 🚀 FIKSET: Lås basenavnet til en konstant her oppe hvor TypeScript VET det er trygt!
                const activeFileBasename = mdView.file.basename; 

                let lastAttributes: Record<string, string> = {};
                let iconDecoAfter: Decoration | null = null;
                let iconDecoAfterWhere: number | null = null;

                let mdAliasFrom: number | null = null;
                let mdAliasTo: number | null = null;

                for (let { from, to } of view.visibleRanges) {
                    if (updateFrom !== -1 && (to < updateFrom || from > updateTo)) continue;

                    syntaxTree(view.state).iterate({
                        from,
                        to,
                        enter: (node) => {
                            if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;
                            
                            // @ts-ignore - Internal type mismatch between Obsidian-provided CodeMirror typings and npm @lezer/common
                            const tokenProps = node.type.prop(tokenClassNodeProp);
                            if (!tokenProps) return;

                            const props = new Set(tokenProps.split(" "));

                            // Markdown-formatering (f.eks. [[ eller ]]) - hopp over
                            const isMDFormatting = props.has('formatting-link') || props.has('formatting-link-string');
                            if (isMDFormatting) return;

                            const isLink = props.has("hmd-internal-link"); 
                            const isAlias = props.has("link-alias"); 
                            const isPipe = props.has("link-alias-pipe"); 

                            const isMDLink = props.has('link'); 
                            const isMDUrl = props.has('url'); 

                            if (isMDLink) {
                                mdAliasFrom = node.from;
                                mdAliasTo = node.to;
                            }

                            if (!isPipe && !isAlias) {
                                if (iconDecoAfter && iconDecoAfterWhere !== null) {
                                    // 🚀 2. SIKKERHETSSJEKK: Sørg for at vi aldri legger til bakover i tid
                                    builder.add(iconDecoAfterWhere, iconDecoAfterWhere, iconDecoAfter);
                                    iconDecoAfter = null;
                                    iconDecoAfterWhere = null;
                                }
                            }

                            if ((isLink && !isAlias && !isPipe) || isMDUrl) {
                                let linkText = view.state.doc.sliceString(node.from, node.to);
                                // 🚀 FIKSET: Fallback sikrer at verdien alltid blir en 'string' og aldri 'undefined'
                                linkText = linkText.split("#")[0] || "";                                
                                // 🚀 FIKSET: Fortell TypeScript at 'file' enten er en TFile eller null fra starten av
                                let file: TFile | null = app.metadataCache.getFirstLinkpathDest(linkText, activeFileBasename);
                                if (isMDUrl && !file) {
                                    try {
                                        file = app.vault.getAbstractFileByPath(decodeURIComponent(linkText)) as TFile;
                                    }
                                    catch(e) {}
                                }

                                if (file) {
                                    let _attributes = fetchTargetAttributesSync(app, plugin, file, true);
                                    let attributes: Record<string, string> = {};
                                    
                                    // 🚀 3. FIKSET: Bruk trygg Object.entries i stedet for usikker for...in
                                    for (const [key, val] of Object.entries(_attributes)) {
                                        attributes["data-link-" + key] = val;
                                    }

                                    let deco = Decoration.mark({
                                        attributes,
                                        class: "data-link-text"
                                    });
                                    
                                    let iconDecoBefore = Decoration.widget({
                                        widget: new HeaderWidget(attributes, false),
                                    });
                                    
                                    iconDecoAfter = Decoration.widget({
                                        widget: new HeaderWidget(attributes, true),
                                    });

                                    if (isMDUrl && mdAliasFrom !== null && mdAliasTo !== null) {
                                        let mdDeco = Decoration.mark({
                                            attributes: attributes,
                                            class: "data-link-text"
                                        });

                                        // For Markdown URL-er må vi legge til elementene i streng rekkefølge
                                        if (mdAliasFrom >= from) {
                                            builder.add(mdAliasFrom, mdAliasFrom, iconDecoBefore);
                                            builder.add(mdAliasFrom, mdAliasTo, mdDeco);
                                        }
                                        if (iconDecoAfter && mdAliasTo >= from) {
                                            builder.add(mdAliasTo, mdAliasTo, iconDecoAfter);
                                            iconDecoAfter = null;
                                            iconDecoAfterWhere = null;
                                            mdAliasFrom = null;
                                            mdAliasTo = null;
                                        }
                                    } else {
                                        if (node.from >= from) {
                                            builder.add(node.from, node.from, iconDecoBefore);
                                        }
                                    }

                                    if (node.from >= from && node.to <= to) {
                                        builder.add(node.from, node.to, deco);
                                    }
                                    
                                    lastAttributes = attributes;
                                    iconDecoAfterWhere = node.to;
                                }
                            } else if (isLink && isAlias) {
                                let deco = Decoration.mark({
                                    attributes: lastAttributes,
                                    class: "data-link-text"
                                });
                                
                                if (node.from >= from && node.to <= to) {
                                    builder.add(node.from, node.to, deco);
                                }
                                
                                if (iconDecoAfter && node.to >= from) {
                                    builder.add(node.to, node.to, iconDecoAfter);
                                    iconDecoAfter = null;
                                    iconDecoAfterWhere = null;
                                }
                            }
                        }
                    });
                }
                return builder.finish();
            }
        },
        {
            decorations: v => v.decorations
        }
    );
    return viewPlugin;
}
