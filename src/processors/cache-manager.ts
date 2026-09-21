import { PluginPerformanceTracker } from "../telemetry";


/**
 * Encapsulates all metadata cache lifecycles, entry caps, and inverted path index logic.
 * Maintains an O(1) reverse indexing matrix to prevent costly O(N) linear key sweeps.
 */
export class AttributeCacheManager {
	private readonly attrCycleCache: Map<string, Record<string, string>>;
	private readonly attrCacheTouchedAt: Map<string, number> = new Map();
	private readonly recentPathTouches: Map<string, number> = new Map();
	private readonly telemetry: PluginPerformanceTracker;

	// 🚀 INVERTED PATH INDEX: Maps clean file paths to their specific active cache signatures
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

	/**
	 * Public access exposure to retrieve the live inverse path lookup matrix safely.
	 */
	public getPathIndex(): Map<string, Set<string>> {
		return this.pathIndex;
	}

	/**
	 * Tracks access metadata logs and populates the inverted mapping layer structurally.
	 */
	public touchAttrCacheKey(key: string): void {
		if (key.length === 0) return;
		this.attrCacheTouchedAt.set(key, Date.now());
	}

	/**
	 * Registers a fresh cache signature and links it directly to its structural file source path.
	 * ⚡ O(1) ENTRY HOOK: Invoked whenever fetchTargetAttributesCached populates a new record.
	 */
	public registerIndexedKey(path: string, key: string): void {
		if (path.length === 0 || key.length === 0) return;
		
		let set = this.pathIndex.get(path);
		if (!set) {
			set = new Set<string>();
			this.pathIndex.set(path, set);
		}
		set.add(key);
	}

	/**
	 * Cleans a distinct cache key directly from the inverted path index trackers.
	 */
	public removeKeyFromIndex(path: string, key: string): void {
		const set = this.pathIndex.get(path);
		if (set) {
			set.delete(key);
			if (set.size === 0) {
				this.pathIndex.delete(path);
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
		this.pathIndex.clear(); // 🚀 Keep index clean
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
				// Safely decouple path references from the index before deletion
				this.removeKeyFromIndexFromRawKey(key);
				this.attrCycleCache.delete(key);
				this.attrCacheTouchedAt.delete(key);
			}
		}

		if (this.attrCycleCache.size > this.ATTR_CACHE_MAX_ENTRIES) {
			const overflow: number = this.attrCycleCache.size - this.ATTR_CACHE_MAX_ENTRIES;
			const entries = Array.from(this.attrCacheTouchedAt.entries())
				.sort((a, b) => a[1] - b[1]);

			let removed: number = 0;
			for (const [key] of entries) {
				if (!this.attrCycleCache.has(key)) continue;
				this.removeKeyFromIndexFromRawKey(key);
				this.attrCycleCache.delete(key);
				this.attrCacheTouchedAt.delete(key);
				removed += 1;
				if (removed >= overflow) break;
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
			let removed: number = 0;
			for (const key of this.recentPathTouches.keys()) {
				this.recentPathTouches.delete(key);
				removed += 1;
				if (removed >= overflow) break;
			}
		}
	}

	/**
	 * Parses path strings backward out of versioned tracking structures to isolate index drops.
	 */
	private removeKeyFromIndexFromRawKey(key: string): void {
		// Key syntax format: "v[Version]::[Path]::[0/1]"
		const segments = key.split("::");
		if (segments.length >= 3) {
			const extractedPath = segments[1];
			if (extractedPath) {
				this.removeKeyFromIndex(extractedPath, key);
			}
		}
	}
}
