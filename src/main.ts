import { Plugin, debounce, TFile, Notice, App, MarkdownView } from 'obsidian';
import { Prec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SCLSettings } from './settings/settings';
import SCLSettingTab from './settings/setting-tab';
import { loadAndSanitizeSettings, saveStrippedSettings } from "./settings/settings-manager";

import { updateElLinks, updateVisibleLinks, updateContainer } from "./views/view-updaters";
import { buildCMViewPlugin, themeCompartment, createRuntimeEditorTheme } from './views/live-preview';
import { initViewObservers, initModalObservers, disconnectAllObservers, removeStylingFromViews } from './observers/observer-engine';
import { CSSLink } from './types/css-link';
import { invalidateByPath, invalidateByPrefix } from "./processors/attribute-fetcher";
/**
 * Structural contract defining Obsidian's internal CSS registry endpoints.
 * This bypasses type constraints safely without introducing global namespace pollution.
 */
interface ObsidianAppWithCustomCss {
	customCss?: {
		getSnippets(): string[];
		reloadCustomCss(): Promise<void>;
	};
}

/**
 * Structural contract mapping Obsidian's internal community plugin registry.
 * Allows safe verification of coexisting extensions without leaking global any types.
 */
interface ObsidianPluginRegistry {
	plugins?: {
		enabledPlugins?: Set<string>;
	};
}

interface ObsidianMarkdownViewWithCM {
	view: {
		editor?: {
			cm?: EditorView;
		};
	};
}

export default class ResuperchargedLinks extends Plugin {
	declare public settings: SCLSettings;
	public settingTab!: SCLSettingTab;
	public observers!: [MutationObserver, string, string][];
	public modalObservers!: MutationObserver[];
	public attrCycleCache!: Map<string, Record<string, string>>;
	public activeAttributesSet: Set<string> = new Set();
	private ruleConfigVersion: number = 0;
	private readonly pendingChangedPaths: Set<string> = new Set();
	private readonly pendingChangedPrefixes: Set<string> = new Set();

	private readonly recentPathTouches: Map<string, number> = new Map();
	private readonly PATH_TOUCH_PRUNE_AGE_MS = 10_000;
	private readonly PATH_TOUCH_MAX_ENTRIES = 2000;
	private readonly PATH_TOUCH_COOLDOWN_MS = 400;

	private readonly ATTR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
	private readonly ATTR_CACHE_MAX_ENTRIES = 4000;
	private readonly attrCacheTouchedAt: Map<string, number> = new Map();

	public touchAttrCacheKey(key: string): void {
		if (!key || key.length === 0) return;
		this.attrCacheTouchedAt.set(key, Date.now());
	}

	private pruneAttrCycleCache(nowTs: number): void {
		const cache = this.attrCycleCache;
		if (!cache || cache.size === 0) return;

		// 1) TTL prune
		for (const key of cache.keys()) {
			const ts = this.attrCacheTouchedAt.get(key);
			if (ts === undefined || nowTs - ts > this.ATTR_CACHE_TTL_MS) {
				cache.delete(key);
				this.attrCacheTouchedAt.delete(key);
			}
		}

		// 2) size-cap prune (eldste først)
		if (cache.size > this.ATTR_CACHE_MAX_ENTRIES) {
			const overflow = cache.size - this.ATTR_CACHE_MAX_ENTRIES;
			const entries = Array.from(this.attrCacheTouchedAt.entries())
				.sort((a, b) => a[1] - b[1]); // oldest first

			let removed = 0;
			for (const [key] of entries) {
				if (!cache.has(key)) continue;
				cache.delete(key);
				this.attrCacheTouchedAt.delete(key);
				removed++;
				if (removed >= overflow) break;
			}
		}
	}

