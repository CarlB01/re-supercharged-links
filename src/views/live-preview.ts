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
	 * Evaluates document, viewport, and selection state changes to selectively recalculate link decorations.
	 * 
	 * @param update - The structural ViewUpdate state container provided by CodeMirror.
	 */
	public update(update: ViewUpdate): void {
		// docChanged: Triggers during edits.
		// viewportChanged: Triggers during scrolling.
		// selectionSet: Triggers instantly during cursor movements (Essential for tracking open/closed active Markdown states).
		if (update.docChanged || update.viewportChanged || update.selectionSet) {
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
	 * Evaluates node characteristics and coordinates active production pipelines.
	 * Includes parallel context-aware real-time diagnostic simulation matrices.
	 */
	private processNodeToken(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		updateFrom: number,
		updateTo: number
	): void {
		if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;

		const nodeNameLower: string = node.name.toLowerCase();
		
		// Guard Clause: Allow formatting boundaries while letting anchors pass through safely
		if (nodeNameLower.includes("formatting-link") && 
			nodeNameLower !== "linktext" && 
			nodeNameLower !== "link") return;

		const nodeRangeKey: string = `${node.from}-${node.to}`;
		if (state.processedRanges.has(nodeRangeKey)) return;

		// Identify structural WikiLink tokens based on CodeMirror/Obsidian Lezer topology
		const hasAliasClass: boolean =
			nodeNameLower.includes("cm-link-has-alias") || nodeNameLower.includes("link-has-alias");
		const isAliasPipeToken: boolean =
			nodeNameLower.includes("cm-link-alias-pipe") || nodeNameLower.includes("link-alias-pipe");
		const isAliasToken: boolean =
			(nodeNameLower.includes("cm-link-alias") || nodeNameLower.includes("link-alias")) &&
			!isAliasPipeToken;

		const isAliasOnlyOwner: boolean = isAliasToken && !hasAliasClass;

		// Identify structural Markdown link components under active editor viewports
		const isMarkdownAnchor: boolean = nodeNameLower === "link" || nodeNameLower === "linktext";
		const isMarkdownUrl: boolean = nodeNameLower === "url" && !nodeNameLower.includes("formatting");

		// Structural Filter: Route verified link tokens straight into matching pipelines
		if (!isAliasOnlyOwner && !isMarkdownAnchor && !isMarkdownUrl && !isOwnerNode(node.name) && !isAliasPipeToken) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		let linkText = "";

		// Path Resolution: Extract logical catalog pathways across active token blocks
		if (isMarkdownAnchor || isMarkdownUrl) {
			linkText = this.resolveMarkdownLinkTarget(view, node);
		} else {
			linkText = this.resolveWikiLinkTarget(view, node, isAliasOnlyOwner);
		}

		// =========================================================================
		// 🔬 LIVE DIAGNOSTIC SIMULATION LAYER FOR MARKDOWN LINKS (POSTERITY MATRICES)
		// =========================================================================
		if (nodeNameLower === "link") {
			const currentLine = view.state.doc.lineAt(node.from);
			const lineText = currentLine.text;
			const rawTextContent = view.state.doc.sliceString(node.from, node.to);
			
			// Detect parameter bracket indexes to secure boundaries relative to node positioning
			const relativeFrom = node.from - currentLine.from;
			const forwardText = lineText.slice(relativeFrom);
			
			let openParenIdx = forwardText.indexOf("](");
			if (openParenIdx === -1) openParenIdx = forwardText.indexOf("](<");
			
			let closeParenIdx = -1;
			if (openParenIdx !== -1) {
				closeParenIdx = forwardText.indexOf(")", openParenIdx);
			}

			// Telemetry Parser: Determine if the cursor currently rests inside the active text or parameter region
			const primarySelection = view.state.selection.main;
			const cursorRelPos = primarySelection.head - node.from;
			
			let isVisuallyOpen = primarySelection.head >= node.from && primarySelection.head <= node.to;
			if (!isVisuallyOpen && openParenIdx !== -1 && closeParenIdx !== -1) {
				if (cursorRelPos >= openParenIdx && cursorRelPos <= closeParenIdx + 1) {
					isVisuallyOpen = true;
				}
			}

			// Uniform path extraction mirroring our successful in-memory diagnostic core
			let testCleanPath = rawTextContent;
			if (openParenIdx !== -1 && closeParenIdx !== -1) {
				let rawPath = forwardText.slice(openParenIdx + 2, closeParenIdx).trim();
				if (rawPath.startsWith("<") && rawPath.endsWith(">")) {
					rawPath = rawPath.slice(1, -1);
				}
				testCleanPath = rawPath;
			}

			try {
				testCleanPath = decodeURIComponent(testCleanPath).trim();
			} catch {
				// Safe fallback
			}
			
			if (testCleanPath.toLowerCase().endsWith(".md")) {
				testCleanPath = testCleanPath.substring(0, testCleanPath.length - 3);
			}
			testCleanPath = extractCleanLinkPath(testCleanPath);

			const testFileLookup = resolveLinkFile(this.app, testCleanPath, state.activeFileBasename, false);
			const lookupReport = testFileLookup !== null ? "MATCH_FUNNET ✅" : "IKKE_FUNNET ❌";

			// Stream telemetry straight to the active debugging console layer
			console.log(
				`%c[MD-TILSTANDS-TEST] Node: "${node.name}" | Tilstand: ${isVisuallyOpen ? "ÅPEN 📂" : "LUKKET 📁"} | Tekst i DOM: "${rawTextContent}" | Mål-sti: "${testCleanPath}" [${lookupReport}]`,
				isVisuallyOpen
					? "color: #ffaa00; font-weight: bold; background: #221100; padding: 2px;"
					: "color: #00ffaa; font-weight: bold; background: #002211; padding: 2px;"
			);
		}

		// =========================================================================
		// 🛠️ UNIFIED MARKDOWN LINK PRODUCTION PIPELINE (BOMBARDE-STRATEGI)
		// =========================================================================
		if (isMarkdownAnchor || isMarkdownUrl) {
			const currentLine = view.state.doc.lineAt(node.from);
			const lineText = currentLine.text;
			
			let testCleanPath = "";
			const openParenIdx = lineText.indexOf("](");
			const openParenAngleIdx = lineText.indexOf("](<");
			const activeParenIdx = openParenAngleIdx !== -1 ? openParenAngleIdx : openParenIdx;

			if (activeParenIdx !== -1) {
				const closeParenIdx = lineText.indexOf(")", activeParenIdx);
				if (closeParenIdx !== -1) {
					const startOffset = openParenAngleIdx !== -1 ? 3 : 2;
					let rawPath = lineText.slice(activeParenIdx + startOffset, closeParenIdx).trim();
					if (rawPath.endsWith(">")) {
						rawPath = rawPath.slice(0, -1);
					}
					testCleanPath = rawPath;
				}
			} else {
				testCleanPath = view.state.doc.sliceString(node.from, node.to);
			}

			try {
				testCleanPath = decodeURIComponent(testCleanPath).trim();
			} catch {
				// Fallback
			}
			
			if (testCleanPath.toLowerCase().endsWith(".md")) {
				testCleanPath = testCleanPath.substring(0, testCleanPath.length - 3);
			}
			testCleanPath = extractCleanLinkPath(testCleanPath);

			const targetFile = resolveLinkFile(this.app, testCleanPath, state.activeFileBasename, false);
			
			if (targetFile !== null) {
				const visibleLabel: string = this.getVisibleLabel(view, node.from, node.to);
				const markdownDeco: Decoration = this.processLinkDecoration(targetFile, visibleLabel);
				
				this.decorateRangeOnce(state, node.from, node.to, markdownDeco);
				state.processedRanges.add(nodeRangeKey);
				return;
			}
		}

		// =========================================================================
		// 🛠️ STANDARD WIKILINK PRODUCTION PIPELINE (UNTOUCHED)
		// =========================================================================
		const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, false);
		if (file === null) {
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		const visibleLabel: string = this.getVisibleLabel(view, node.from, node.to);

		if (isAliasOnlyOwner) {
			const aliasOnlyDeco: Decoration = this.processLinkDecoration(file, visibleLabel);
			this.decorateRangeOnce(state, node.from, node.to, aliasOnlyDeco);
			state.processedRanges.add(nodeRangeKey);
			return;
		}

		const ownerDeco: Decoration = this.processLinkDecoration(file, visibleLabel);
		this.decorateRangeOnce(state, node.from, node.to, ownerDeco);

		if (hasAliasClass) {
			this.processExpandedWikiLinkSegments(view, node, state, file);
		}

		state.processedRanges.add(nodeRangeKey);
	}

		/**
	 * Helper Method: Resolves the semantic target file path string from standard Markdown links ([alias](target)).
	 * Scans the pre-parsed syntax tree forward within the current line boundaries to securely locate the companion URL token.
	 */
	private resolveMarkdownLinkTarget(view: EditorView, node: CodeMirrorNodeRef): string {
		const line = view.state.doc.lineAt(node.from);
		let resolvedPath = "";

		syntaxTree(view.state).iterate({
			from: node.from,
			to: line.to,
			enter: (sibling: CodeMirrorNodeRef): boolean | void => {
				const siblingNameLower = sibling.name.toLowerCase();
				
				if (siblingNameLower === "url" && !siblingNameLower.includes("formatting")) {
					let rawUrl: string = view.state.doc.sliceString(sibling.from, sibling.to).trim();
					
					try {
						rawUrl = decodeURIComponent(rawUrl);
					} catch {
						// Safe fallback preservation on URI decoding errors
					}

					if (rawUrl.startsWith("<") && rawUrl.endsWith(">")) {
						rawUrl = rawUrl.substring(1, rawUrl.length - 1);
					}

					if (rawUrl.toLowerCase().endsWith(".md")) {
						rawUrl = rawUrl.substring(0, rawUrl.length - 3);
					}

					resolvedPath = extractCleanLinkPath(rawUrl);
					return false; // Break syntax tree iteration immediately on successful match
				}
			}
		});

		return resolvedPath;
	}

	/**
	 * Helper Method: Resolves the semantic target file path string from a WikiLink node token.
	 */
	private resolveWikiLinkTarget(view: EditorView, node: CodeMirrorNodeRef, isAliasOnlyOwner: boolean): string {
		const rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
		const defaultPath: string = extractCleanLinkPath(rawLinkText);

		if (!isAliasOnlyOwner) {
			return defaultPath;
		}

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

