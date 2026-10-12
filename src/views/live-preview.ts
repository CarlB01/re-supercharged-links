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

export class CMViewPlugin {
	public decorations: DecorationSet;
	public app: App;
	public plugin: ResuperchargedLinks;

	constructor(view: EditorView, app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;
		this.decorations = this.buildDecorations(view);
	}
	
	public destroy(): void {}

	/**
	 * Handles lifecycle update cycles dispatched by the CodeMirror editor engine.
	 * Evaluates document and viewport state changes to selectively recalculate link decorations.
	 * 
	 * @param update - The structural ViewUpdate state container provided by CodeMirror.
	 */
	public update(update: ViewUpdate): void {
		// Optimize execution by filtering out lightweight updates (e.g., pure cursor movements).
		// docChanged: Triggers when the user edits text, ensuring real-time rule evaluation.
		// viewportChanged: Triggers during scrolling or resizing, ensuring newly revealed links are decorated.
		if (update.docChanged || update.viewportChanged) {
			// Recalculate and update the decoration range set for the currently visible viewport segments
			this.decorations = this.buildDecorations(update.view);
		}
	}

	/**
	 * Orchestrates the decoration assembly chain for a specific link node.
	 * Separates raw metadata retrieval from rule engine resolution before compiling the final mark.
	 * 
	 * @param file - The target Obsidian TFile mapped to this link destination.
	 * @param visibleLabel - The actual raw or cleaned text string rendering inside the editor.
	 * @returns A computed CodeMirror Mark Decoration containing styling hooks and attributes.
	 */
	public processLinkDecoration(file: TFile, visibleLabel: string): Decoration {
		// 1. Core Data Gathering: Retrieve the current cached frontmatter/metadata attributes for the file
		const rawAttrs: Record<string, string> = fetchTargetAttributesCached(
			this.app,
			this.plugin,
			file,
			true,
			this.plugin.attrCycleCache
		);

		// 2. Attribute Preparation Layer: Map raw metadata values directly into frontend data-link arrays
		const attributes = this.buildLinkAttributes(rawAttrs);

		// Determine light/dark mode context state
		const isDark: boolean = document.body.classList.contains("theme-dark");
		
		// 3. Rule Resolution Engine: Evaluate compiled system selectors against our prepared metadata dataset
		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawAttrs,
			isDark,
			includeTagMatchClasses: true,
			visibleText: visibleLabel
		});

		// Fallback Guard: If no engine configuration criteria matched, return an empty styling pass
		if (!resolution.hasMatch) {
			return Decoration.mark({});
		}

		// 4. Style Compression Layer: Isolate and compile matching runtime CSS classes
		const classes: string[] = [];
		const classCount: number = resolution.classes.length;
		for (let i = 0; i < classCount; i++) {
			const c: string = resolution.classes[i] ?? "";
			if (c.length > 0) classes.push(c);
		}

		// 5. Rule Attribute Merging: Append resolved presentation layer attributes (like icons) to our element dataset
		for (const [attrKey, attrValue] of Object.entries(resolution.attributes)) {
			const cleanVal = attrValue ?? "";
			if (cleanVal.length > 0) {
				attributes[attrKey] = cleanVal;
			}
		}

		// Return the complete layout instruction block straight back to the CodeMirror engine
		return Decoration.mark({
			attributes,
			class: classes.join(" ")
		});
	}

	/**
	 * Synchronously constructs a reactive CodeMirror DecorationSet for the active viewport segments.
	 * Optimized to minimize heap allocations (GC pressure) and avoid redundant sorting overhead.
	 * 
	 * @param view - The active editor view context dispatched by CodeMirror.
	 * @param updateFrom - Optional structural lower boundary offset for partial layout updates.
	 * @param updateTo - Optional structural upper boundary offset for partial layout updates.
	 * @returns A highly optimized CodeMirror RangeSet containing calculated link marks.
	 */
	public buildDecorations(view: EditorView, updateFrom: number = -1, updateTo: number = -1): DecorationSet {
		const builder: RangeSetBuilder<Decoration> = new RangeSetBuilder<Decoration>();
		
		// Safely extract the active Markdown workspace context; abort early if view context is absent
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

		// Cache length property locally to optimize assembly loop boundaries
		const visibleRangesCount: number = view.visibleRanges.length;
		for (let i = 0; i < visibleRangesCount; i++) {
			const range: { from: number; to: number } | null = view.visibleRanges[i] ?? null;
			if (range === null) continue;

			const from: number = range.from;
			const to: number = range.to;

			// Bypass calculations entirely if a target update scope is supplied and falls outside this range block
			if (updateFrom !== -1 && (to < updateFrom || from > updateTo)) continue;

			state.from = from;
			state.to = to;

			// Chronologically stream tokens directly from the pre-computed active Lezer syntax tree.
			// Because Lezer parses linearly, tokens are processed natively in ascending position order.
			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node: CodeMirrorNodeRef): void => {
					this.processNodeToken(view, node, state, updateFrom, updateTo);
				}
			});
		}

		// RangeSetBuilder requires strict, monotonically increasing index entries.
		// Since syntaxTree.iterate yields items chronologically, we evaluate sequence stability first.
		const collectedCount: number = state.collectedDecos.length;
		let requiresSorting = false;
		
		for (let i = 1; i < collectedCount; i++) {
			const current: { from: number; to: number; value: Decoration } | null = state.collectedDecos[i] ?? null;
			const previous: { from: number; to: number; value: Decoration } | null = state.collectedDecos[i - 1] ?? null;
			
			if (current !== null && previous !== null && current.from < previous.from) {
				requiresSorting = true;
				break;
			}
		}

		// Perform fallback sorting routine only if an atypical nested token collision breaks linear order
		if (requiresSorting) {
			state.collectedDecos.sort((a, b) => {
				if (a.from !== b.from) return a.from - b.from;
				return a.to - b.to;
			});
		}

		// Stream the structural decoration payloads sequentially straight into the final native builder
		for (let i = 0; i < collectedCount; i++) {
			const item: { from: number; to: number; value: Decoration } | null = state.collectedDecos[i] ?? null;
			if (item !== null) {
				builder.add(item.from, item.to, item.value);
			}
		}

		return builder.finish();
	}

	/**
	 * Main orchestration handler for individual CodeMirror syntax tree tokens.
	 * Dispatches token metadata evaluation to dedicated link-type engines.
	 */
	private processNodeToken(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		updateFrom: number,
		updateTo: number
	): void {
		// Performance Guard: Abandon execution if the token resides outside updated viewport regions
		if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;

		// Syntax Guard: Ignore structural brackets to eliminate wasteful evaluation cycles
		const nodeNameLower: string = node.name.toLowerCase();
		if (nodeNameLower.includes("formatting-link")) return;

		// Deduplication Guard: Enforce strict single-pass execution per unique range key
		const nodeRangeKey: string = `${node.from}-${node.to}`;
		if (state.processedRanges.has(nodeRangeKey)) return;

		// Extract context states mapped to default Obsidian WikiLink syntax tokens
		const hasAliasClass: boolean =
			nodeNameLower.includes("cm-link-has-alias") || nodeNameLower.includes("link-has-alias");
		const isAliasPipeToken: boolean =
			nodeNameLower.includes("cm-link-alias-pipe") || nodeNameLower.includes("link-alias-pipe");
		const isAliasToken: boolean =
			(nodeNameLower.includes("cm-link-alias") || nodeNameLower.includes("link-alias")) &&
			!isAliasPipeToken;

		const isAliasOnlyOwner: boolean = isAliasToken && !hasAliasClass;

		// Structural Filter: Verify token ownership credentials before allocating processing memory
		if (!isAliasOnlyOwner && !isOwnerNode(node.name)) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		// 1. Path Resolution: Extract and clean the target destination string via decoupled resolution engine
		const linkText: string = this.resolveWikiLinkTarget(view, node, isAliasOnlyOwner);
		if (linkText.length === 0) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		// 2. Vault Catalog Mapping: Verify if the resolved path points to a valid physical abstract TFile
		const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, false);
		if (file === null) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		// CASE 1: Standardize handling for standalone closed/collapsed alias syntax nodes
		if (isAliasOnlyOwner) {
			const aliasLabel: string = this.getVisibleLabel(view, node.from, node.to); 
			const aliasOnlyDeco: Decoration = this.processLinkDecoration(file, aliasLabel);
			this.decorateRangeOnce(state, node.from, node.to, aliasOnlyDeco);
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		// CASE 2: Apply primary anchor decoration to active root token elements
		const ownerLabel: string = this.getVisibleLabel(view, node.from, node.to); 
		const ownerDeco: Decoration = this.processLinkDecoration(file, ownerLabel);
		this.decorateRangeOnce(state, node.from, node.to, ownerDeco);

		// CASE 3: Delegate forward token lookahead handling for expanded active multi-part segments
		if (hasAliasClass) {
			this.processExpandedWikiLinkSegments(view, node, state, file);
		}

		// Lock token sequence execution state down for this operational layout pass
		state.processedRanges.add(nodeRangeKey);
	}

	/**
	 * Helper Method: Resolves the semantic target file path string from a WikiLink node token.
	 * Encapsulates contextual line fallback searches cleanly away from the token loop core.
	 */
	private resolveWikiLinkTarget(view: EditorView, node: CodeMirrorNodeRef, isAliasOnlyOwner: boolean): string {
		const rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
		const defaultPath: string = extractCleanLinkPath(rawLinkText);

		if (!isAliasOnlyOwner) {
			return defaultPath;
		}

		// Perform contextual line backward-scan fallback for closed alias nodes lacking core token properties
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
			
			if (target.length > 0) {
				return extractCleanLinkPath(target);
			}
		}

		return defaultPath;
	}

	/**
	 * Helper Method: Executes linear forward lookahead sweeps to identify, validate, 
	 * and apply matched decorations to accompanying components of open/expanded WikiLinks.
	 */
	private processExpandedWikiLinkSegments(
		view: EditorView, 
		node: CodeMirrorNodeRef, 
		state: IterationState, 
		file: TFile
	): void {
		const line = view.state.doc.lineAt(node.from);
		const pipeNode: CodeMirrorNodeRef | null = this.findImmediateNodeAt(view, node.to, line.to, "link-alias-pipe");

		if (pipeNode !== null) {
			const pipeLabel: string = this.getVisibleLabel(view, pipeNode.from, pipeNode.to);
			this.decorateRangeOnce(state, pipeNode.from, pipeNode.to, this.processLinkDecoration(file, pipeLabel));
			state.processedRanges.add(`${pipeNode.from}-${pipeNode.to}`);

			const aliasNode: CodeMirrorNodeRef | null = this.findImmediateNodeAt(view, pipeNode.to, line.to, "link-alias");
			if (aliasNode !== null) {
				const aliasLabel: string = this.getVisibleLabel(view, aliasNode.from, aliasNode.to);
				this.decorateRangeOnce(state, aliasNode.from, aliasNode.to, this.processLinkDecoration(file, aliasLabel));
				state.processedRanges.add(`${aliasNode.from}-${aliasNode.to}`);
			}
		}
	}

	/**
	 * Helper Method: Transforms raw file metadata records into normalized, 
	 * standardized HTML-compliant 'data-link-*' attribute string dictionaries.
	 * 
	 * @param rawAttrs - The raw key-value string pairs extracted from frontmatter/metadata caches.
	 * @returns A record containing prepared DOM attribute keys paired with their cleaned values.
	 */
	private buildLinkAttributes(rawAttrs: Record<string, string>): Record<string, string> {
		const domAttributes: Record<string, string> = {};
		
		for (const key in rawAttrs) {
			if (Object.prototype.hasOwnProperty.call(rawAttrs, key)) {
				const val: string = rawAttrs[key] ?? "";
				if (val.length > 0) {
					domAttributes[`data-link-${key}`] = val;
				}
			}
		}
		
		return domAttributes;
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

