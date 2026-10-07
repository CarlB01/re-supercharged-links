import { syntaxTree } from "@codemirror/language";
import { Compartment, Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../core/main";
import { resolveRuleResolution } from "../processors/rule-engine";
import { extractCleanLinkPath } from "../utils/shared-utils";
import { CSSLink } from "../types/css-link";
import { fetchTargetAttributesCached } from "../processors/attribute-fetcher";

export const themeCompartment: Compartment = new Compartment();

interface CodeMirrorNodeRef {
	name: string;
	from: number;
	to: number;
}

interface IterationState {
	builder: RangeSetBuilder<Decoration>;
	activeFileBasename: string;
	from: number;
	to: number;
	collectedDecos: { from: number; to: number; value: Decoration }[];
	processedRanges: Set<string>;
	decoratedRanges: Set<string>;
}

function isBaseInternalLinkOwner(nodeName: string): boolean {
	const nodeNameLower: string = nodeName.toLowerCase().trim();

	if (nodeNameLower === "hmd-internal-link") return true;

	if (nodeNameLower.includes("link-alias")) return false;
	if (nodeNameLower.includes("pipe")) return false;
	if (nodeNameLower.includes("has-alias")) return false;

	return false;
}

export function resolveLinkFile(app: App, linkText: string, activeFileBasename: string, isExternalType: boolean): TFile | null {
	const firstTry: TFile | null = app.metadataCache.getFirstLinkpathDest(linkText, activeFileBasename);
	if (firstTry !== null) return firstTry;
	if (!isExternalType) return null;

	let decoded = "";
	try {
		decoded = decodeURIComponent(linkText);
	} catch {
		decoded = "";
	}
	if (decoded.length === 0) return null;

	const abstractFile = app.vault.getAbstractFileByPath(decoded);
	if (abstractFile instanceof TFile) return abstractFile;
	return null;
}

export class CMViewPlugin {
	public decorations: DecorationSet;
	public app: App;
	public plugin: ResuperchargedLinks;

	constructor(view: EditorView, app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;
		this.decorations = this.buildDecorations(view);
	}

	public update(update: ViewUpdate): void {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	public destroy(): void {}

	public buildDecorations(view: EditorView, updateFrom: number = -1, updateTo: number = -1): DecorationSet {
		const builder: RangeSetBuilder<Decoration> = new RangeSetBuilder<Decoration>();
		const mdView: MarkdownView | null = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (mdView === null || mdView.file === null) return builder.finish();

		const state: IterationState = {
			builder,
			activeFileBasename: mdView.file.basename,
			from: 0,
			to: 0,
			collectedDecos: [],
			processedRanges: new Set<string>(),
			decoratedRanges: new Set<string>(),
		};

		const visibleRangesCount: number = view.visibleRanges.length;
		for (let i = 0; i < visibleRangesCount; i++) {
			const range: { from: number; to: number } | null = view.visibleRanges[i] ?? null;
			if (range === null) continue;

			const from: number = range.from;
			const to: number = range.to;

			if (updateFrom !== -1 && (to < updateFrom || from > updateTo)) continue;

			state.from = from;
			state.to = to;

			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node: CodeMirrorNodeRef): void => {
					this.processNodeToken(view, node, state, updateFrom, updateTo);
				}
			});
		}

		state.collectedDecos.sort((a, b) => {
			if (a.from !== b.from) return a.from - b.from;
			return a.to - b.to;
		});

		const collectedCount: number = state.collectedDecos.length;
		for (let i = 0; i < collectedCount; i++) {
			const item: { from: number; to: number; value: Decoration } | null = state.collectedDecos[i] ?? null;
			if (item !== null) {
				builder.add(item.from, item.to, item.value);
			}
		}

		return builder.finish();
	}

	private findImmediateNodeAt(
		view: EditorView,
		from: number,
		to: number,
		expectedNamePart: string
	): CodeMirrorNodeRef | null {
		const tree = syntaxTree(view.state);
		let hit: CodeMirrorNodeRef | null = null;

		tree.iterate({
			from,
			to,
			enter: (n: CodeMirrorNodeRef): void => {
				if (hit !== null) return;
				const name: string = n.name.toLowerCase();
				if (n.from === from && name.includes(expectedNamePart)) {
					hit = { name: n.name, from: n.from, to: n.to };
				}
			}
		});

		return hit;
	}

	private processNodeToken(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		updateFrom: number,
		updateTo: number
	): void {
		if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;

		const nodeNameLower: string = node.name.toLowerCase();
		if (nodeNameLower.includes("formatting-link")) return;

		const nodeRangeKey: string = `${node.from}-${node.to}`;
		if (state.processedRanges.has(nodeRangeKey)) return;

		const hasAliasClass: boolean =
			nodeNameLower.includes("cm-link-has-alias") || nodeNameLower.includes("link-has-alias");

		const isAliasPipeToken: boolean =
			nodeNameLower.includes("cm-link-alias-pipe") || nodeNameLower.includes("link-alias-pipe");

		const isAliasToken: boolean =
			(nodeNameLower.includes("cm-link-alias") || nodeNameLower.includes("link-alias")) &&
			!isAliasPipeToken;

		/**
		 * In collapsed/closed Live Preview mode, an internal link with an alias is represented 
		 * by a single text node containing the alias token, without the surrounding structural markers.
		 */
		const isAliasOnlyOwner: boolean = isAliasToken && !hasAliasClass;

		if (!isAliasOnlyOwner && !isOwnerNode(node.name)) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		const rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
		let linkText: string = extractCleanLinkPath(rawLinkText);

		if (isAliasOnlyOwner) {
			const lineForAlias = view.state.doc.lineAt(node.from);
			const lineText: string = lineForAlias.text;
			const relFrom: number = Math.max(0, node.from - lineForAlias.from);
			const relTo: number = Math.max(0, node.to - lineForAlias.from);

			const leftPart: string = lineText.slice(0, relFrom);
			const rightPart: string = lineText.slice(relTo);
			const openIdx: number = leftPart.lastIndexOf("[[");
			const closeRel: number = rightPart.indexOf("]]");

			if (openIdx !== -1 && closeRel !== -1) {
				const closeIdx: number = relTo + closeRel;
				const fullWikilink: string = lineText.slice(openIdx, closeIdx + 2);
				const inner: string = fullWikilink.slice(2, -2);
				const pipeIdx: number = inner.indexOf("|");
				const target: string = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
				if (target.length > 0) linkText = extractCleanLinkPath(target);
			}
		}

		if (linkText.length === 0) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, false);
		if (file === null) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		/**
		 * Core Mathematical Strategy: Always bind both structural icon markers to the DOM node.
		 * Positional presentation constraints (open vs closed visibility states) are handled
		 * deterministically via layout style layers, preventing token parsing state mismatches.
		 */
		if (isAliasOnlyOwner) {
			const aliasOnlyDeco: Decoration = this.processLinkDecoration(file, file.basename);
			this.decorateRangeOnce(state, node.from, node.to, aliasOnlyDeco);
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		const ownerDeco: Decoration = this.processLinkDecoration(file, file.basename);
		this.decorateRangeOnce(state, node.from, node.to, ownerDeco);

		if (hasAliasClass) {
			const line = view.state.doc.lineAt(node.from);
			const pipeNode = this.findImmediateNodeAt(view, node.to, line.to, "link-alias-pipe");

			if (pipeNode) {
				this.decorateRangeOnce(
					state,
					pipeNode.from,
					pipeNode.to,
					this.processLinkDecoration(file, file.basename)
				);
				state.processedRanges.add(`${pipeNode.from}-${pipeNode.to}`);

				const aliasNode = this.findImmediateNodeAt(view, pipeNode.to, line.to, "link-alias");
				if (aliasNode) {
					this.decorateRangeOnce(
						state,
						aliasNode.from,
						aliasNode.to,
						this.processLinkDecoration(file, file.basename)
					);
					state.processedRanges.add(`${aliasNode.from}-${aliasNode.to}`);
				}
			}
		}

		state.processedRanges.add(nodeRangeKey);
	}

	private decorateRangeOnce(
		state: IterationState,
		from: number,
		to: number,
		deco: Decoration
	): void {
		const key: string = `${from}-${to}`;
		if (state.decoratedRanges.has(key)) return;

		state.collectedDecos.push({ from, to, value: deco });
		state.decoratedRanges.add(key);
	}

	private getVisibleLabel(view: EditorView, from: number, to: number): string {
		const raw: string = view.state.doc.sliceString(from, to);
		const clean: string = extractCleanLinkPath(raw);
		return clean.length > 0 ? clean : raw.trim();
	}

	private findAliasSegments(
		view: EditorView,
		searchFrom: number,
		searchTo: number
	): { from: number; to: number; kind: "pipe" | "alias" }[] {
		const out: { from: number; to: number; kind: "pipe" | "alias" }[] = [];
		const tree = syntaxTree(view.state);

		tree.iterate({
			from: searchFrom,
			to: searchTo,
			enter: (candidate: CodeMirrorNodeRef): void => {
				const n: string = candidate.name.toLowerCase();
				const from: number = candidate.from;
				const to: number = candidate.to;

				const isPipe: boolean = n.includes("cm-link-alias-pipe");
				const isAlias: boolean = n.includes("cm-link-alias") && !n.includes("has-alias");

				if (isPipe) {
					out.push({ from, to, kind: "pipe" });
				} else if (isAlias) {
					out.push({ from, to, kind: "alias" });
				}
			}
		});

		out.sort((a, b) => a.from - b.from);
		return out;
	}
	private findNextAliasOrPipe(
		tree: ReturnType<typeof syntaxTree>,
		searchFrom: number,
		searchTo: number
	): { from: number; to: number } | null {
		let bestFrom: number = Number.POSITIVE_INFINITY;
		let bestTo: number = -1;

		tree.iterate({
			from: searchFrom,
			to: searchTo,
			enter: (candidate: CodeMirrorNodeRef): void => {
				const candidateName: string = candidate.name.toLowerCase();

				const isPipe: boolean = candidateName.includes("cm-link-alias-pipe");
				const isAlias: boolean = candidateName.includes("cm-link-alias") && !candidateName.includes("has-alias");
				if (!isPipe && !isAlias) return;

				const startsAfter: boolean = candidate.from >= searchFrom;
				if (!startsAfter) return;

				if (candidate.from < bestFrom) {
					bestFrom = candidate.from;
					bestTo = candidate.to;
				}
			}
		});

		if (!Number.isFinite(bestFrom) || bestTo < 0) {
			return null;
		}

		return { from: bestFrom, to: bestTo };
	}

	public processLinkDecoration(file: TFile, linkLabel: string): Decoration {
		const rawAttrs: Record<string, string> = fetchTargetAttributesCached(
			this.app,
			this.plugin,
			file,
			true,
			this.plugin.attrCycleCache
		);

		const attributes: Record<string, string> = {};
		for (const key in rawAttrs) {
			if (Object.prototype.hasOwnProperty.call(rawAttrs, key)) {
				const val: string = rawAttrs[key] ?? "";
				if (val.length > 0) attributes[`data-link-${key}`] = val;
			}
		}

		const isDark: boolean = document.body.classList.contains("theme-dark");
		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawAttrs,
			isDark,
			includeTagMatchClasses: true,
			visibleText: linkLabel
		});

		const classes: string[] = [];
		const classCount: number = resolution.classes.length;
		for (let i = 0; i < classCount; i++) {
			const c: string = resolution.classes[i] ?? "";
			if (c.length > 0) classes.push(c);
		}

		for (const [attrKey, attrValue] of Object.entries(resolution.attributes)) {
			if ((attrValue ?? "").length > 0) attributes[attrKey] = attrValue;
		}

		return Decoration.mark({
			attributes,
			class: classes.join(" ")
		});
	}
}