	private pruneRecentPathTouches(nowTs: number): void {
		if (this.recentPathTouches.size === 0) return;
		
		// Age-based prune
		for (const [path, ts] of this.recentPathTouches) {
			if (nowTs - ts > this.PATH_TOUCH_PRUNE_AGE_MS) {
				this.recentPathTouches.delete(path);
			}
		}

		// Size cap fallback
		if (this.recentPathTouches.size > this.PATH_TOUCH_MAX_ENTRIES) {
			const overflow = this.recentPathTouches.size - this.PATH_TOUCH_MAX_ENTRIES;
			let removed = 0;
			for (const key of this.recentPathTouches.keys()) {
				this.recentPathTouches.delete(key);
				removed++;
				if (removed >= overflow) break;
			}
		}
	}

	private readonly scheduleVisibleRefresh = debounce((): void => {
		this.flushPendingRefresh();
	}, 180, true);

	private normalizePathForQueue(input: string): string {
		return (input ?? "").trim().replace(/^\/+/, "").toLowerCase();
	}

private queuePath(path: string): void {
	const normalized = this.normalizePathForQueue(path);
	if (normalized.length === 0) return;
	this.pendingChangedPaths.add(normalized);
}

	private queuePrefix(prefix: string): void {
		const normalized = this.normalizePathForQueue(prefix);
		if (normalized.length === 0) return;
		this.pendingChangedPrefixes.add(normalized.endsWith("/") ? normalized : `${normalized}/`);
	}

	private flushPendingRefresh(): void {
		const changedPaths: string[] = Array.from(this.pendingChangedPaths);
		const changedPrefixes: string[] = Array.from(this.pendingChangedPrefixes);

		if (changedPaths.length === 0 && changedPrefixes.length === 0) return;

		const nowTs = Date.now();
		this.pruneRecentPathTouches(nowTs);

		this.pruneAttrCycleCache(nowTs);
		this.pendingChangedPaths.clear();
		this.pendingChangedPrefixes.clear();

		const pathSet = new Set(changedPaths);

		// 👇 ny linje: fjern redundante child-prefixes
		const compactedPrefixes: string[] = this.compactPrefixes(changedPrefixes);
		const prefixSet = new Set(compactedPrefixes);

		updateVisibleLinks(this.app, this, { paths: pathSet, prefixes: prefixSet });
	}

	private compactPrefixes(prefixes: string[]): string[] {
		const sorted = Array.from(new Set(prefixes))
			.map((p) => p.endsWith("/") ? p : `${p}/`)
			.sort((a, b) => a.length - b.length);

		const out: string[] = [];
		for (const p of sorted) {
			const covered = out.some((parent) => p.startsWith(parent));
			if (!covered) out.push(p);
		}
		return out;
	}

	private markPathTouched(path: string): void {
		if (path.length === 0) return;
		this.recentPathTouches.set(path, Date.now());
	}

	private wasPathTouchedRecently(path: string): boolean {
		if (path.length === 0) return false;
		const last: number | undefined = this.recentPathTouches.get(path);
		if (last === undefined) return false;
		return Date.now() - last < this.PATH_TOUCH_COOLDOWN_MS;
	}
	public invalidateAttrCacheByPath(path: string): void {
		invalidateByPath(this.attrCycleCache, path);
		// lazy-sync: touched-map is cleaned in prune
	}

	public invalidateAttrCacheByPrefix(prefix: string): void {
		invalidateByPrefix(this.attrCycleCache, prefix);
		// lazy-sync: touched-map is cleaned in prune
	}

	public bumpRuleConfigVersion(): void {
		this.ruleConfigVersion += 1;
		this.clearAttrCycleCache();
	}

	public getRuleConfigVersion(): number {
		return this.ruleConfigVersion;
	}

	public clearAttrCycleCache(): void {
		const cache: Map<string, Record<string, string>> | null = this.attrCycleCache ?? null;
		if (cache !== null) cache.clear();
		this.attrCacheTouchedAt.clear();
	}

