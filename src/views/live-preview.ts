import { Compartment, Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { App, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { CMViewPlugin } from "./cm-view-plugin";
import { CSSLink } from "../types/css-link";

export const themeCompartment: Compartment = new Compartment();

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
 * 🚀 REACTIVE IN-MEMORY THEME GENERATOR
 * Dynamically compiles system rules into an active CodeMirror theme instance.
 * ⚡ STRIPPED OVERHEAD: Streamlined dictionary engine loop removes redundant color fallback verification checks.
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

		const uid: string = rule.uid ?? "";
		if (uid.length === 0) continue; 

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
			const targetSelector: string = `& .data-link-text.scl-rule-${uid}, & .cm-underline.scl-rule-${uid}`;
			themeSpec[targetSelector] = ruleStyles;

			if (hasActiveBg) {
				const adjacentIconSelector: string = `& .scl-rule-${uid} ~ .scl-inline-icon, & .scl-inline-icon:has(+ .cm-hmd-internal-link .scl-rule-${uid})`;
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
