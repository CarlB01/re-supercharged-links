import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewUpdate, WidgetType } from "@codemirror/view";
import { App, MarkdownView, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { fetchTargetAttributesSync } from "../processors/attribute-fetcher";
import { findMatchingRule } from "../processors/rule-sanitizer";
import { startsWithToken, endsWithToken, norm } from "../utils/string-utils";
import { extractCleanLinkPath, resolveLinkFile } from "./live-preview";

interface CodeMirrorNodeRef {
	name: string;
	from: number;
	to: number;
}

/**
 * 🟢 RUNTIME EMOJI WIDGET: Physical DOM factory that eradicates icon duplicates.
 */
class IconWidget extends WidgetType {
	constructor(private readonly icon: string, private readonly isBefore: boolean) {
		super();
	}

	toDOM(): HTMLElement {
		// 🔑 FIKSET (Linje 28): Bruker activeWindow.document for å unngå både linter-feil og HierarchyRequestError!
		const span = activeWindow.document.createElement("span");
		
		span.addClass(this.isBefore ? "scl-inline-icon-before" : "scl-inline-icon-after");
		span.setText(this.icon);

		// Linter-sikret stil-tildeling via prototype
		if (this.isBefore) {
			span.setCssStyles({ marginRight: "3px", display: "inline-block" });
		} else {
			span.setCssStyles({ marginLeft: "3px", display: "inline-block" });
		}

		return span;
	}


	eq(other: IconWidget): boolean {
		return other.icon === this.icon && other.isBefore === this.isBefore;
	}
}

/**
 * 🔑 THE BREAKTHROUGH DETECTOR: Direct node.name checking.
 */
function isCodeMirrorInternalLink(nodeName: string): boolean {
	const name = (nodeName || "").toLowerCase();
	return name.includes("link") || name.includes("hashtag") || name.includes("url") || name === "underline";
}

interface IterationState {
	builder: RangeSetBuilder<Decoration>;
	activeFileBasename: string;
	from: number;
	to: number;
	currentActiveAttributes: Record<string, string>;
	currentActiveClasses: string;
}

/**
 * 🚀 DECOUPLED CODE MIRROR ENGINE: Flat, high-performance view processor.
 */
export class CMViewPlugin {
	decorations: DecorationSet;
	app: App;
	plugin: ResuperchargedLinks;

	constructor(view: EditorView, app: App, plugin: ResuperchargedLinks) {
		this.app = app;
		this.plugin = plugin;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy(): void {}

	buildDecorations(view: EditorView, updateFrom = -1, updateTo = -1): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		if (!this.plugin.settings.enableEditor) return builder.finish();

		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView || !mdView.file) return builder.finish();

		const state: IterationState = {
			builder,
			activeFileBasename: mdView.file.basename,
			from: 0,
			to: 0,
			currentActiveAttributes: {},
			currentActiveClasses: ""
		};

		for (const { from, to } of view.visibleRanges) {
			if (updateFrom !== -1 && (to < updateFrom || from > updateTo)) continue;
			
			state.from = from;
			state.to = to;

			syntaxTree(view.state).iterate({
				from,
				to,
				enter: (node) => {
					this.processNodeToken(view, node, state, updateFrom, updateTo);
				}
			});
		}

		return builder.finish();
	}

	/**
	 * 🔑 THE GOLDEN SUBROUTINE: Processes nodes cleanly based on the stable node.name contract.
	 * 🛠️ FIKSET: Farger og stiler tildeles ALLTID, uavhengig av om ikonet skjules!
	 */
	/**
	 * 🔑 THE GOLDEN SUBROUTINE: Processes nodes cleanly based on the stable node.name contract.
	 */
	private processNodeToken(
		view: EditorView, 
		node: CodeMirrorNodeRef, 
		state: IterationState, 
		updateFrom: number, 
		updateTo: number
	): void {
		if (updateFrom !== -1 && (node.to < updateFrom || node.from > updateTo)) return;

		if (isCodeMirrorInternalLink(node.name)) {
			const rawLinkText = view.state.doc.sliceString(node.from, node.to);
			const linkText = extractCleanLinkPath(rawLinkText);
			
			// Fallback-beskyttelse: Hvis vi er midt i en endring og teksten er tom, hopper vi trygt over
			const activeText = linkText || state.activeFileBasename;

			const file = resolveLinkFile(this.app, activeText, state.activeFileBasename, node.name.toLowerCase().includes("url"));
			if (!file) return;

			const linkLabel = view.state.doc.sliceString(node.from, node.to).trim();
			const deco = this.processLinkDecoration(file, linkLabel);

			// 🔑 SIKRET UTPAKKING: Vi forteller linteren nøyaktig hvordan spec-objektet ser ut via en ukjent mellomlanding
			const specProxy = (deco as { spec?: { attributes?: Record<string, string>; class?: string } }).spec || {};
			
			state.currentActiveAttributes = specProxy.attributes || {};
			state.currentActiveClasses = specProxy.class || "";

			if (node.from >= state.from && node.to <= state.to) {
				const attrs = state.currentActiveAttributes;
				const iconBefore = attrs["data-scl-icon-before"] || "";
				const iconAfter = attrs["data-scl-icon-after"] || "";

				const skipBefore = state.currentActiveClasses.includes("scl-hide-before");
				const skipAfter = state.currentActiveClasses.includes("scl-hide-after");

				if (iconBefore && !skipBefore) {
					state.builder.add(node.from, node.from, Decoration.widget({ widget: new IconWidget(iconBefore, true), side: -1 }));
				}

				// 🚀 TVINGER FRAM FARGER: Denne linjen fargelegger lenken din i minnet uansett!
				state.builder.add(node.from, node.to, deco);

				if (iconAfter && !skipAfter) {
					state.builder.add(node.to, node.to, Decoration.widget({ widget: new IconWidget(iconAfter, false), side: 1 }));
				}
			}
		}
	}


	processLinkDecoration(file: TFile, linkLabel: string): Decoration {
		const rawAttrs = fetchTargetAttributesSync(this.app, this.plugin, file, true);
		const attributes: Record<string, string> = {};
		
		for (const key in rawAttrs) {
			if (Object.prototype.hasOwnProperty.call(rawAttrs, key) && rawAttrs[key] !== undefined) {
				attributes[`data-link-${key}`] = rawAttrs[key];
			}
		}

		const matchedRule = findMatchingRule(this.plugin.settings?.selectors, rawAttrs);
		const classList: string[] = ["data-link-text"];

		if (matchedRule) {
			// 🔑 DEKORASJONEN FÅR ALLTID TILDELT SIN UNIKE FARGEREGEL-UID HER
			classList.push(`scl-rule-${matchedRule.uid}`);

			const iconBefore = (matchedRule.iconBefore || "").trim();
			const iconAfter = (matchedRule.iconAfter || "").trim();

			if (iconBefore) {
				attributes["data-scl-icon-before"] = iconBefore;
				if (startsWithToken(linkLabel, iconBefore)) classList.push("scl-hide-before");
			}

			if (iconAfter) {
				attributes["data-scl-icon-after"] = iconAfter;
				if (endsWithToken(linkLabel, iconAfter)) classList.push("scl-hide-after");
			}

			if (iconAfter && !classList.includes("scl-hide-after") && linkLabel.length > 1) {
				const cleanedLabel = norm(linkLabel);
				const endsWithEmojiSymbol = /[\u2695\u26aa\u26ab\ud83d\udc65\ud83d\udc64\u2600-\u27bf]$/u.test(cleanedLabel);
				if (endsWithEmojiSymbol) classList.push("scl-hide-after");
			}
		}

		return Decoration.mark({ attributes, class: classList.filter(Boolean).join(" ") });
	}
}
