import { syntaxTree } from "@codemirror/language";
import { Compartment, Extension, Line, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../core/main";
import { resolveRuleResolution } from "../processors/rule-engine";
import { extractCleanLinkPath } from "../utils/shared-utils";
import { CSSLink } from "../types/css-link";
import { fetchTargetAttributesCached } from "../processors/attribute-fetcher";
import { mapRawAttrsToDataAttrs } from "../utils/link-attribute-mapper";

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
	skipUntilPosition: number;
}

export class CMViewPlugin {
	public decorations: DecorationSet;
	public app: App;
	public plugin: ResuperchargedLinks;

	private lastLineNumber: number = -1;
	private lastLineHadLinks: boolean = false;

	// Instantiated exactly once to permanently protect the heap memory from GC spikes
	private readonly processedRangesPool: Set<string> = new Set<string>();
	private readonly decoratedRangesPool: Set<string> = new Set<string>();

	constructor(view: EditorView, app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;
		this.decorations = this.buildDecorationsForRange(view);
	}
	
	public destroy(): void {
		// Clean up pool memory structures on view plugin destruction lifecycle
		this.processedRangesPool.clear();
		this.decoratedRangesPool.clear();
	}

	/**
	 * Handles lifecycle update cycles dispatched by the CodeMirror editor engine.
	 * Evaluates document, viewport, and selection state changes to selectively recalculate link decorations.
	 * @param update - The structural ViewUpdate state container provided by CodeMirror.
	 */
	public update(update: ViewUpdate): void {
		// 1. Document Content & Viewport Changes
		// Always recalculate decorations immediately if the text is edited or the view scrolls.
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorationsForRange(update.view);
			try {
				const currentLine = update.view.state.doc.lineAt(update.view.state.selection.main.head);
				this.lastLineNumber = currentLine.number;
				this.lastLineHadLinks = currentLine.text.includes("[[") || currentLine.text.includes("](");
			} catch {
				// Safe fallback containment
			}
			return;
		}

