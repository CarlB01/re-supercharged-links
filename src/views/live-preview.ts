import { syntaxTree } from "@codemirror/language";
import { Compartment, Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../core/main";
import { resolveRuleResolution } from "../processors/rule-engine";
import { endsWithToken, extractCleanLinkPath, startsWithToken } from "../utils/shared-utils";
import { CSSLink } from "../types/css-link";
import { fetchTargetAttributesCached } from "../attribute-fetcher";

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
	public toDOM(): HTMLElement {
		const span: HTMLSpanElement = createEl("span", {
			cls: this.isBefore ? "scl-inline-icon scl-inline-icon-before" : "scl-inline-icon scl-inline-icon-after",
			text: this.icon
		});

		span.setAttribute("contenteditable", "false");
		span.setCssStyles({ display: "inline-block" });

		return span;
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
			collectedDecos: []
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
		if (nodeNameLower.includes("formatting-link")) {
			return;
		}

		if (isCodeMirrorInternalLink(node.name)) {
			let rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
			let linkText: string = extractCleanLinkPath(rawLinkText);
			
			const isExpandedPathNode: boolean = nodeNameLower.includes("has-alias");
			const isPipeNode: boolean = nodeNameLower === "cm-link-alias-pipe" || nodeNameLower.includes("pipe");
			const isAliasNode: boolean = nodeNameLower === "cm-link-alias" || nodeNameLower.includes("link-alias");
			const isStandardLinkNoAlias: boolean = nodeNameLower.includes("link") && !nodeNameLower.includes("alias") && !isPipeNode;
			const isCollapsedCombined: boolean = nodeNameLower.includes("hmd-internal-link_link-has-alias") || nodeNameLower.includes("hmd-internal-link_link-alias");
			
			const isFragment: boolean = isPipeNode || isAliasNode || isCollapsedCombined;
			if (isFragment || linkText.length === 0 || !this.app.metadataCache.getFirstLinkpathDest(linkText, state.activeFileBasename)) {
				try {
					const currentLine = view.state.doc.lineAt(node.from);
					const lineText: string = currentLine.text;
					const positionInLine: number = node.from - currentLine.from;
					
					const wikiLinkRegex: RegExp = /\[\[([^\]]+)\]\]/g;
					let match: RegExpExecArray | null = null;
					
					while ((match = wikiLinkRegex.exec(lineText)) !== null) {
						const startIdx: number = match.index;
						const endIdx: number = wikiLinkRegex.lastIndex;
						
						if (positionInLine >= startIdx && positionInLine <= endIdx) {
							const fullMatchedLink: string = match[0] ?? "";
							const resolvedPath: string = extractCleanLinkPath(fullMatchedLink);
							
							if (resolvedPath.length > 0) {
								linkText = resolvedPath;
								rawLinkText = fullMatchedLink;
							}
							break;
						}
					}
				} catch {
					return;
				}
			}

			if (linkText.length === 0) return;

			const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, nodeNameLower.includes("url")) ?? null;
			if (file === null) return;

			if (file.basename === state.activeFileBasename && !rawLinkText.includes(state.activeFileBasename) && !isFragment) {
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

				const canDrawBefore: boolean = isStandardLinkNoAlias || isExpandedPathNode || (isCollapsedCombined && !isAliasNode);
				if (iconBefore.length > 0 && !skipBefore && canDrawBefore) {
					state.collectedDecos.push({ 
						from: node.from, 
						to: node.from, 
						value: Decoration.widget({ widget: new IconWidget(iconBefore, true), side: -1 }) 
					});
				}

				state.collectedDecos.push({ 
					from: node.from, 
					to: node.to, 
					value: deco 
				});

				const canDrawAfter: boolean = isStandardLinkNoAlias || isAliasNode || isCollapsedCombined;
				if (iconAfter.length > 0 && !skipAfter && canDrawAfter) {
					state.collectedDecos.push({ 
						from: node.to, 
						to: node.to, 
						value: Decoration.widget({ widget: new IconWidget(iconAfter, false), side: 1 }) 
					});
				}
			}
		}
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
				const val: string = rawAttrs[key] || "";
				if (val.length > 0) {
					attributes[`data-link-${key}`] = val;
				}
			}
		}

		const isDark: boolean = document.body.classList.contains("theme-dark");

		const resolution = resolveRuleResolution({
			compiledRules: this.plugin.compiledRules,
			resolvedAttrs: rawAttrs,
			isDark,
			includeTagMatchClasses: true
		});

		const classList: string[] = [...resolution.classes];

		for (const [attrKey, attrValue] of Object.entries(resolution.attributes)) {
			attributes[attrKey] = attrValue;
		}

		const iconBefore: string = resolution.iconBefore;
		if (iconBefore.length > 0 && startsWithToken(linkLabel, iconBefore)) {
			classList.push("scl-hide-before");
		}

		const iconAfter: string = resolution.iconAfter;
		if (iconAfter.length > 0 && endsWithToken(linkLabel, iconAfter)) {
			classList.push("scl-hide-after");
		}

		return Decoration.mark({
			attributes,
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