export function createRuntimeEditorTheme(plugin: ResuperchargedLinks): Extension {
	const themeSpec: Record<string, Record<string, string>> = {};
	const selectors: CSSLink[] = Array.isArray(plugin.settings?.selectors) ? plugin.settings.selectors : [];
	const isDark: boolean = document.body.classList.contains("theme-dark");

	const selectorsCount: number = selectors.length;
	for (let i = 0; i < selectorsCount; i++) {
		const rule: CSSLink | null = selectors[i] ?? null;
		if (rule === null) continue;

		const runtimeId: string = String(i);
		const ruleStyles: Record<string, string> = {};

		const textSelection: string = isDark ? (rule.darkColor ?? "") : (rule.lightColor ?? "");
		if (textSelection.length > 0) ruleStyles.color = textSelection;

		const bgSelection: string = isDark ? (rule.darkBgColor ?? "") : (rule.lightBgColor ?? "");
		if (bgSelection.length > 0 && bgSelection !== "transparent") ruleStyles["background-color"] = bgSelection;

		const fontWeight: string = rule.fontWeight ?? "normal";
		if (fontWeight !== "normal") ruleStyles["font-weight"] = fontWeight;

		const fontStyle: string = rule.fontStyle ?? "normal";
		if (fontStyle === "italic") ruleStyles["font-style"] = "italic";
		if (fontStyle === "underline") ruleStyles["text-decoration"] = "underline";
		if (fontStyle === "line-through") ruleStyles["text-decoration"] = "line-through";

		if (Object.keys(ruleStyles).length > 0) {
			const selector: string = `&.data-link-text.scl-rule-${runtimeId}, .scl-rule-${runtimeId} .cm-underline, .scl-rule-${runtimeId}`;
			themeSpec[selector] = ruleStyles;
		}
	}

	return EditorView.theme(themeSpec);
}

export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks): Extension {
	return ViewPlugin.fromClass(
		class extends CMViewPlugin {
			constructor(view: EditorView) {
				super(view, app, plugin);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

function isOwnerNode(nodeName: string): boolean {
	const n: string = nodeName.toLowerCase();

	if (n.includes("cm-link-alias-pipe")) return false;
	if (n.includes("cm-link-has-alias")) return true;
	if (n.includes("cm-link-alias")) return true;
	if (n.includes("hmd-internal-link")) return true;

	return false;
}