	public refreshEditorThemes(): void {
		const currentTheme = createRuntimeEditorTheme(this);
		this.app.workspace.iterateAllLeaves((leaf) => {
			const internalLeaf: ObsidianMarkdownViewWithCM = leaf as unknown as ObsidianMarkdownViewWithCM;
			const cm: EditorView | null = internalLeaf.view?.editor?.cm ?? null;
			
			if (cm !== null && typeof cm.dispatch === "function") {
				cm.dispatch({
					effects: themeCompartment.reconfigure(currentTheme)
				});
			}
		});
	}

	public async onload(): Promise<void> {
		this.observers = [];
		this.modalObservers = [];
		this.attrCycleCache = new Map();

		// Clean up legacy artifact files from disk channels
		await this.cleanupLegacySnippetFile();

		// Check for environmental runtime collisions with the legacy plugin
		this.detectPluginCollisions();
		
		// 🔑 STRICT PROTOCOL FIX: Enforce sequential data resolution BEFORE initializing UI tabs
		await this.loadSettings();
		this.compileActiveAttributes();
		
		// Wire the configuration tab safely now that states are hydrated
		this.settingTab = new SCLSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.registerMarkdownPostProcessor((el: HTMLElement, ctx) => {
			updateElLinks(this.app, this, el, ctx);
		});

		const updateLinksDebounced = debounce((_file: TFile | null) => {
			this.clearAttrCycleCache();
			updateVisibleLinks(this.app, this);
			this.refreshEditorThemes();

			const activeObservers: [MutationObserver, string, string][] = this.observers ?? [];
			activeObservers.forEach(([_, type, ownClass]) => {
				const leaves = this.app.workspace.getLeavesOfType(type);
				leaves.forEach(leaf => {
					if (leaf?.view?.containerEl) {
						updateContainer(leaf.view.containerEl, this, ownClass);
					}
				});
			});
		}, 300, true);

		const viewPluginInstance = buildCMViewPlugin(this.app, this);
		const initialTheme = createRuntimeEditorTheme(this);
		
		this.registerEditorExtension([
			Prec.lowest(viewPluginInstance),
			themeCompartment.of(initialTheme)
		]);

		this.app.workspace.onLayoutReady((): void => {
			this.clearAttrCycleCache();
			initViewObservers(this);
			initModalObservers(this, document);

			updateVisibleLinks(this.app, this);
			this.refreshEditorThemes();

			// Fix: first active LP leaf may miss initial paint on cold start
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const activeFile = activeView?.file ?? null;
			if (activeFile) {
				window.setTimeout((): void => {
					updateVisibleLinks(this.app, this, { paths: new Set([activeFile.path]) });
				}, 60);

				window.setTimeout((): void => {
					updateVisibleLinks(this.app, this, { paths: new Set([activeFile.path]) });
				}, 220);
			}

			window.setTimeout((): void => {
				updateVisibleLinks(this.app, this);
			}, 250);
		});

		this.registerEvent(this.app.workspace.on("window-open", (window) => {
			if (window?.getContainer()?.doc) {
				initModalObservers(this, window.getContainer().doc);
			}
		}));

		this.registerEvent(this.app.workspace.on("layout-change", (): void => {
			// 🔑 FAST-TRACK: Initialize observers instantly on layout change so file-properties are painted immediately
			initViewObservers(this);
			
			// Keep the debounce on the heavier asset cache updates to save CPU cycles
			updateLinksDebounced(null);
		}));

		this.registerEvent(this.app.vault.on("modify", (file): void => {
			if (!(file instanceof TFile)) return;

			this.invalidateAttrCacheByPath(file.path);
			this.markPathTouched(file.path);

			this.queuePath(file.path);
			this.scheduleVisibleRefresh();
		}));

		this.registerEvent(this.app.vault.on("delete", (file): void => {
			const path = (file as { path?: string }).path ?? "";
			if (path.length === 0) return;

			this.invalidateAttrCacheByPath(path);
			this.markPathTouched(path);

			this.queuePath(path);
			this.scheduleVisibleRefresh();
		}));

this.registerEvent(this.app.vault.on("rename", (file, oldPath): void => {
	const newPath = (file as { path?: string }).path ?? "";

	if (oldPath && oldPath.length > 0) {
		this.invalidateAttrCacheByPath(oldPath);
		this.markPathTouched(oldPath);
		this.queuePath(oldPath);
	}

	if (newPath.length > 0) {
		this.invalidateAttrCacheByPath(newPath);
		this.markPathTouched(newPath);
		this.queuePath(newPath);
	}

	if (oldPath.endsWith("/")) {
		this.invalidateAttrCacheByPrefix(oldPath);
		this.queuePrefix(oldPath);
	}

	if (newPath.endsWith("/")) {
		this.invalidateAttrCacheByPrefix(newPath);
		this.queuePrefix(newPath);
	}

	this.scheduleVisibleRefresh();
}));

		this.registerEvent(this.app.metadataCache.on("changed", (file: TFile): void => {
			if (this.wasPathTouchedRecently(file.path)) return;

			this.queuePath(file.path);
			this.scheduleVisibleRefresh();
		}));
	}
	
