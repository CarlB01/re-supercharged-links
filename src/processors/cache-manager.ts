import { PluginPerformanceTracker } from "../telemetry";

/**
 * Encapsulates all metadata cache lifecycles, entry caps, and eviction logic.
 * Strictly free of 'any' or 'undefined' types to guarantee memory safety.
 */
export class AttributeCacheManager {
	private readonly attrCycleCache: Map<string, Record<string, string>>;
	private readonly attrCacheTouchedAt: Map<string, number> = new Map();
	private readonly recentPathTouches: Map<string, number> = new Map();
	private readonly performanceTracker: PluginPerformanceTracker;

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
		this.performanceTracker = tracker;
	}

	public touchAttrCacheKey(key: string): void {
		if (key.length === 0) return;
		this.attrCacheTouchedAt.set(key, Date.now());
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
}
