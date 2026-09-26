import { syntaxTree } from "@codemirror/language";
import { Compartment, Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../core/main";
import { resolveRuleResolution } from "../processors/rule-engine";
import { createInlineIconSpan, endsWithToken, extractCleanLinkPath, startsWithToken } from "../utils/shared-utils";
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
}

function isCodeMirrorInternalLink(nodeName: string): boolean {
	const name: string = (nodeName ?? "").toLowerCase();
	return (
		name.includes("link") || 
		name.includes("hashtag") || 
		name.includes("url") || 
		name === "underline" ||
		name.includes("hmd-internal-link")
	);
}

/**
 * Highly optimized inline icon element factory node for the CodeMirror viewport layer.
 */
export class IconWidget extends WidgetType {
	constructor(private readonly icon: string, private readonly isBefore: boolean) {
		super();
	}

	public eq(other: IconWidget): boolean {
		return other.icon === this.icon && other.isBefore === this.isBefore;
	}

	/**
	 * Natively constructs the DOM element node for the CodeMirror widget component.
	 * 🚀 LINTER COMPLIANT FACTORY: Invokes Obsidian's native global factory helper natively, 
	 * completely bypassing speculative document root injection bugs.
	 */
	public toDOM(view: EditorView): HTMLElement {
		const activeDoc: Document = view.dom.ownerDocument;
		return createInlineIconSpan(activeDoc, this.icon, this.isBefore);
	}
}

/**
 * Resolves abstract link targets to structural vault files with safe decoding matrices.
 */
export function resolveLinkFile(app: App, linkText: string, activeFileBasename: string, isExternalType: boolean): TFile | null {
	let file: TFile | null = app.metadataCache.getFirstLinkpathDest(linkText, activeFileBasename) ?? null;
	if (isExternalType && file === null) {
		const decoded: string = (() => { 
			try { 
				return decodeURIComponent(linkText); 
			} catch { 
				return ""; 
			} 
		})();
		if (decoded.length > 0) {
			const abstractFile = app.vault.getAbstractFileByPath(decoded);
			file = abstractFile instanceof TFile ? abstractFile : null;
		}
	}
	return file;
}

