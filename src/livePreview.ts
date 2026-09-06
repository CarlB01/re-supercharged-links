import { App, MarkdownView, TFile } from "obsidian";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { ViewPlugin, EditorView, ViewUpdate, DecorationSet, WidgetType, Decoration } from "@codemirror/view";
import { fetchTargetAttributesSync, processValue } from "./linkAttributes";
import ResuperchargedLinks from "./main";

// ---------- Debug ----------
const DEBUG_ICON_DEDUPE = false;

function logIconDedupe(payload: {
	stage: string;
	filePath?: string;
	nodeFrom?: number;
	nodeTo?: number;
	isLink?: boolean;
	isAlias?: boolean;
	isPipe?: boolean;
	isMDLink?: boolean;
	isMDUrl?: boolean;
	nodeText?: string;
	aliasText?: string;
	linkLabel?: string;
	prependIcon?: string;
	appendIcon?: string;
	allowPrepend?: boolean;
	allowAppend?: boolean;
	widgetIcon?: string | null;
	widgetIconAfter?: string | null;
}) {
	if (!DEBUG_ICON_DEDUPE) return;
	console.log("[SCL dedupe]", payload);
}

// ---------- Helpers ----------
function safeDecodeURIComponent(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function norm(s: string): string {
	return (s || "")
		.normalize("NFC")
		.replace(/\uFE0F/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function startsWithToken(text: string, token: string): boolean {
	const t = norm(text);
	const k = norm(token);
	return !!t && !!k && t.startsWith(k);
}

function endsWithToken(text: string, token: string): boolean {
	const t = norm(text);
	const k = norm(token);
	return !!t && !!k && t.endsWith(k);
}

function toDataLinkAttributes(raw: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, val] of Object.entries(raw)) {
		out[`data-link-${key}`] = val;
	}
	return out;
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

					const rawAttrs = fetchTargetAttributesSync(this.app, this.plugin, file, true);
					const attributes = toDataLinkAttributes(rawAttrs);

					// alias-safe visible label for dedupe
					let linkLabel = view.state.doc.sliceString(node.from, node.to);
					if ((isMDUrl || isMDLink) && mdAliasFrom !== null && mdAliasTo !== null) {
						linkLabel = view.state.doc.sliceString(mdAliasFrom, mdAliasTo).replace(/^\[|\]$/g, "").trim();
					}

					const deco = Decoration.mark({ attributes, class: "data-link-text" });

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

				// Alias token for wikilinks
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

export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks): ViewPlugin<LivePreviewPlugin> {
	return ViewPlugin.define((view) => new LivePreviewPlugin(view, app, plugin), {
		decorations: (v) => v.decorations
	});
}