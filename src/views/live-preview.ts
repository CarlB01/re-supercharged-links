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
 * Synchronously bridges backgrounds across isolated text markings and adjacent layout widgets (Phase 3).
 * STRICT PROTOCOL: Only emits active, explicit modifications. Defaults are completely ignored.
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

		// 🔑 STRICT PROTOCOL: Temporary style bucket for the current link rule
		const ruleStyles: Record<string, string> = {};

		// 1. Text Color: Only emit if a valid custom color is present
		const textSelection: string = isDark ? (rule.darkColor ?? "") : (rule.lightColor ?? "");
		if (textSelection.length > 0 && textSelection !== "#aa0000" && textSelection !== "#ff5555") {
			ruleStyles["color"] = textSelection;
		}

		// 2. Background Color: Only emit and track if it's an actual color modification
		const bgSelection: string = isDark ? (rule.darkBgColor ?? "") : (rule.lightBgColor ?? "");
		const hasActiveBg: boolean = bgSelection.length > 0 && bgSelection !== "transparent";
		if (hasActiveBg) {
			ruleStyles["background-color"] = bgSelection;
		}

		// 3. Font Weight: Only emit if it breaks away from standard text weights
		const fontWeight: string = rule.fontWeight ?? "normal";
		if (fontWeight !== "normal") {
			ruleStyles["font-weight"] = fontWeight;
		}

		// 4. Font Style & Decorations: Only emit explicit changes
		const fontStyle: string = rule.fontStyle ?? "normal";
		if (fontStyle === "italic") {
			ruleStyles["font-style"] = "italic";
		} else if (fontStyle === "underline") {
			ruleStyles["text-decoration"] = "underline";
		} else if (fontStyle === "line-through") {
			ruleStyles["text-decoration"] = "line-through";
		}

		// 🚀 THE BREAKTHROUGH: Only compile the link selectors if we actually have active modifications!
		if (Object.keys(ruleStyles).length > 0) {
			const targetSelector: string = `& .data-link-text.scl-rule-${uid}, & .cm-underline.scl-rule-${uid}`;
			themeSpec[targetSelector] = ruleStyles;

			// === PHASE 3: EDIT MODE WIDGET BACKGROUND HARMONIZATION ===
			// Only inject adjacent icon background rules if the link text itself has a background
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
