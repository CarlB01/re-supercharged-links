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

		const positionRangeKey = `${node.from}-${node.to}`;
		if (state.processedRanges.has(positionRangeKey)) return;

		if (isCodeMirrorInternalLink(node.name)) {
			const rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
			const linkText: string = extractCleanLinkPath(rawLinkText);
			
			if (linkText.length === 0) return;

			const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, nodeNameLower.includes("url")) ?? null;
			if (file === null) return;

			if (file.basename === state.activeFileBasename && !rawLinkText.includes(state.activeFileBasename) && !nodeNameLower.includes("hmd-internal-link")) {
				return;
			}

			const isPipeNode: boolean = nodeNameLower === "cm-link-alias-pipe" || nodeNameLower.includes("pipe");
			const isAliasNode: boolean = nodeNameLower === "cm-link-alias" || nodeNameLower.includes("link-alias");
			const isBaseLinkNode: boolean = nodeNameLower.includes("hmd-internal-link") && !isPipeNode && !isAliasNode;

			let targetFrom: number = node.from;
			let targetTo: number = node.to;

			// Forward scanning tracker to reconstruct the full markup layout bounds and isolate aliases
			if (isBaseLinkNode) {
				const tree = syntaxTree(view.state);
				let nextCheckPosition = node.to;
				let scanSequenceActive = true;

				while (scanSequenceActive && nextCheckPosition < state.to) {
					let foundAdjacentFragment = false;
					
					tree.iterate({
						from: nextCheckPosition,
						to: nextCheckPosition + 30,
						enter: (sibling: CodeMirrorNodeRef): void => {
							const sibName = sibling.name.toLowerCase();
							if (sibling.from === nextCheckPosition && (sibName.includes("alias") || sibName.includes("pipe") || sibName.includes("underline"))) {
								targetTo = sibling.to;
								nextCheckPosition = sibling.to;
								foundAdjacentFragment = true;
								state.processedRanges.add(`${sibling.from}-${sibling.to}`);
							}
						}
					});
					
					if (!foundAdjacentFragment) {
						scanSequenceActive = false;
					}
				}
			}

			// 🚀 VISIBLE SLICE EXTRACTION: Pull the combined text inside the entire reconstructed link element
			const combinedText: string = view.state.doc.sliceString(targetFrom, targetTo);
			
			let calculatedVisibleText: string = file.basename;
			const pipeIndex = combinedText.indexOf("|");
			
			if (pipeIndex !== -1) {
				const aliasSegment = combinedText.substring(pipeIndex + 1).replace("]]", "").trim();
				if (aliasSegment.length > 0) {
					calculatedVisibleText = aliasSegment;
				}
			} else {
				calculatedVisibleText = extractCleanLinkPath(combinedText);
			}

			// Delegate execution tracking down to the centralized rule processor
			const deco: Decoration = this.processLinkDecoration(file, calculatedVisibleText);
			
			const specProxy: { attributes?: Record<string, string>; class?: string } = (deco as { spec?: { attributes?: Record<string, string>; class?: string } }).spec ?? {};
			const currentActiveAttributes: Record<string, string> = specProxy.attributes ?? {};
			const currentActiveClasses: string = specProxy.class ?? "";

			if (node.from >= state.from && node.to <= state.to) {
				const iconBefore: string = currentActiveAttributes["data-scl-icon-before"] ?? "";
				const iconAfter: string = currentActiveAttributes["data-scl-icon-after"] ?? "";
				const skipBefore: boolean = currentActiveClasses.includes("scl-hide-before");
				const skipAfter: boolean = currentActiveClasses.includes("scl-hide-after");

				if (iconBefore.length > 0 && !skipBefore && isBaseLinkNode) {
					state.collectedDecos.push({ 
						from: targetFrom, 
						to: targetFrom, 
						value: Decoration.widget({ widget: new IconWidget(iconBefore, true), side: -1 }) 
					});
				}

				state.collectedDecos.push({ 
					from: targetFrom, 
					to: targetTo, 
					value: deco 
				});

				if (iconAfter.length > 0 && !skipAfter && isBaseLinkNode) {
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
	 */
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
				const val: string = rawAttrs[key] || "";
				if (val.length > 0) {
					attributes[`data-link-${key}`] = val;
				}
			}
		}

		const isDark: boolean = document.body.classList.contains("theme-dark");

		// 🚀 Cleaned parameters passing exclusively the evaluated linkLabel text
		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawAttrs,
			isDark,
			includeTagMatchClasses: true,
			visibleText: linkLabel
		});

		const classList: string[] = Array.isArray(resolution.classes) ? [...(resolution.classes as string[])] : ["data-link-text"];

		const resAttributes = Object.entries(resolution.attributes);
		const resAttributesCount = resAttributes.length;
		for (let i = 0; i < resAttributesCount; i++) {
			const entry = resAttributes[i];
			if (entry !== undefined && entry !== null) {
				const attrKey: string = entry[0];
				const attrValue: string = entry[1];
				attributes[attrKey] = attrValue;
			}
		}

		return Decoration.mark({
			attributes: Object.assign({}, attributes),
			class: classList.filter((c: string): boolean => c.length > 0).join(" ")
		});
	}

}

/**
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
