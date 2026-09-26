// processors/cache-manager

import { PluginPerformanceTracker } from "../telemetry";
import { extractPathFromCacheKey, normalizeCachePath } from "../utils/shared-utils";

/**
 * Encapsulates all metadata cache lifecycles, entry caps, and inverted path index logic.
 * Maintains an O(1) reverse indexing matrix to prevent costly O(N) linear key sweeps.
 */
export class AttributeCacheManager {
	private readonly attrCycleCache: Map<string, Record<string, string>>;
	private readonly attrCacheTouchedAt: Map<string, number> = new Map();
	private readonly recentPathTouches: Map<string, number> = new Map();
	private readonly telemetry: PluginPerformanceTracker;

	// 🚀 INVERTED PATH INDEX: Maps file paths directly to their specific active cache signatures
	private readonly pathIndex: Map<string, Set<string>> = new Map();

	private readonly ATTR_CACHE_TTL_MS: number = 5 * 60 * 1000; // 5 min
	private readonly ATTR_CACHE_MAX_ENTRIES: number = 4000;
	private readonly PATH_TOUCH_PRUNE_AGE_MS: number = 10_000;
	private readonly PATH_TOUCH_MAX_ENTRIES: number = 2000;
	private readonly PATH_TOUCH_COOLDOWN_MS: number = 400;

	constructor(
		cacheMap: Map<string, Record<string, string>>, 
		tracker: PluginPerformanceTracker
	) {
		this.attrCycleCache = cacheMap;
		this.telemetry = tracker;
	}

	public getPathIndex(): Map<string, Set<string>> {
		return this.pathIndex;
	}

	public touchAttrCacheKey(key: string): void {
		if (key.length === 0) return;
		this.attrCacheTouchedAt.set(key, Date.now());
	}

	/**
	 * Registers a fresh cache signature and links it directly to its structural file source path.
	 */
	public registerIndexedKey(path: string, key: string): void {
		if (path.length === 0 || key.length === 0) return;
		
		const normalizedPath: string = normalizeCachePath(path);

		let set: Set<string> | null = this.pathIndex.get(path) ?? null;
		if (set === null) {
			set = new Set<string>();
			this.pathIndex.set(normalizedPath, set);
		}
		set.add(key);
	}

	/**
	 * Cleans a distinct cache key directly from the inverted path index trackers.
	 */
	public removeKeyFromIndex(path: string, key: string): void {
		if (path.length === 0 || key.length === 0) return;

		const normalizedPath: string = normalizeCachePath(path);

		const set: Set<string> | null = this.pathIndex.get(path) ?? null;
		if (set !== null) {
			set.delete(key);
			if (set.size === 0) {
				this.pathIndex.delete(path);
			}
		}
	}

	/**
	 * Evicts a specific file path from the live cache map and updates the inverted index structure.
	 */
	public invalidatePath(path: string): void {
		if (path.length === 0) return;
		
		const targetKeys: Set<string> | null = this.pathIndex.get(path) ?? null;

		if (targetKeys !== null) {
			const keysArray: string[] = Array.from(targetKeys);
			const keysLen: number = keysArray.length;

			for (let i = 0; i < keysLen; i++) {
				const key: string | null = keysArray[i] ?? null;
				if (key !== null) {
					this.attrCycleCache.delete(key);
					this.attrCacheTouchedAt.delete(key);
				}
			}
			this.pathIndex.delete(path);
		}
		this.recentPathTouches.delete(path);
	}