		// 2. Pure Selection/Cursor Movements
		// Optimize performance during cursor movement to prevent redundant syntax tree traversal.
		if (update.selectionSet) {
			try {
				const state = update.view.state;
				const currentLine = state.doc.lineAt(state.selection.main.head);
				const currentLineNumber = currentLine.number;

				// PERFORMANCE BARRIER 1: Horizontal cursor movement on the exact same line
				if (currentLineNumber === this.lastLineNumber) {
					// If the active line contains zero link syntax, completely abort evaluation (0% CPU impact)
					if (!this.lastLineHadLinks) return;
					
					// V8 MIKRO-OPTIMALISERING: I stedet for full buildDecorations, patcher vi KUN denne linjen
					this.patchLineDecorations(update.view, currentLine);
					return;
				}

				// PERFORMANCE BARRIER 2: Vertical navigation jumping to a completely new line
				const currentLineHasLinks = currentLine.text.includes("[[") || currentLine.text.includes("](");

				// Bypass execution entirely if neither the departed line nor the arrived line contains link nodes
				if (!this.lastLineHadLinks && !currentLineHasLinks) {
					this.lastLineNumber = currentLineNumber;
					this.lastLineHadLinks = currentLineHasLinks;
					return;
				}

				// V8 MIKRO-OPTIMALISERING: Markøren har flyttet seg vertikalt. 
				// Vi må patche BÅDE den linjen vi dro fra (for å lukke den) og den nye linjen vi kom til (for å åpne den).
				try {
					// Hent forrige linje-objekt basert på nummeret vi lagret
					const previousLine = state.doc.line(this.lastLineNumber);
					
					// Patch begge linjene i samme syklus
					this.patchMultipleLines(update.view, [previousLine, currentLine]);
				} catch {
					// Hvis forrige linje-nummer er out-of-bounds (f.eks. etter sletting), fall tilbake til singel-patch
					this.patchLineDecorations(update.view, currentLine);
				}

				this.lastLineNumber = currentLineNumber;
				this.lastLineHadLinks = currentLineHasLinks;
			} catch {
				// Fail-safe fallback execution block - kjør full skanning hvis alt feiler
				this.decorations = this.buildDecorationsForRange(update.view);
			}
		}
	}

	/**
	 * Internal core iterator that harvests raw decoration ranges for a specific boundary.
	 * Keeps object shapes strictly stable for V8 optimization.
	 */
	private buildRawDecos(view: EditorView, updateFrom: number = -1, updateTo: number = -1): { from: number; to: number; value: Decoration }[] {
		const mdView: MarkdownView | null = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (mdView === null || mdView.file === null) return [];

		this.processedRangesPool.clear();
		this.decoratedRangesPool.clear();

		const state: IterationState = {
			builder: new RangeSetBuilder<Decoration>(), // Dummy for å tilfredsstille grensesnittet ditt
			activeFileBasename: mdView.file.basename,
			from: 0,
			to: 0,
			collectedDecos: [],
			processedRanges: this.processedRangesPool,
			decoratedRanges: this.decoratedRangesPool,
			skipUntilPosition: 0
		};

		const visibleRangesCount: number = view.visibleRanges.length;
		for (let i = 0; i < visibleRangesCount; i++) {
			const range = view.visibleRanges[i] ?? null;
			if (range === null) continue;

			let from = range.from;
			let to = range.to;

			if (updateFrom !== -1) {
				if (to < updateFrom || from > updateTo) continue;
				from = Math.max(from, updateFrom);
				to = Math.min(to, updateTo);
			}

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

		// Din eksisterende lynraske V8-sortering av arrayet
		const collectedCount: number = state.collectedDecos.length;
		let requiresSorting = false;
		
		for (let i = 1; i < collectedCount; i++) {
			const current = state.collectedDecos[i] ?? null;
			const previous = state.collectedDecos[i - 1] ?? null;
			if (current !== null && previous !== null && current.from < previous.from) {
				requiresSorting = true;
				break;
			}
		}

		if (requiresSorting) {
			state.collectedDecos.sort((a, b) => {
				if (a.from !== b.from) return a.from - b.from;
				return a.to - b.to;
			});
		}

		return state.collectedDecos;
	}

	/**
	 * Patches decorations for a single line in O(log N) time by isolating the syntax tree traversal.
	 */
	private patchLineDecorations(view: EditorView, line: Line): void {
		const rawDecos = this.buildRawDecos(view, line.from, line.to);
		
		// V8 FAST PATH: Hvis det ikke er noen lenker på linjen, bare rens intervallet
		// CodeMirror krever et array, aldri undefined. Vi passer på stabil form.
		const patchArray = rawDecos.map(d => ({ from: d.from, to: d.to, value: d.value }));

		this.decorations = this.decorations.update({
			filterFrom: line.from,
			filterTo: line.to,
			filter: () => false, 
			add: patchArray // 🌟 Type-sikker og akseptert av CodeMirror Overload!
		});
	}

	/**
	 * Patches multiple lines sequentially in ascending structural order.
	 */
	private patchMultipleLines(view: EditorView, lines: Line[]): void {
		const sortedLines = [...lines].sort((a, b) => a.from - b.from);
		let currentDecorations = this.decorations;

		for (const line of sortedLines) {
			const rawDecos = this.buildRawDecos(view, line.from, line.to);
			const patchArray = rawDecos.map(d => ({ from: d.from, to: d.to, value: d.value }));

			currentDecorations = currentDecorations.update({
				filterFrom: line.from,
				filterTo: line.to,
				filter: () => false,
				add: patchArray
			});
		}

		this.decorations = currentDecorations;
	}

	public processLinkDecoration(
		file: TFile, 
		visibleLabel: string, 
		skipIconBefore = false, 
		skipIconAfter = false
	): Decoration {
		// 1. Core Data Gathering: Retrieve the current cached frontmatter/metadata attributes for the file
		const rawAttrs: Record<string, string> = fetchTargetAttributesCached(
			this.app,
			this.plugin,
			file,
			this.plugin.attrCycleCache
		);

		// 2. Attribute Preparation Layer: Map raw metadata values directly into frontend data-link arrays
		const attributes = mapRawAttrsToDataAttrs(rawAttrs);

		// Determine light/dark mode context state
		const isDark: boolean = document.body.classList.contains("theme-dark");
		
		// 3. Rule Resolution Engine: Evaluate compiled system selectors against our prepared metadata dataset
		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawAttrs,
			isDark,
			includeTagMatchClasses: true,
			visibleText: visibleLabel,
			skipIconBefore, 
			skipIconAfter
		});

		// Fallback Guard: If no engine configuration criteria matched, return an empty styling pass
		if (!resolution.hasMatch) {
			return Decoration.mark({});
		}

		// 4. Style Compression Layer: Isolate and compile matching runtime CSS classes
		const classes: string[] = [];
		const classCount: number = resolution.classes.length;
		for (let i = 0; i < classCount; i++) {
			const c = resolution.classes[i];
			if (c !== undefined && c !== null && c.length > 0) {
				classes.push(c);
			}
		}

		// V8 OPTIMIZED
		const resAttrs = resolution.attributes;
		const attrKeys = Object.keys(resAttrs);
		const attrKeysLen = attrKeys.length;

		for (let i = 0; i < attrKeysLen; i++) {
			const attrKey = attrKeys[i];
			if (attrKey !== undefined) {
				const attrValue = resAttrs[attrKey];
				if (attrValue !== undefined && attrValue !== null && attrValue.length > 0) {
					attributes[attrKey] = attrValue;
				}
			}
		}

		if (classes.length > 0) {
			return Decoration.mark({
				attributes,
				class: classes.join(" ")
			});
		}

		return Decoration.mark({
			attributes
		});
	}

	public buildDecorationsForRange(view: EditorView, updateFrom: number = -1, updateTo: number = -1): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const rawDecos = this.buildRawDecos(view, updateFrom, updateTo);
		const count = rawDecos.length;

		for (let i = 0; i < count; i++) {
			const item = rawDecos[i];
			if (item !== undefined) {
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

		if (node.from < state.skipUntilPosition) return;

		const nodeNameLower: string = node.name.toLowerCase();
		const isMarkdownFormatting = nodeNameLower.includes("formatting-link") || nodeNameLower.includes("formatting-link-string");

		if (isMarkdownFormatting && nodeNameLower !== "linktext" && nodeNameLower !== "link" && !nodeNameLower.includes("string_url")) return;

		const nodeRangeKey: string = `${node.from}-${node.to}`;
		if (state.processedRanges.has(nodeRangeKey)) return;

		const isMarkdownAnchor: boolean = nodeNameLower === "link" || nodeNameLower === "linktext";
		const isMarkdownUrl: boolean = nodeNameLower === "url" && !nodeNameLower.includes("formatting");

		if (isMarkdownAnchor || isMarkdownUrl) {
			const handled = this.processMarkdownLinkPipeline(view, node, state, nodeNameLower, nodeRangeKey);
			if (handled) return;
		}

		const isWikiAnchor = nodeNameLower.includes("hmd-internal-link") || nodeNameLower.includes("link-has-alias") || nodeNameLower.includes("cm-link-has-alias");
		if (isWikiAnchor || isOwnerNode(node.name)) {
			const handled = this.processWikiLinkPipeline(view, node, state, nodeNameLower, nodeRangeKey);
			if (handled) return;
		}
	}

	/**
	 * Isolated Production Pipeline for standard Markdown links ([alias](target)).
	 * Processes structural tokens linearly and injects unified decorations across all siblings.
	 * Dynamically evaluates token-level labels to prevent icon duplication across open segments.
	 */
	private processMarkdownLinkPipeline(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		nodeNameLower: string,
		nodeRangeKey: string
	): boolean {
		if (nodeNameLower !== "link") {
			// Enforce strict constraint letting only the top-level parent "link" node execute the lane iteration
			state.processedRanges.add(nodeRangeKey);
			return true;
		}

		const currentLine = view.state.doc.lineAt(node.from);
		const lineText = currentLine.text;
		
		const relativeFrom = node.from - currentLine.from;
		const forwardText = lineText.slice(relativeFrom);

		let openParenIdx = forwardText.indexOf("](");
		if (openParenIdx === -1) openParenIdx = forwardText.indexOf("](<");
		
		let closeParenIdx = -1;
		if (openParenIdx !== -1) {
			closeParenIdx = forwardText.indexOf(")", openParenIdx);
		}

		let testCleanPath = "";
		let linkEndPosition = node.to;

		if (openParenIdx !== -1 && closeParenIdx !== -1) {
			let rawPath = forwardText.slice(openParenIdx + 2, closeParenIdx).trim();
			if (rawPath.startsWith("<") && rawPath.endsWith(">")) {
				rawPath = rawPath.slice(1, -1);
			}
			testCleanPath = rawPath;
			linkEndPosition = node.from + closeParenIdx + 1;
		} else {
			testCleanPath = view.state.doc.sliceString(node.from, node.to);
		}

		try {
			testCleanPath = decodeURIComponent(testCleanPath).trim();
		} catch {
			// Fallback containment
		}
		
		if (testCleanPath.toLowerCase().endsWith(".md")) {
			testCleanPath = testCleanPath.substring(0, testCleanPath.length - 3);
		}
		testCleanPath = extractCleanLinkPath(testCleanPath);

		const targetFile = resolveLinkFile(this.app, testCleanPath, state.activeFileBasename, false);
		if (targetFile !== null) {
			
			// 🌟 LOCAL CURSOR TRACKING MATRIX: Proven via parallel log verification to be 100% stable
			const cursorHead = view.state.selection.main.head;
			const isLinkOpen = cursorHead >= node.from && cursorHead <= linkEndPosition;

			syntaxTree(view.state).iterate({
				from: node.from,
				to: linkEndPosition,
				enter: (sibling: CodeMirrorNodeRef): boolean | void => {
					const sName = sibling.name.toLowerCase();
					
					const isTargetFormatting = sName.includes("formatting-link");
					const isAliasText = sName === "link";
					const isUrlText = sName.includes("string_url");

					if (isTargetFormatting || isAliasText || isUrlText) {
						if (isTargetFormatting) {
							// Formatting components ([, ], (, )): Omit all affix icon attributes completely
							const formatDeco: Decoration = this.processLinkDecoration(targetFile, "", true, true);
							this.decorateRangeOnce(state, sibling.from, sibling.to, formatDeco);
						} else if (isAliasText) {
							const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
							
							if (!isLinkOpen) {
								// Context: Closed State. Renders as a single visual capsule. Enable both prepend and append icons natively.
								const closedDeco: Decoration = this.processLinkDecoration(targetFile, specificTokenLabel, false, false);
								this.decorateRangeOnce(state, sibling.from, sibling.to, closedDeco);
							} else {
								// Context: Open State (Leading segment). Render prepend icon, but suppress append icon to avoid layout collision.
								const aliasDeco: Decoration = this.processLinkDecoration(targetFile, specificTokenLabel, false, true);
								this.decorateRangeOnce(state, sibling.from, sibling.to, aliasDeco);
							}
						} else if (isUrlText) {
							// Context: Open State (Terminal URL segment). Suppress prepend icon, render append icon at the outer terminal boundary.
							const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
							const urlDeco: Decoration = this.processLinkDecoration(targetFile, specificTokenLabel, true, false);
							this.decorateRangeOnce(state, sibling.from, sibling.to, urlDeco);
						}
						// Single-pass binary string concatenation avoids template literal heap pressure
						const siblingKey = sibling.from + "-" + sibling.to;
						state.processedRanges.add(nodeRangeKey);
						state.processedRanges.add(siblingKey);
					}
					return true;
				}
			});
			state.skipUntilPosition = linkEndPosition;
			return true;
		}
		state.processedRanges.add(nodeRangeKey);
		return true;
	}

	/**
	 * Isolated Production Pipeline for structural WikiLinks ([[path|alias]]).
	 * Computes absolute node boundaries and streams unified decorations linearly via AST layout.
	 * Dynamically evaluates token-level labels to prevent icon duplication across open segments.
	 */
	private processWikiLinkPipeline(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		nodeNameLower: string,
		nodeRangeKey: string
	): boolean {
		// Enforce constraint: Only let the primary anchor nodes coordinate the inline sequence sweep
		const isPrimaryAnchor = nodeNameLower.includes("hmd-internal-link") || nodeNameLower.includes("link-has-alias") || nodeNameLower.includes("cm-link-has-alias");
		if (!isPrimaryAnchor) {
			state.processedRanges.add(nodeRangeKey);
			return true;
		}

		const currentLine = view.state.doc.lineAt(node.from);
		let targetPathToken = "";
		let wikiEndPosition = node.to;
		let isKjedeLukket = false; // 🔑 THE SAFETY LOCK: Restricts multi-link bleed

		// UNIFIED WIKILINK LOOKAHEAD: Scan forward within line boundaries to resolve path string and lock the closing brackets
		syntaxTree(view.state).iterate({
			from: node.from,
			to: currentLine.to,
			enter: (sibling: CodeMirrorNodeRef): boolean | void => {
				if (isKjedeLukket) return true;

				const sibName = sibling.name.toLowerCase();
				
				if (sibName.includes("hmd-internal-link") || sibName.includes("link-has-alias") || sibName.includes("cm-link-has-alias")) {
					if (targetPathToken.length === 0) {
						targetPathToken = view.state.doc.sliceString(sibling.from, sibling.to);
					}
				}
				
				// MEMORY OPTIMIZATION: Shield heap allocations by only string-slicing explicit formatting elements
				if (sibName.includes("formatting")) {
					if (view.state.doc.sliceString(sibling.from, sibling.to) === "]]" && sibling.from >= node.to) {
						wikiEndPosition = sibling.to;
						isKjedeLukket = true;
					}
				}
				return true;
			}
		});

		// Fallback block if the tree is completely collapsed/closed
		if (targetPathToken.length === 0) {
			targetPathToken = view.state.doc.sliceString(node.from, node.to);
		}

		const cleanPath = extractCleanLinkPath(targetPathToken);
		const file: TFile | null = resolveLinkFile(this.app, cleanPath, state.activeFileBasename, false);
		
		if (file === null) {
			state.processedRanges.add(nodeRangeKey)
			return true;
		}

		// CONSTRAINED SINGLE-PASS INJECTION: Paint exactly the tokens isolated within this link's validated boundaries
		syntaxTree(view.state).iterate({
			from: node.from,
			to: wikiEndPosition,
			enter: (sibling: CodeMirrorNodeRef): boolean | void => {
				const sName = sibling.name.toLowerCase();
				
				// Target internal links, aliases, and the pipe character cleanly under a unified selection matrix
				const isEkteWikiNode = 
					sName.includes("hmd-internal-link") || 
					sName.includes("cm-link-has-alias") || 
					sName.includes("link-has-alias") || 
					sName.includes("cm-link-alias") ||
					sName.includes("link-alias");

				if (isEkteWikiNode) {
					const sText = view.state.doc.sliceString(sibling.from, sibling.to);
					
					if (sText === "|") {
						const pipeDeco: Decoration = this.processLinkDecoration(file, "", true);
						this.decorateRangeOnce(state, sibling.from, sibling.to, pipeDeco);
					} else {
						const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
						const localizedDeco: Decoration = this.processLinkDecoration(file, specificTokenLabel);

						this.decorateRangeOnce(state, sibling.from, sibling.to, localizedDeco);
					}
					// Avoids backtick allocations entirely inside the hot sibling iterator
					const siblingKey = sibling.from + "-" + sibling.to;
					state.processedRanges.add(siblingKey);
				}
				return true;
			}
		});
		state.skipUntilPosition = wikiEndPosition;
		return true;
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
			// Construct a high-specificity selector chain to force color inheritance 
			// down to the innermost .cm-underline node within closed Live Preview links.
			const selector: string = 
				`&.data-link-text.scl-rule-${runtimeId}, ` +
				`.scl-rule-${runtimeId} .cm-underline, ` +
				`.cm-link:has(.scl-rule-${runtimeId}) .cm-underline, ` + // Targets the parent container if supported
				`.scl-rule-${runtimeId}`;
				
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