/**
 * Core rendering extension intercepting CodeMirror syntax trees to construct runtime link styling flags.
 */
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
		const mdView: MarkdownView | null = this.app.workspace.getActiveViewOfType(MarkdownView) ?? null;
		if (mdView === null || mdView.file === null) return builder.finish();

		const state: IterationState = {
			builder,
			activeFileBasename: mdView.file.basename,
			from: 0,
			to: 0,
			collectedDecos: [],
			// 🚀 FIXED INITIALIZATION: Instantiate the empty boundary tracking set cleanly
			processedRanges: new Set<string>()
		};

		const visibleRangesCount = view.visibleRanges.length;
		for (let i = 0; i < visibleRangesCount; i++) {
			const range = view.visibleRanges[i];
			if (!range) continue;
			
			const from = range.from;
			const to = range.to;

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
			const aSide: number = (a.value.spec as { side?: number })?.side ?? 0;
			const bSide: number = (b.value.spec as { side?: number })?.side ?? 0;
			return aSide - bSide;
		});

		const collectedCount = state.collectedDecos.length;
		for (let i = 0; i < collectedCount; i++) {
			const item = state.collectedDecos[i];
			if (item !== undefined && item !== null) {
				try {
					builder.add(item.from, item.to, item.value);
				} catch {
					continue;
				}
			}
		}

		return builder.finish();
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

		// 🚀 ANTI-DUPLICATION SHIELD: If this segment has already been aggregated by a parent link, drop it!
		const positionRangeKey = `${node.from}-${node.to}`;
		if (state.processedRanges.has(positionRangeKey)) return;

		if (isCodeMirrorInternalLink(node.name)) {
			let rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
			let linkText: string = extractCleanLinkPath(rawLinkText);
			
			if (linkText.length === 0) return;

			const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, nodeNameLower.includes("url")) ?? null;
			if (file === null) return;

			if (file.basename === state.activeFileBasename && !rawLinkText.includes(state.activeFileBasename) && !nodeNameLower.includes("hmd-internal-link")) {
				return;
			}

			const deco: Decoration = this.processLinkDecoration(file, file.basename);
			const specProxy: { attributes?: Record<string, string>; class?: string } = (deco as { spec?: { attributes?: Record<string, string>; class?: string } }).spec ?? {};
			const currentActiveAttributes: Record<string, string> = specProxy.attributes ?? {};
			const currentActiveClasses: string = specProxy.class ?? "";

			if (node.from >= state.from && node.to <= state.to) {
				const iconBefore: string = currentActiveAttributes["data-scl-icon-before"] ?? "";
				const iconAfter: string = currentActiveAttributes["data-scl-icon-after"] ?? "";
				const skipBefore: boolean = currentActiveClasses.includes("scl-hide-before");
				const skipAfter: boolean = currentActiveClasses.includes("scl-hide-after");

				const isPipeNode: boolean = nodeNameLower === "cm-link-alias-pipe" || nodeNameLower.includes("pipe");
				const isAliasNode: boolean = nodeNameLower === "cm-link-alias" || nodeNameLower.includes("link-alias");

				// 🚀 THE ARRAY HARMONIZATION BRIDGE:
				// Initialize clean local boundary anchors targeting the active token boundaries
				let targetFrom: number = node.from;
				let targetTo: number = node.to;

				const isBaseLinkNode: boolean = nodeNameLower.includes("hmd-internal-link") && !isPipeNode && !isAliasNode;

				// 🎯 FORWARD SCANNING TRANS-COUPLING: If we are currently handling a root internal link,
				// check if an alias token sequence follows immediately in the syntax tree matrix.
				if (isBaseLinkNode) {
					const tree = syntaxTree(view.state);
					let nextCheckPosisjon = node.to;
					let scanSequenceActive = true;

					while (scanSequenceActive && nextCheckPosisjon < state.to) {
						let foundAdjacentFragment = false;
						
						tree.iterate({
							from: nextCheckPosisjon,
							to: nextCheckPosisjon + 30, // Scan shallow forward slice window
							enter: (sibling: CodeMirrorNodeRef): void => {
								const sibName = sibling.name.toLowerCase();
								if (sibling.from === nextCheckPosisjon && (sibName.includes("alias") || sibName.includes("pipe") || sibName.includes("underline"))) {
									targetTo = sibling.to; // Push the append anchor boundary forward!
									nextCheckPosisjon = sibling.to;
									foundAdjacentFragment = true;
									
									// Lock this inner token out to dissolve duplicate widgetBuffers downstream
									state.processedRanges.add(`${sibling.from}-${sibling.to}`);
								}
							}
						});
						
						if (!foundAdjacentFragment) {
							scanSequenceActive = false;
						}
					}
				}

				// Push everything into the flat array for mathematical sorting
				if (iconBefore.length > 0 && !skipBefore && isBaseLinkNode) {
					state.collectedDecos.push({ 
						from: targetFrom, 
						to: targetFrom, 
						value: Decoration.widget({ widget: new IconWidget(iconBefore, true), side: -1 }) 
					});
				}

				// The mark style classes stretch over the full computed boundaries, wrapping the alias!
				state.collectedDecos.push({ 
					from: targetFrom, 
					to: targetTo, 
					value: deco 
				});

				if (iconAfter.length > 0 && !skipAfter && isBaseLinkNode) {
					// 🚀 ABSOLUTE BOUNDARY LOCK: Append widget is forced perfectly behind the final alias string character.
					state.collectedDecos.push({ 
						from: targetTo, 
						to: targetTo, 
						value: Decoration.widget({ widget: new IconWidget(iconAfter, false), side: 1 }) 
					});
				}
			}
		}
	}


	/**
	 * Generates a deeply isolated CodeMirror mark decoration unique to a distinct token node.
	 * 🚀 FIXED ADJACENT INHERITANCE BLEED: Enforces explicit memory decoupling on class arrays 
	 * and attribute record maps to prevent CodeMirror from blending adjacent inline links together.
	 */
	public processLinkDecoration(file: TFile, linkLabel: string): Decoration {
		// Fetch a fresh attribute state structure from our versioned global cache
		const rawAttrs: Record<string, string> = fetchTargetAttributesCached(
			this.app, 
			this.plugin, 
			file, 
			true, 
			this.plugin.attrCycleCache
		);
		
		// 🚀 INSTANCE ISOLATION channel: Deeply isolate the target attribute dictionary object per execution frame
		const attributes: Record<string, string> = {};
		for (const key in rawAttrs) {
			if (Object.prototype.hasOwnProperty.call(rawAttrs, key)) {
				const val: string = rawAttrs[key] || "";
				if (val.length > 0) {
					attributes[`data-link-${key}`] = val;
				}
			}
		}

		const isDark: boolean = document.body.classList.contains("theme-dark");

		// Evaluate our compiled predictive system rules against this isolated dataset
		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawAttrs,
			isDark,
			includeTagMatchClasses: true
		});

		// 🚀 MEMORY DECOUPLING: Spread the resolved class tokens into a completely brand new array instance
		// This strictly blocks adjacent nodes on the same line from inheriting shared array pointers in CodeMirror.
		const classList: string[] = Array.isArray(resolution.classes) ? [...resolution.classes] : ["data-link-text"];

		const resAttributes = Object.entries(resolution.attributes);
		const resAttributesCount = resAttributes.length;
		for (let i = 0; i < resAttributesCount; i++) {
			const entry = resAttributes[i];
			if (entry) {
				const attrKey: string = entry[0];
				const attrValue: string = entry[1];
				attributes[attrKey] = attrValue;
			}
		}

		const iconBefore: string = resolution.iconBefore;
		if (iconBefore.length > 0 && startsWithToken(linkLabel, iconBefore)) {
			classList.push("scl-hide-before");
		}

		const iconAfter: string = resolution.iconAfter;
		if (iconAfter.length > 0 && endsWithToken(linkLabel, iconAfter)) {
			classList.push("scl-hide-after");
		}

		// 🚀 MANDATORY FRESH ENVELOPE: Construct and return a pristine, un-shared Decoration mark instance
		return Decoration.mark({
			attributes: Object.assign({}, attributes), // Create a shallow copy of the attributes map
			class: classList.filter((c: string): boolean => c.length > 0).join(" ")
		});
	}

}

