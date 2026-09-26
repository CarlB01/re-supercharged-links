import { App, MarkdownView, WorkspaceLeaf } from "obsidian";

interface LegacyStyleSystemApp {
	customCss?: {
		reloadCustomCss(): Promise<void>;
	};
}

interface ObsidianViewMetadataInternal {
	metadataEditor?: {
		contentEl?: HTMLElement;
	};
}

interface ObsidianLeafHeaderInternal {
	tabHeaderInnerTitleEl?: HTMLElement;
}

/**
 * 🔌 ADAPTER: Safely reloads Obsidian's internal custom CSS snippet registry.
 * Shields the core plugin from direct untyped app application lifecycle casts.
 */
export async function safeReloadCustomCss(app: App): Promise<void> {
	const internalApp = app as unknown as LegacyStyleSystemApp;
	if (internalApp.customCss !== null && internalApp.customCss !== undefined && typeof internalApp.customCss.reloadCustomCss === "function") {
		await internalApp.customCss.reloadCustomCss();
	}
}

/**
 * 🔌 ADAPTER: Extracts the hidden content HTMLElement layout layer from the metadata editor panel.
 * Shields downstream reconcilers from internal MarkdownView property mutations.
 */
export function getMetadataPaneElement(view: MarkdownView): HTMLElement | null {
	const internalView = view as unknown as ObsidianViewMetadataInternal;
	if (internalView.metadataEditor !== null && internalView.metadataEditor !== undefined) {
		return internalView.metadataEditor.contentEl ?? null;
	}
	return null;
}

/**
 * 🔌 ADAPTER: Extracts the private tab header inner title DOM element from a workspace leaf.
 * Shields interface engines from structural changes inside Obsidian's tab header layout tree.
 */
export function getTabHeaderElement(leaf: WorkspaceLeaf): HTMLElement | null {
	const internalLeaf = leaf as unknown as ObsidianLeafHeaderInternal;
	return internalLeaf.tabHeaderInnerTitleEl ?? null;
}