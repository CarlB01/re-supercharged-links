import { Compartment } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { App, TFile } from "obsidian";
import ResuperchargedLinks from "../main";
import { CMViewPlugin } from "./cm-view-plugin";

export const themeCompartment = new Compartment();

export function extractCleanLinkPath(rawText: string): string {
	if (!rawText) return "";
	const parts = rawText.split("#");
	const firstPart = parts[0];
	return typeof firstPart === "string" ? firstPart.trim() : "";
}

export function resolveLinkFile(app: App, linkText: string, activeFileBasename: string, isExternalType: boolean): TFile | null {
	let file = app.metadataCache.getFirstLinkpathDest(linkText, activeFileBasename);
	if (isExternalType && !file) {
		const decoded = (() => { try { return decodeURIComponent(linkText); } catch { return ""; } })();
		if (decoded) {
			const abstractFile = app.vault.getAbstractFileByPath(decoded);
			file = abstractFile instanceof TFile ? abstractFile : null;
		}
	}
	return file;
}

/**
 * 🚀 REAKTIV MINNE-TEMA GENERATOR
 * Kobler fargene direkte til .data-link-text og .cm-underline.
 * Dette gjør fargene uovervinnelige mot Obsidians standardstiler, helt uten !important!
 */
export function createRuntimeEditorTheme(plugin: ResuperchargedLinks): any {
	const themeSpec: Record<string, Record<string, string>> = {};
	const selectors = plugin.settings?.selectors || [];
	const isDark = document.body.classList.contains("theme-dark");

	for (let i = 0; i < selectors.length; i++) {
		const rule = selectors[i];
		if (!rule) continue;

		const activeColor = isDark ? rule.darkColor : rule.lightColor;
		const activeBg = isDark ? rule.darkBgColor : rule.lightBgColor;
		
		// 🔑 FIKSET VEKT: Kobler fargeregelen eksplisitt til våre kjerne-klasser!
		// Dette garanterer at fargene overlever selv om ikonet blir deaktivert.
		const targetSelector = `& .data-link-text.scl-rule-${rule.uid}, & .cm-underline.scl-rule-${rule.uid}`;
		themeSpec[targetSelector] = {};

		if (activeColor) themeSpec[targetSelector]["color"] = activeColor;
		if (activeBg && activeBg !== "transparent") themeSpec[targetSelector]["background-color"] = activeBg;
		
		if (rule.fontWeight && rule.fontWeight !== "normal") themeSpec[targetSelector]["font-weight"] = rule.fontWeight;
		
		if (rule.fontStyle === "italic") {
			themeSpec[targetSelector]["font-style"] = "italic";
		} else if (rule.fontStyle === "underline") {
			themeSpec[targetSelector]["text-decoration"] = "underline";
		} else if (rule.fontStyle === "line-through") {
			themeSpec[targetSelector]["text-decoration"] = "line-through";
		}
	}

	return EditorView.theme(themeSpec);
}

export function buildCMViewPlugin(app: App, plugin: ResuperchargedLinks): any {
	return ViewPlugin.fromClass(
		class extends CMViewPlugin {
			constructor(view: EditorView) {
				super(view, app, plugin);
			}
		},
		{ decorations: (v) => v.decorations }
	);
}
