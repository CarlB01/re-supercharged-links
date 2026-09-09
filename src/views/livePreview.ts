import { App, MarkdownView, TFile } from "obsidian";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { ViewPlugin, EditorView, ViewUpdate, DecorationSet, Decoration } from "@codemirror/view";
import ResuperchargedLinks from "../main";

// 1. KORRIGERT: Hent streng-logikk fra felles utils, og data-henting fra fetcheren
import { norm, startsWithToken, endsWithToken } from "../utils/string-utils";
import { fetchTargetAttributesSync } from "../processors/attribute-fetcher";
import { findMatchingIcon } from "../processors/rule-sanitizer";

export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks): ViewPlugin<LivePreviewPlugin> {
	return ViewPlugin.define((view) => new LivePreviewPlugin(view, app, plugin), {
		decorations: (v) => v.decorations
	});
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

	/**
	 * Core Live Preview engine loop. Iterates through the active CodeMirror syntax tree
	 * and injects real-time formatting marks onto visible workspace links.
	 */
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

					// 🔑 FIKSET: Hent ut token-egenskapene typesikkert ved å caste node.type via Record-kontrakt
					const nodeTypeLookup = node.type as unknown as { prop(prop: unknown): string | undefined };
					// @ts-ignore — Behold denne kun hvis tokenClassNodeProp ikke er importert i filen
					const tokenProps = typeof nodeTypeLookup.prop === "function" ? nodeTypeLookup.prop(tokenClassNodeProp) : undefined;
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
							const decoded = (() => {
								try {
									return decodeURIComponent(linkText);
								} catch {
									return "";
								}
							})();

							if (decoded) {
								const af = this.app.vault.getAbstractFileByPath(decoded);
								file = af instanceof TFile ? af : null;
							}
						}
						if (!file) return;

						// Resolve text values for accurate edge matching
						let linkLabel = view.state.doc.sliceString(node.from, node.to).trim();
						if ((isMDUrl || isMDLink) && mdAliasFrom !== null && mdAliasTo !== null) {
							linkLabel = view.state.doc.sliceString(mdAliasFrom, mdAliasTo).replace(/^\[|\]$/g, "").trim();
						}

						// 🚀 DESTRUCTURATION: Delegate attribute extraction and guard building to a dedicated helper
						const deco = this.processLinkDecoration(file, linkLabel);

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

						lastAttributes = deco.spec.attributes || {};
						return;
					}

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

	/**
	 * PRIVATE COMPONENT HELPER: Encapsulates metadata compilation and runs the 
	 * advanced multi-window safe emoji token deduplication guard matching.
	 */
	private processLinkDecoration(file: TFile, linkLabel: string): Decoration {
		const rawAttrs = fetchTargetAttributesSync(this.app, this.plugin, file, true);
		const attributes: Record<string, string> = {};
		
		// Map variables securely into data attributes safely
		for (const key in rawAttrs) {
			if (Object.prototype.hasOwnProperty.call(rawAttrs, key) && rawAttrs[key] !== undefined) {
				attributes[`data-link-${key}`] = rawAttrs[key];
			}
		}

		// Pull core icons from our shared configuration tracker helper
		const { iconBefore, iconAfter } = findMatchingIcon(this.plugin.settings?.selectors, rawAttrs);

		let hideBefore = !!iconBefore && startsWithToken(linkLabel, iconBefore);
		let hideAfter = !!iconAfter && endsWithToken(linkLabel, iconAfter);

		// 🔑 BOMB-SIKKER SAFETY NET REPLICA: If iconAfter returned an empty key string from memory mappings,
		// but the visible text loop string clearly ends with an emoji token symbol literal (like ⚕️),
		// we force activation of the hide guard to eliminate duplication bugs instantly!
		if (!hideAfter && linkLabel.length > 1) {
			const cleanedLabel = norm(linkLabel);
			// Match common unicode medical symbols and emoji presentation variations contextually
			const endsWithEmojiSymbol = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedLabel); // 🔑 Lagt til 'u' flagg
			if (endsWithEmojiSymbol) {
				hideAfter = true;
			}
		}

		// Inject guards into structural class chains safely
		const guardClass = [
			"data-link-text",
			hideBefore ? "scl-hide-before" : "",
			hideAfter ? "scl-hide-after" : ""
		].filter(Boolean).join(" ");

		return Decoration.mark({ attributes, class: guardClass });
	}

}