	public onunload(): void {
		disconnectAllObservers(this);
		removeStylingFromViews(this);
	}

	public compileActiveAttributes(): void {
		this.activeAttributesSet.clear();
		const selectorsProxy: CSSLink[] = this.settings?.selectors ?? [];
		if (Array.isArray(selectorsProxy)) {
			selectorsProxy.forEach((selector) => {
				if (selector?.type === "attribute" && selector.name) {
					this.activeAttributesSet.add(selector.name);
				}
			});
		}
	}

	public async loadSettings(): Promise<void> {
		// 🚀 ARCHITECTURAL DECOUPLING: Delegate ingestion, vasking and translation paths to the manager
		const { settings, dataRepaired } = await loadAndSanitizeSettings(this);
		this.settings = settings;

		// Force write back clean structure instantly if corrupted nodes were healed during ingestion
		if (dataRepaired) {
			await this.saveSettings();
		}
	}

	public async saveSettings(): Promise<void> {
		// 🚀 ARCHITECTURAL DECOUPLING: Delegate output stripping and serialization to the manager
		await saveStrippedSettings(this, this.settings);
	}
	
	private async cleanupLegacySnippetFile(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const configDir = this.app.vault.configDir;
			const snippetPath = `${configDir}/snippets/re-supercharged-links-gen.css`;

			const fileExists: boolean = await adapter.exists(snippetPath);
			if (fileExists) {
				await adapter.remove(snippetPath);
				
				const internalApp: ObsidianAppWithCustomCss = this.app as unknown as ObsidianAppWithCustomCss;
				if (internalApp.customCss && typeof internalApp.customCss.reloadCustomCss === "function") {
					await internalApp.customCss.reloadCustomCss();
				}
			}
		} catch (error) {
			const errorMessage: string = error instanceof Error ? error.message : "Unknown file system violation";
			new Notice(`Re-Supercharged Links: Failed to purge legacy snippet file (${errorMessage})`);
		}
	}

	private detectPluginCollisions(): void {
		try {
			const internalApp = this.app as App & ObsidianPluginRegistry;			const enabledPlugins: Set<string> | null = internalApp.plugins?.enabledPlugins ?? null;

			if (enabledPlugins !== null && enabledPlugins.has("supercharged-links")) {
				new Notice(
					"⚠️ Re-Supercharged Links Warning:\n" +
					"The original 'Supercharged Links' plugin is currently enabled. " +
					"Please disable it to prevent styling conflicts and layout lag.",
					10000
				);
			}
		} catch (error) {
			const violation: string = error instanceof Error ? error.name : "RegistryAccessViolation";
			void violation;
		}
	}
}