/**
 * 🚀 REACTIVE IN-MEMORY THEME GENERATOR
 * Dynamically compiles system rules into an active CodeMirror theme instance.
 */
export function createRuntimeEditorTheme(plugin: ResuperchargedLinks): Extension {
	const themeSpec: Record<string, Record<string, string>> = {};
	
	const pluginInstance: ResuperchargedLinks | null = plugin ?? null;
	if (pluginInstance === null) return EditorView.theme(themeSpec);

	const settingsProxy = pluginInstance.settings ?? null;
	if (settingsProxy === null) return EditorView.theme(themeSpec);

	const rawSelectors: CSSLink[] | null = settingsProxy.selectors ?? null;
	const selectors: CSSLink[] = Array.isArray(rawSelectors) ? rawSelectors : [];
	
	const isDark: boolean = document.body.classList.contains("theme-dark");
	const selectorsCount: number = selectors.length;

	for (let i: number = 0; i < selectorsCount; i++) {
		const rule: CSSLink | null = selectors[i] ?? null;
		if (rule === null) continue;

		const runtimeId: string = String(i);
		const ruleStyles: Record<string, string> = {};

		const textSelection: string = isDark ? (rule.darkColor ?? "") : (rule.lightColor ?? "");
		if (textSelection.length > 0) {
			ruleStyles["color"] = textSelection;
		}

		const bgSelection: string = isDark ? (rule.darkBgColor ?? "") : (rule.lightBgColor ?? "");
		const hasActiveBg: boolean = bgSelection.length > 0 && bgSelection !== "transparent";
		if (hasActiveBg) {
			ruleStyles["background-color"] = bgSelection;
		}

		const fontWeight: string = rule.fontWeight ?? "normal";
		if (fontWeight !== "normal") {
			ruleStyles["font-weight"] = fontWeight;
		}

		const fontStyle: string = rule.fontStyle ?? "normal";
		if (fontStyle === "italic") {
			ruleStyles["font-style"] = "italic";
		} else if (fontStyle === "underline") {
			ruleStyles["text-decoration"] = "underline";
		} else if (fontStyle === "line-through") {
			ruleStyles["text-decoration"] = "line-through";
		}

		if (Object.keys(ruleStyles).length > 0) {
			const targetSelector: string = `&.data-link-text.scl-rule-${runtimeId}, .scl-rule-${runtimeId} .cm-underline, .scl-rule-${runtimeId}`;
			themeSpec[targetSelector] = ruleStyles;

			if (hasActiveBg) {
				const adjacentIconSelector: string = `.scl-rule-${runtimeId} ~ .scl-inline-icon, .scl-inline-icon:has(+ .cm-hmd-internal-link .scl-rule-${runtimeId})`;
				themeSpec[adjacentIconSelector] = {
					"background-color": bgSelection
				};
			}
		}
	}

	return EditorView.theme(themeSpec);
}

/**
 * Assemblies the fully decoupled view tracking pipeline for live preview environments.
 */
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
