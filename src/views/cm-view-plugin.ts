// editor-decorations:
// transactions-buffer + sorting before flushing in one pass

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

// 🔑 ARCHITECTURAL INTERFACE: Extend the iteration state to hold a flat transaction memory array
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
		// 🔑 UNIVERSAL PROTOCOL: Live Preview editor extensions now run automatically out of the box,
		// completely free of legacy configuration switches.

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

		// 🔑 PRODUCTION-READY SORTING ROUTINE: Order all collected nodes strictly ascending by index position
		state.collectedDecos.sort((a, b) => {
			if (a.from !== b.from) return a.from - b.from;
			
			// If position markers match precisely, sort widgets by CodeMirror's structural layout side priority constants
			const aSide = (a.value.spec as { side?: number })?.side ?? 0;
			const bSide = (b.value.spec as { side?: number })?.side ?? 0;
			return aSide - bSide;
		});

		// ⚡ SAFE TRANSACTIONAL FLUSH: Commit the pre-sorted array sequentially into CodeMirror's native tree builder
		for (let i = 0; i < state.collectedDecos.length; i++) {
			const item = state.collectedDecos[i];
			if (item !== undefined && item !== null) {
				try {
					builder.add(item.from, item.to, item.value);
				} catch {
					// Fallback containment enclosure to trap volatile syntax transitions silently without crashing the workspace
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
		
		// 🔑 ARCHITECTURAL PROTOCOL: Completely bypass syntax formatting bracket wrappers
		if (nodeNameLower.includes("formatting-link")) {
			return;
		}

		if (isCodeMirrorInternalLink(node.name)) {
			let rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
			let linkText: string = extractCleanLinkPath(rawLinkText);
			
			// 🔑 FRAGMENT IDENTIFICATION MATRIX: Isolate each independent token node structural element cleanly
			const isExpandedPathNode: boolean = nodeNameLower.includes("has-alias");
			const isPipeNode: boolean = nodeNameLower === "cm-link-alias-pipe" || nodeNameLower.includes("pipe");
			const isAliasNode: boolean = nodeNameLower === "cm-link-alias" || nodeNameLower.includes("link-alias");
			const isStandardLinkNoAlias: boolean = nodeNameLower.includes("link") && !nodeNameLower.includes("alias") && !isPipeNode;

			// Determine if the formatting markup expression is hidden based on immediate adjacent node visibility bounds
			const isCollapsedCombined: boolean = nodeNameLower.includes("hmd-internal-link_link-has-alias") || nodeNameLower.includes("hmd-internal-link_link-alias");
			
			// 🔑 LINK TEXT RECONSTRUCTION: If evaluating an isolated fragment, pull structural text from the line string matrix
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

			// 🔑 ARCHITECTURAL FIX: Use the file's basename as the ground truth for styling lookups.
			// This guarantees that rules (colors, weights, decoration flags) apply symmetrically to all shards.
			const deco: Decoration = this.processLinkDecoration(file, file.basename);

			const specProxy: { attributes?: Record<string, string>; class?: string } = (deco as { spec?: { attributes?: Record<string, string>; class?: string } }).spec ?? {};
			const currentActiveAttributes: Record<string, string> = specProxy.attributes ?? {};
			const currentActiveClasses: string = specProxy.class ?? "";

			if (node.from >= state.from && node.to <= state.to) {
				const iconBefore: string = currentActiveAttributes["data-scl-icon-before"] ?? "";
				const iconAfter: string = currentActiveAttributes["data-scl-icon-after"] ?? "";

				const skipBefore: boolean = currentActiveClasses.includes("scl-hide-before");
				const skipAfter: boolean = currentActiveClasses.includes("scl-hide-after");

				// 🔑 STRICT WORK-SPLITTING RULESET: Prevent layout shifting and duplicate icon compilation
				// 1. Prepend icons belong exclusively to the initial boundary marker token
				const canDrawBefore: boolean = isStandardLinkNoAlias || isExpandedPathNode || (isCollapsedCombined && !isAliasNode);
				if (iconBefore.length > 0 && !skipBefore && canDrawBefore) {
					state.collectedDecos.push({ 
						from: node.from, 
						to: node.from, 
						value: Decoration.widget({ widget: new IconWidget(iconBefore, true), side: -1 }) 
					});
				}

				// Always apply style decoration mappings across every token fragment to guarantee absolute color uniformity
				state.collectedDecos.push({ 
					from: node.from, 
					to: node.to, 
					value: deco 
				});

				// 2. Append icons belong exclusively to the absolute trailing boundary marker token
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
			// ⚡ HIGH-PERFORMANCE ROUTE INDEXING: Map path strings perfectly using the unified tokens manager
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
				const uid: string = selector.uid ?? "";
				if (uid.length > 0) {
					classList.push(`scl-rule-${uid}`);
				}

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

		// 🔑 SEMANTIC CHIP CLASS INJECTION: Safely strip hash characters exclusively for valid class list naming architectures
		// === PHASE 4: MYBRAIN INTEROPERABILITY INJECTION ===
		const rawTagsField: string = rawAttrs["tags"] ?? "";
		const tagsArray: string[] = parseSpaceSeparatedTokens(rawTagsField);
		
		if (tagsArray.length > 0) {
			// 🔑 THE MYBRAIN CONTRACT CONDUIT: Force clean hash-prefixes into CodeMirror's active mark spec attributes
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