	/**
	 * Cascades downward through the inverted index keys to drop cache signatures originating under a folder prefix.
	 */
	public invalidatePrefix(prefix: string): void {
		if (prefix.length === 0) return;

		// 🚀 OPPDATERT: Bruker den sentraliserte felles-funksjonen for prefiksvask
		const normalizedPrefix: string = normalizeCachePath(prefix);
		const cleanPrefix: string = normalizedPrefix.endsWith("/") ? normalizedPrefix : `${normalizedPrefix}/`;

		const indexedPaths: string[] = Array.from(this.pathIndex.keys());
		const pathsLen: number = indexedPaths.length;

		for (let i = 0; i < pathsLen; i++) {
			const currentPath: string | null = indexedPaths[i] ?? null;
			if (currentPath !== null) {
				// 🚀 OPPDATERT: Bruker normalizeCachePath her også
				const cleanCurrent: string = normalizeCachePath(currentPath);
				if (cleanCurrent === normalizedPrefix || cleanCurrent.startsWith(cleanPrefix)) {
					this.invalidatePath(currentPath);
				}
			}
		}
	}


	public markPathTouched(path: string): void {
		if (path.length === 0) return;
		this.recentPathTouches.set(path, Date.now());
	}

	public wasPathTouchedRecently(path: string): boolean {
		if (path.length === 0) return false;
		const last: number = this.recentPathTouches.get(path) ?? 0;
		if (last === 0) return false;
		return Date.now() - last < this.PATH_TOUCH_COOLDOWN_MS;
	}

	public clearAllCache(): void {
		this.attrCycleCache.clear();
		this.attrCacheTouchedAt.clear();
		this.pathIndex.clear();
	}

	public runLifecyclePrune(): void {
		const nowTs: number = Date.now();
		this.pruneRecentPathTouches(nowTs);
		this.pruneAttrCycleCache(nowTs);
	}

	private pruneAttrCycleCache(nowTs: number): void {
		if (this.attrCycleCache.size === 0) return;

		for (const key of this.attrCycleCache.keys()) {
			const ts: number = this.attrCacheTouchedAt.get(key) ?? 0;
			if (ts === 0 || nowTs - ts > this.ATTR_CACHE_TTL_MS) {
				this.removeKeyFromIndexFromRawKey(key);
				this.attrCycleCache.delete(key);
				this.attrCacheTouchedAt.delete(key);
			}
		}

		if (this.attrCycleCache.size > this.ATTR_CACHE_MAX_ENTRIES) {
			const overflow: number = this.attrCycleCache.size - this.ATTR_CACHE_MAX_ENTRIES;
			const entries: [string, number][] = Array.from(this.attrCacheTouchedAt.entries())
				.sort((a, b) => a[1] - b[1]);

			let removed = 0;
			const entriesLen = entries.length;
			for (let i = 0; i < entriesLen; i++) {
				const entry: [string, number] | null = entries[i] ?? null;
				if (entry !== null) {
					const key: string = entry[0];
					if (!this.attrCycleCache.has(key)) continue;
					this.removeKeyFromIndexFromRawKey(key);
					this.attrCycleCache.delete(key);
					this.attrCacheTouchedAt.delete(key);
					removed += 1;
					if (removed >= overflow) break;
				}
			}
		}
	}

	private pruneRecentPathTouches(nowTs: number): void {
		if (this.recentPathTouches.size === 0) return;
		
		for (const [path, ts] of this.recentPathTouches) {
			if (nowTs - ts > this.PATH_TOUCH_PRUNE_AGE_MS) {
				this.recentPathTouches.delete(path);
			}
		}

		if (this.recentPathTouches.size > this.PATH_TOUCH_MAX_ENTRIES) {
			const overflow: number = this.recentPathTouches.size - this.PATH_TOUCH_MAX_ENTRIES;
			let removed = 0;
			const keys: string[] = Array.from(this.recentPathTouches.keys());
			const keysLen = keys.length;
			for (let i = 0; i < keysLen; i++) {
				const key: string | null = keys[i] ?? null;
				if (key !== null) {
					this.recentPathTouches.delete(key);
					removed += 1;
					if (removed >= overflow) break;
				}
			}
		}
	}

	private removeKeyFromIndexFromRawKey(key: string): void {
		const extractedPath: string | null = extractPathFromCacheKey(key);
		if (extractedPath !== null) {
			this.removeKeyFromIndex(extractedPath, key);
		}
	}
}
