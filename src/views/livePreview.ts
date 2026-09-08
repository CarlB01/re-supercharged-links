import { App, MarkdownView, TFile } from "obsidian";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { ViewPlugin, EditorView, ViewUpdate, DecorationSet, Decoration } from "@codemirror/view";
import ResuperchargedLinks from "../main";

// 1. KORRIGERT: Hent streng-logikk fra felles utils, og data-henting fra fetcheren
import { norm, startsWithToken, endsWithToken, processValue, isHtmlElement } from "../utils/string-utils";
import { fetchTargetAttributesSync } from "../processors/attribute-fetcher";

export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks): ViewPlugin<LivePreviewPlugin> {
	return ViewPlugin.define((view) => new LivePreviewPlugin(view, app, plugin), {
		decorations: (v) => v.decorations
	});
}

function safeDecodeURIComponent(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

// OPTIMALISERT OG TYPESIKKER: Skipper tomme verdier og sikrer mot undefined
function injectDataLinkAttributes(raw: Record<string, string>, target: Record<string, string>): void {
	for (const key in raw) {
		if (Object.prototype.hasOwnProperty.call(raw, key)) {
			const value = raw[key];
			// Sikkerhetsbelte: Fortsett kun hvis verdien faktisk eksisterer og er en streng
			if (value !== undefined && value !== null) {
				target[`data-link-${key}`] = value;
			}
		}
	}
}

class LivePreviewPlugin {
	decorations: DecorationSet;
	private app: App;
	private plugin: ResuperchargedLinks;

	constructor(view: EditorView, app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;
		this.decorations = this.buildDecorations(view);
	}

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

	buildDecorations(view: EditorView, updateFrom = -1, updateTo = -1): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		if (!this.plugin.settings.enableEditor) return builder.finish();

		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView || !mdView.file) return builder.finish();

		const activeFileBasename = mdView.file.basename;

		let lastAttributes: Record<string, string> = {};
		let mdAliasFrom: number | null = null;
		let mdAliasTo: number | null = null;

		for (const { from, to } of view.visibleRanges) {
			if (updateFrom !== -1 && (to < updateFrom || from > updateTo)) continue;

			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node) => {
					if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;

					// @ts-ignore
					const tokenProps = node.type.prop(tokenClassNodeProp);
					if (!tokenProps) return;

					const props = new Set(tokenProps.split(" "));
					if (props.has("formatting-link") || props.has("formatting-link-string")) return;

					const isLink = props.has("hmd-internal-link");
					const isAlias = props.has("link-alias");
					const isPipe = props.has("link-alias-pipe");
					const isMDLink = props.has("link");
					const isMDUrl = props.has("url");

					if (isMDLink) {
						mdAliasFrom = node.from;
						mdAliasTo = node.to;
					}

					const isPrimary = (isLink && !isAlias && !isPipe) || isMDUrl || isMDLink;
					if (isPrimary) {
						let linkText = view.state.doc.sliceString(node.from, node.to);
						linkText = linkText.split("#")[0] || "";

						let file: TFile | null = this.app.metadataCache.getFirstLinkpathDest(linkText, activeFileBasename);
						if ((isMDUrl || isMDLink) && !file) {
							const decoded = safeDecodeURIComponent(linkText);
							if (decoded) {
								const af = this.app.vault.getAbstractFileByPath(decoded);
								file = af instanceof TFile ? af : null;
							}
						}
						if (!file) return;

						// 3. OPTIMALISERT: Henter attributter og transformerer dem uten unødvendig allokering
						const rawAttrs = fetchTargetAttributesSync(this.app, this.plugin, file, true);
						const attributes: Record<string, string> = {};
						injectDataLinkAttributes(rawAttrs, attributes);

						// alias-safe synlig tekst for ikonsjekk
						let linkLabel = view.state.doc.sliceString(node.from, node.to);
						if ((isMDUrl || isMDLink) && mdAliasFrom !== null && mdAliasTo !== null) {
							linkLabel = view.state.doc.sliceString(mdAliasFrom, mdAliasTo).replace(/^\[|\]$/g, "").trim();
						}

						// Guard-klasser for Live Preview (likt det vi gjorde i setLinkNewProps)
						const iconBefore = processValue("icon", rawAttrs["icon"] || "");
						const iconAfter = processValue("icon-after", rawAttrs["icon-after"] || "");
						const hideBefore = !!iconBefore && startsWithToken(linkLabel, iconBefore);
						const hideAfter = !!iconAfter && endsWithToken(linkLabel, iconAfter);
						
						const guardClass = [
							"data-link-text",
							hideBefore ? "scl-hide-before" : "",
							hideAfter ? "scl-hide-after" : ""
						].filter(Boolean).join(" ");
	
						const deco = Decoration.mark({ attributes, class: guardClass });
						
						if ((isMDUrl || isMDLink) && mdAliasFrom !== null && mdAliasTo !== null) {
							if (mdAliasFrom >= from) {
								builder.add(mdAliasFrom, mdAliasTo, deco);
							}
							mdAliasFrom = null;
							mdAliasTo = null;
						} else {
							if (node.from >= from && node.to <= to) {
								builder.add(node.from, node.to, deco);
							}
						}

						lastAttributes = attributes;
						return;
					}

					// Håndtering av Alias-tokens i wikilenker
					if (isLink && isAlias) {
						const deco = Decoration.mark({ attributes: lastAttributes, class: "data-link-text" });
						if (node.from >= from && node.to <= to) {
							builder.add(node.from, node.to, deco);
						}
					}
				}
			});
		}

		return builder.finish();
	}
}
