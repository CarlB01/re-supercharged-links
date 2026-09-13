import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewUpdate, WidgetType } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { fetchTargetAttributesSync } from "../processors/attribute-fetcher";
import { startsWithToken, endsWithToken, extractCleanLinkPath, cleanRuleValue, cleanAttributeKey, parseSpaceSeparatedTokens } from "../utils/string-utils";
import { resolveLinkFile } from "./live-preview";
import { CSSLink } from "../types/css-link";

interface CodeMirrorNodeRef {
	name: string;
	from: number;
	to: number;
}

/**
 * 🟢 RUNTIME EMOJI WIDGET: Physical DOM factory that renders inline rule icons.
 */
class IconWidget extends WidgetType {
	constructor(private readonly icon: string, private readonly isBefore: boolean) {
		super();
	}

	public toDOM(): HTMLElement {
		const span: HTMLElement = createEl("span");
		span.addClass("scl-inline-icon");
		span.addClass(this.isBefore ? "scl-inline-icon-before" : "scl-inline-icon-after");
		span.setText(this.icon);
		span.setCssStyles({ display: "inline-block" });
		return span;
	}

	public eq(other: IconWidget): boolean {
		return other.icon === this.icon && other.isBefore === this.isBefore;
	}
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
		if (!this.plugin.settings.enableEditor) return builder.finish();

		const mdView: MarkdownView | null = this.app.workspace.getActiveViewOfType(MarkdownView) ?? null;
		if (mdView === null || mdView.file === null) return builder.finish();

		const state: IterationState = {
			builder,
			activeFileBasename: mdView.file.basename,
			from: 0,
			to: 0
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

		if (isCodeMirrorInternalLink(node.name)) {
			const rawLinkText: string = view.state.doc.sliceString(node.from, node.to);
			const linkText: string = extractCleanLinkPath(rawLinkText);
			
			if (linkText.length === 0) return;

			const file: TFile | null = resolveLinkFile(this.app, linkText, state.activeFileBasename, node.name.toLowerCase().includes("url")) ?? null;
			if (file === null) return;

			if (file.basename === state.activeFileBasename && !rawLinkText.includes(state.activeFileBasename)) {
				return;
			}

			const linkLabel: string = view.state.doc.sliceString(node.from, node.to).trim();
			const deco: Decoration = this.processLinkDecoration(file, linkLabel);

			const specProxy: { attributes?: Record<string, string>; class?: string } = (deco as { spec?: { attributes?: Record<string, string>; class?: string } }).spec ?? {};
			const currentActiveAttributes: Record<string, string> = specProxy.attributes ?? {};
			const currentActiveClasses: string = specProxy.class ?? "";

			if (node.from >= state.from && node.to <= state.to) {
				const iconBefore: string = currentActiveAttributes["data-scl-icon-before"] ?? "";
				const iconAfter: string = currentActiveAttributes["data-scl-icon-after"] ?? "";

				const skipBefore: boolean = currentActiveClasses.includes("scl-hide-before");
				const skipAfter: boolean = currentActiveClasses.includes("scl-hide-after");

				if (iconBefore.length > 0 && !skipBefore) {
					state.builder.add(node.from, node.from, Decoration.widget({ widget: new IconWidget(iconBefore, true), side: -1 }));
				}

				state.builder.add(node.from, node.to, deco);

				if (iconAfter.length > 0 && !skipAfter) {
					state.builder.add(node.to, node.to, Decoration.widget({ widget: new IconWidget(iconAfter, false), side: 1 }));
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
			// 🔑 DECOUPLED STAGES: Use the consolidated text cleaners
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

		// 🔑 DECOUPLED STAGES: Use the clean space-separated parser for semantic chips injection
		const rawTagsField: string = rawAttrs["tags"] ?? "";
		const tagsArray: string[] = parseSpaceSeparatedTokens(rawTagsField);
		for (let j: number = 0; j < tagsArray.length; j++) {
			const cleanTag: string | null = tagsArray[j] ?? null;
			if (cleanTag !== null && cleanTag.length > 0) {
				classList.push(`scl-match-tag-${cleanTag}`);
			}
		}

		return Decoration.mark({ attributes, class: classList.filter((c: string): boolean => c.length > 0).join(" ") });
	}
}
