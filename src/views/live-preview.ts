import { syntaxTree } from "@codemirror/language";
import { Extension, Line, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../core/main";
import { extractCleanLinkPath } from "../utils/shared-utils";
import { populatePresentationPool } from "../processors/presentation.engine";

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
		
		if (!this.plugin.flyweightEngine) {
			return Decoration.mark({});
		}

		const resolution = this.plugin.flyweightEngine.getResolution(file, visibleLabel);

		if (!resolution.hasMatch) {
			return Decoration.mark({});
		}

		// 3. Populer den globale, uforanderlige minne-poolen (0 allokeringer under scroll!)
		const presentation = populatePresentationPool(resolution, skipIconBefore, skipIconAfter);

		// 4. Opprett et uforanderlig attributtkart for CodeMirror-elementet
		const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
		attributes["data-link-path"] = file.path;

		// Bevarer data-link-color kun for bakoverkompatibilitet med eldre eksterne temaer
		if (resolution.styles.color.length > 0) {
			attributes["data-link-color"] = resolution.styles.color;
		}

		// 5. 🔥 ADDITIV INLINE-VARIABEL STRØM FOR CM6:
		// Vi bygger en superlett, flat CSS-streng av stil-slotsene levert direkte fra poolen.
		// Siden CM6 kaster toppnivå-styles, plasserer vi dette trygt i attributes.style som en streng!
		let inlineStyleString = "";
		const stylesCount = presentation.stylesCount;
		
		for (let i = 0; i < stylesCount; i++) {
			const key = presentation.styleKeys[i];
			const val = presentation.styleValues[i];
			if (key && val) {
				inlineStyleString += `${key}: ${val}; `;
			}
		}

		if (inlineStyleString.length > 0) {
			attributes["style"] = inlineStyleString; // 🌟 Godtas 100% av CodeMirror 6!
		}

		// 6. Samle klassene fra poolen til en flat, ren streng levert til editoren
		const classesCount = presentation.classesCount;
		const activeClasses: string[] = [];
		
		for (let i = 0; i < classesCount; i++) {
			const cls = presentation.classes[i];
			if (cls) {
				activeClasses.push(cls);
			}
		}

		// 7. Generer og returner den uforanderlige mark-dekorasjonen
		return Decoration.mark({
			attributes,
			class: activeClasses.join(" ")
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

	private processMarkdownLinkPipeline(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		nodeNameLower: string,
		nodeRangeKey: string
	): boolean {
		if (nodeNameLower !== "link") {
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
		// 🌟 GJENINNFØRT: Sikrer at markdown-stien er barbert ren før resolveLinkFile
		testCleanPath = extractCleanLinkPath(testCleanPath); 

		const targetFile = resolveLinkFile(this.app, testCleanPath, state.activeFileBasename, false);

		if (targetFile !== null) {
			
			// 🌟 SKUDDSIKKER SYNKRONISERING AV MARKØR-MATRISEN (- 1):
			// Ved å trekke fra 1, slår vi på åpen-tilstand akkurat i det CodeMirror splitter nodene.
			// Dette utrydder de overflødige ikonene når du står helt til venstre for '[' permanent!
			const cursorHead = view.state.selection.main.head;
			const isLinkOpen = cursorHead >= (node.from - 1) && cursorHead <= linkEndPosition;

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
							// Formateringstegn ([, ], (, )): Ingen ikoner overhodet
							const formatDeco: Decoration = this.processLinkDecoration(targetFile, "", true, true);
							this.decorateRangeOnce(state, sibling.from, sibling.to, formatDeco);
						} else if (isAliasText) {
							const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
							
							if (!isLinkOpen) {
								// Lukket kapsel: Full pakke (både prepend og append natively)
								const closedDeco: Decoration = this.processLinkDecoration(targetFile, specificTokenLabel, false, false);
								this.decorateRangeOnce(state, sibling.from, sibling.to, closedDeco);
							} else {
								// Åpen modus (Alias-teksten): Vis prepend, slukk append-ikonet i midten!
								const aliasDeco: Decoration = this.processLinkDecoration(targetFile, specificTokenLabel, false, true);
								this.decorateRangeOnce(state, sibling.from, sibling.to, aliasDeco);
							}
						} else if (isUrlText) {
							const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
							// Åpen modus (URL-strengen): Slukk prepend-ikonet i midten, vis kun append på terminalgrensen!
							const urlDeco: Decoration = this.processLinkDecoration(targetFile, specificTokenLabel, true, false);
							this.decorateRangeOnce(state, sibling.from, sibling.to, urlDeco);
						}
						
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

	private processWikiLinkPipeline(
		view: EditorView,
		node: CodeMirrorNodeRef,
		state: IterationState,
		nodeNameLower: string,
		nodeRangeKey: string
	): boolean {
		const isPrimaryAnchor = nodeNameLower.includes("hmd-internal-link") || nodeNameLower.includes("link-has-alias") || nodeNameLower.includes("cm-link-has-alias");
		if (!isPrimaryAnchor) {
			state.processedRanges.add(nodeRangeKey);
			return true;
		}

		const currentLine = view.state.doc.lineAt(node.from);
		let targetPathToken = "";
		let wikiEndPosition = node.to;
		let isChainClosed = false; 
		
		// 🛠️ SKUDDSIKKER STRUKTUR-SKANNER:
		// Vi sjekker om det finnes en alias-struktur i hele lenke-intervallet uten restriksjoner.
		let hasAliasStructure = false;

		syntaxTree(view.state).iterate({
			from: node.from,
			to: currentLine.to,
			enter: (sibling: CodeMirrorNodeRef): boolean | void => {
				if (isChainClosed) return true;
				const sibName = sibling.name.toLowerCase();
				
				// Hent ut målstien/filnavnet fra det første gyldige segmentet
				if (sibName.includes("hmd-internal-link") || sibName.includes("link-has-alias") || sibName.includes("cm-link-has-alias")) {
					if (targetPathToken.length === 0) {
						targetPathToken = view.state.doc.sliceString(sibling.from, sibling.to);
					}
				}
				
				// ⚡ BREMSESJEKK: Hvis et hvilket som helst token i kjeden er en pipe eller et alias, flagger vi det umiddelbart!
				if (sibName.includes("alias") || sibName.includes("pipe")) {
					hasAliasStructure = true;
				}
				
				if (sibName.includes("formatting")) {
					if (view.state.doc.sliceString(sibling.from, sibling.to) === "]]" && sibling.from >= node.to) {
						wikiEndPosition = sibling.to;
						isChainClosed = true;
					}
				}
				return true;
			}
		});

		if (targetPathToken.length === 0) {
			targetPathToken = view.state.doc.sliceString(node.from, node.to);
		}

		const file: TFile | null = resolveLinkFile(this.app, targetPathToken, state.activeFileBasename, false);
		
		if (file === null) {
			state.processedRanges.add(nodeRangeKey)
			return true;
		}

		// Cursor-trackingen din som er verifisert 100% stabil
		const cursorHead = view.state.selection.main.head;
		const isLinkOpenUnderCursor = cursorHead >= node.from -2 && cursorHead <= wikiEndPosition;

		syntaxTree(view.state).iterate({
			from: node.from,
			to: wikiEndPosition,
			enter: (sibling: CodeMirrorNodeRef): boolean | void => {
				const sName = sibling.name.toLowerCase();
				const sText = view.state.doc.sliceString(sibling.from, sibling.to);
				
				const isPipeNode = sName.includes("alias-pipe") || sText === "|";
				const isAliasNode = sName.includes("link-alias") && !sName.includes("pipe");
				const isPathNode = (sName.includes("hmd-internal-link") || sName.includes("link-has-alias")) && !isPipeNode && !isAliasNode;

				if (isPipeNode) {
					const pipeDeco: Decoration = this.processLinkDecoration(file, "", true, true);
					this.decorateRangeOnce(state, sibling.from, sibling.to, pipeDeco);
				} 
				else if (isPathNode) {
					const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
					
					// Stien slukker append-ikonet kun hvis lenken faktisk redigeres OG har et alias
					const shouldSkipAfter = isLinkOpenUnderCursor && hasAliasStructure;
					
					const pathDeco: Decoration = this.processLinkDecoration(file, specificTokenLabel, false, shouldSkipAfter);
					this.decorateRangeOnce(state, sibling.from, sibling.to, pathDeco);
				} 
				else if (isAliasNode) {
					const specificTokenLabel: string = this.getVisibleLabel(view, sibling.from, sibling.to);
					
					// Aliaset slukker prepend-ikonet sitt hvis lenken redigeres
					const shouldSkipBefore = isLinkOpenUnderCursor;
					
					const aliasDeco: Decoration = this.processLinkDecoration(file, specificTokenLabel, shouldSkipBefore, false);
					this.decorateRangeOnce(state, sibling.from, sibling.to, aliasDeco);
				}
				
				if (isPipeNode || isPathNode || isAliasNode) {
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

