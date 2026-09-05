import { App, MarkdownView, TFile } from "obsidian";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { ViewPlugin, EditorView, ViewUpdate, DecorationSet, WidgetType, Decoration } from "@codemirror/view";
import { fetchTargetAttributesSync, processValue } from "./linkAttributes";
import ResuperchargedLinks from "./main";

/**
 * 🟢 HIGH-PERFORMANCE WIDGET: Renders decorative icons before/after links
 */
class HeaderWidget extends WidgetType {
    declare attributes: Record<string, string>;
    declare after: boolean;

    constructor(attributes: Record<string, string>, after: boolean) {
        super();
        this.attributes = attributes;
        this.after = after;
    }

    toDOM(): HTMLElement {
        const headerEl = createSpan({ cls: this.after ? "data-link-icon-after" : "data-link-icon" });
        const cssProperties: Record<string, string> = {};

        for (const [key, value] of Object.entries(this.attributes)) {
            if (value === null || value === undefined) continue;
            headerEl.setAttribute(key, value);
            
            const parsedValue = processValue(key, value);
            const variableKey = `--${key}`;
            
            if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) {
                cssProperties[variableKey] = `url(${value})`;
            } else {
                cssProperties[variableKey] = parsedValue;
            }
        }
        
        headerEl.setCssProps(cssProperties);
        return headerEl;
    }

    override ignoreEvent(): boolean { return true; }
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * 🚀 MODERN FLAT ARCHITECTURE: No more functions inside functions!
 * This class stands independently on the top level for clean testing and stability.
 */
class LivePreviewPlugin {
	decorations: DecorationSet;
	private app: App;
	private plugin: ResuperchargedLinks;

	constructor(view: EditorView, app: App, plugin: ResuperchargedLinks) {
			this.app = app;
			this.plugin = plugin;
			this.decorations = this.buildDecorations(view);
	}

	/**
	 * Called by CodeMirror whenever the editor document viewport updates
	 */
	update(update: ViewUpdate): void {
			if (update.docChanged) {
					this.decorations = this.decorations.map(update.changes);

					update.changes.iterChanges((fromA, toA, fromB, toB) => {
							const minFrom = update.view.lineBlockAt(fromB).from;
							const maxTo = update.view.lineBlockAt(toB).to;
							
							this.decorations = this.decorations.update({
									filter: (from, to) => to < minFrom || from > maxTo
							});

							this.decorations = RangeSet.join([
									this.decorations,
									this.buildDecorations(update.view, minFrom, maxTo)
							]);
					});
			} else if (update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view);
			}
	}

	destroy(): void {}
	/**
	 * SYNTAX SCANNER: Iterates viewport tokens to safely mount attribute markers
	 */
	buildDecorations(view: EditorView, updateFrom = -1, updateTo = -1): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		if (!this.plugin.settings.enableEditor) return builder.finish();

		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView || !mdView.file) return builder.finish();

		const activeFileBasename = mdView.file.basename; 

		let lastAttributes: Record<string, string> = {};
		let iconDecoAfter: Decoration | null = null;
		let iconDecoAfterWhere: number | null = null;
		let mdAliasFrom: number | null = null;
		let mdAliasTo: number | null = null;

		for (const { from, to } of view.visibleRanges) {
			if (updateFrom !== -1 && (to < updateFrom || from > updateTo)) continue;

			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node) => {
					if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;
					
					// @ts-ignore - Lezer type alignment bypass
					const tokenProps = node.type.prop(tokenClassNodeProp);
					if (!tokenProps) return;

					const props = new Set(tokenProps.split(" "));
					if (props.has('formatting-link') || props.has('formatting-link-string')) return;

					const isLink = props.has("hmd-internal-link"); 
					const isAlias = props.has("link-alias"); 
					const isPipe = props.has("link-alias-pipe"); 
					const isMDLink = props.has('link'); 
					const isMDUrl = props.has('url'); 

					if (isMDLink) {
							mdAliasFrom = node.from;
							mdAliasTo = node.to;
					}

					if (!isPipe && !isAlias && iconDecoAfter && iconDecoAfterWhere !== null) {
							builder.add(iconDecoAfterWhere, iconDecoAfterWhere, iconDecoAfter);
							iconDecoAfter = null;
							iconDecoAfterWhere = null;
					}

					if ((isLink && !isAlias && !isPipe) || isMDUrl) {
						let linkText = view.state.doc.sliceString(node.from, node.to);
						linkText = linkText.split("#")[0] || "";                                
						
						let file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(linkText, activeFileBasename);
						if (isMDUrl && !file) {
							const decoded = safeDecodeURIComponent(linkText);
							if (decoded) {
								const af = this.app.vault.getAbstractFileByPath(decoded);
								file = af instanceof TFile ? af : null;
							} else {
								file = null;
							}
						}

						if (file) {
							const rawAttrs = fetchTargetAttributesSync(this.app, this.plugin, file, true);
							const attributes: Record<string, string> = {};
							
							for (const [key, val] of Object.entries(rawAttrs)) {
									attributes["data-link-" + key] = val;
							}

							const deco = Decoration.mark({ attributes, class: "data-link-text" });
							const iconDecoBefore = Decoration.widget({ widget: new HeaderWidget(attributes, false) });
							iconDecoAfter = Decoration.widget({ widget: new HeaderWidget(attributes, true) });

							if (isMDUrl && mdAliasFrom !== null && mdAliasTo !== null) {
									const mdDeco = Decoration.mark({ attributes, class: "data-link-text" });

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
								const deco = Decoration.mark({ attributes: lastAttributes, class: "data-link-text" });
								
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
}

/**
 * 🔑 THE BRIDGE: This slims down the export handler completely.
 * It simply passes instances down to the clean top-level LivePreviewPlugin class.
 */
export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks): ViewPlugin<LivePreviewPlugin> {
	return ViewPlugin.define(
		(view) => new LivePreviewPlugin(view, app, plugin),
		{ decorations: (v) => v.decorations }
	);
}
