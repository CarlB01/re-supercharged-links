import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { fetchTargetAttributesSync } from "../processors/attribute-fetcher";
import { startsWithToken, endsWithToken, extractCleanLinkPath, cleanRuleValue, cleanAttributeKey, parseSpaceSeparatedTokens } from "../utils/string-utils";
import { resolveLinkFile } from "./live-preview";
import { CSSLink } from "../types/css-link";
import { IconWidget } from "./components/icon-widget";

interface CodeMirrorNodeRef {
	name: string;
	from: number;
	to: number;
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

interface IterationState {
	builder: RangeSetBuilder<Decoration>;
	activeFileBasename: string;
	from: number;
	to: number;
	collectedDecos: { from: number; to: number; value: Decoration }[];
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
		const mdView: MarkdownView | null = this.app.workspace.getActiveViewOfType(MarkdownView) ?? null;
		if (mdView === null || mdView.file === null) return builder.finish();

		const state: IterationState = {
			builder,
			activeFileBasename: mdView.file.basename,
			from: 0,
			to: 0,
			collectedDecos: []
		};

		for (const { from, to } of view.visibleRanges) {
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
			const aSide = (a.value.spec as { side?: number })?.side ?? 0;
			const bSide = (b.value.spec as { side?: number })?.side ?? 0;
			return aSide - bSide;
		});

		for (let i = 0; i < state.collectedDecos.length; i++) {
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
		const rawAttrs: Record<string, string> = fetchTargetAttributesSync(this.app, this.plugin, file, true);
		const attributes: Record<string, string> = {};
		
		for (const key in rawAttrs) {
			if (Object.prototype.hasOwnProperty.call(rawAttrs, key)) {
				const val: string | undefined = rawAttrs[key];
				if (val !== undefined) {
					attributes[`data-link-${key}`] = val;
				}
			}
		}

		const selectorsConfig: CSSLink[] = this.plugin.settings?.selectors ?? [];
		const classList: string[] = ["data-link-text"];
		
		let activeIconBefore: string = "";
		let activeIconAfter: string = "";

		// 🔑 STYLE EXPORT BUCKETS: Track compiled visual styles to inject explicitly into the DOM layers
		let finalColor: string = "";
		let finalBg: string = "";
		let finalWeight: string = "normal";
		let finalStyle: string = "normal";

		const isDark: boolean = document.body.classList.contains("theme-dark");

		for (let i: number = 0; i < selectorsConfig.length; i++) {
			const selector: CSSLink | null = selectorsConfig[i] ?? null;
			if (selector === null) continue;

			let isMatch: boolean = false;
			const ruleValue: string = cleanRuleValue(selector.value);
			if (ruleValue.length === 0) continue;

			if (selector.type === "tag") {
				const rawTags: string = rawAttrs["tags"] ?? rawAttrs["data-link-tags"] ?? "";
				const cleanFileTags: string[] = parseSpaceSeparatedTokens(rawTags);
				if (cleanFileTags.includes(ruleValue)) isMatch = true;
			} 
			else if (selector.type === "path") {
				const rawPath: string = rawAttrs["path"] ?? rawAttrs["data-link-path"] ?? "";
				const cleanPath: string = (rawPath ?? "").toLowerCase().trim();
				if (cleanPath.includes(ruleValue)) isMatch = true;
			}
			else if (selector.type === "attribute") {
				const cleanKey: string = cleanAttributeKey(selector.name);
				if (cleanKey.length > 0) {
					const rawAttrVal: string = rawAttrs[cleanKey] ?? rawAttrs[`data-link-${cleanKey}`] ?? "";
					const cleanAttrVal: string = (rawAttrVal ?? "").toLowerCase().trim();
					if (cleanAttrVal === ruleValue) isMatch = true;
				}
			}

			if (isMatch) {
				// 🔑 RUNTIME COUPLING: Bind the rendering identifier sequentially to the index (i)
				classList.push(`scl-rule-${i}`);

				// Accumulate cascading style metrics over the active rule transaction layer
				const textSelection: string = isDark ? (selector.darkColor ?? "") : (selector.lightColor ?? "");
				if (textSelection.length > 0) finalColor = textSelection;

				const bgSelection: string = isDark ? (selector.darkBgColor ?? "") : (selector.lightBgColor ?? "");
				if (bgSelection.length > 0) finalBg = bgSelection;

				if (selector.fontWeight && selector.fontWeight !== "normal") finalWeight = selector.fontWeight;
				if (selector.fontStyle && selector.fontStyle !== "normal") finalStyle = selector.fontStyle;

				if ((selector.iconBefore ?? "").trim().length > 0) {
					activeIconBefore = (selector.iconBefore ?? "").trim();
				}
				if ((selector.iconAfter ?? "").trim().length > 0) {
					activeIconAfter = (selector.iconAfter ?? "").trim();
				}
			}
		}

		if (activeIconBefore.length > 0) {
			attributes["data-scl-icon-before"] = activeIconBefore;
			if (startsWithToken(linkLabel, activeIconBefore)) {
				classList.push("scl-hide-before");
			}
		}

		if (activeIconAfter.length > 0) {
			attributes["data-scl-icon-after"] = activeIconAfter;
			if (endsWithToken(linkLabel, activeIconAfter)) {
				classList.push("scl-hide-after");
			}
		}

		// 🔑 EXPLICIT VISUAL STYLE EXPORT: Hydrate attributes so styles are explicitly visible on the DOM
		if (finalColor.length > 0) attributes["data-link-color"] = finalColor;
		if (finalBg.length > 0 && finalBg !== "transparent") attributes["data-link-bg"] = finalBg;
		if (finalWeight !== "normal") attributes["data-link-weight"] = finalWeight;
		if (finalStyle !== "normal") attributes["data-link-style"] = finalStyle;

		// === PHASE 4: MYBRAIN INTEROPERABILITY INJECTION ===
		const rawTagsField: string = rawAttrs["tags"] ?? "";
		const tagsArray: string[] = parseSpaceSeparatedTokens(rawTagsField);
		
		if (tagsArray.length > 0) {
			attributes["data-link-tags"] = tagsArray.map((t: string): string => t.startsWith("#") ? t : `#${t}`).join(" ");
		}

		for (let j: number = 0; j < tagsArray.length; j++) {
			const cleanTag: string | null = tagsArray[j] ?? null;
			if (cleanTag !== null && cleanTag.length > 0) {
				const safeClassName: string = cleanTag.replace(/^#/, "");
				classList.push(`scl-match-tag-${safeClassName}`);
			}
		}

		return Decoration.mark({ attributes, class: classList.filter((c: string): boolean => c.length > 0).join(" ") });
	}

}
